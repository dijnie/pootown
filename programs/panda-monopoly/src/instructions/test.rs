use crate::constants::*;
use crate::error::GameError;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked},
};
use ephemeral_rollups_sdk::anchor::{commit, delegate};
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use ephemeral_rollups_sdk::ephem::commit_and_undelegate_accounts;

#[commit]
#[derive(Accounts)]
pub struct UndelegateGame<'info> {
    #[account(
        mut,
        seeds = [b"game", game.config_id.as_ref(), &game.game_id.to_le_bytes().as_ref()],
        bump,
        constraint = game.game_status == GameStatus::InProgress @ GameError::GameNotInProgress,
        constraint = game.current_players >= MIN_PLAYERS @ GameError::MinPlayersNotMet,
        constraint = authority.key() == game.creator @ GameError::Unauthorized,
    )]
    pub game: Box<Account<'info, GameState>>,

    #[account(mut)]
    pub authority: Signer<'info>,
}

pub fn undelegate_game_handler<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, UndelegateGame<'info>>,
) -> Result<()> {
    {
        let game = &mut ctx.accounts.game;
        // Change game status to in progress
        game.game_status = GameStatus::Finished;

        msg!("Game closed!");
    }

    {
        msg!("Start undelegate");

        let game = &ctx.accounts.game;
        let players = &game.players;

        game.exit(&crate::ID)?;
        commit_and_undelegate_accounts(
            &ctx.accounts.authority,
            vec![&game.to_account_info()],
            &ctx.accounts.magic_context,
            &ctx.accounts.magic_program,
        )?;

        let remaining_accounts_iter = &mut ctx.remaining_accounts.iter();

        // delegate player accounts
        for player_pubkey in players.iter() {
            let player_account = remaining_accounts_iter
                .next()
                .ok_or(GameError::InvalidAccount)?;
            player_account.exit(&crate::ID)?;

            commit_and_undelegate_accounts(
                &ctx.accounts.authority,
                vec![&player_account.to_account_info()],
                &ctx.accounts.magic_context,
                &ctx.accounts.magic_program,
            )?;

            msg!("Player {} undelegated", player_pubkey);
        }
    }

    msg!("Game undelegated!");

    Ok(())
}

#[derive(Accounts)]
pub struct CloseGame<'info> {
    #[account(
        mut,
        seeds = [b"game", game.config_id.as_ref(), &game.game_id.to_le_bytes().as_ref()],
        bump,
        constraint = game.game_status == GameStatus::InProgress @ GameError::GameNotInProgress,
        constraint = game.current_players >= MIN_PLAYERS @ GameError::MinPlayersNotMet,
        constraint = authority.key() == game.creator @ GameError::Unauthorized,
        close = authority
    )]
    pub game: Box<Account<'info, GameState>>,

    #[account(mut)]
    pub authority: Signer<'info>,
}

pub fn close_game_handler<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, CloseGame<'info>>,
) -> Result<()> {
    {
        msg!("Start close_game_handler");

        let remaining_accounts_iter = &mut ctx.remaining_accounts.iter();

        let game = &ctx.accounts.game;
        let authority = &ctx.accounts.authority;
        let players = &game.players;
        // delegate player accounts
        for player_pubkey in players.iter() {
            let player_account = remaining_accounts_iter
                .next()
                .ok_or(GameError::InvalidAccount)?;

            let pda_balance_before = player_account.get_lamports();

            msg!(
                "Player {} balance before: {}",
                player_pubkey,
                pda_balance_before
            );

            player_account.sub_lamports(pda_balance_before)?;
            authority.add_lamports(pda_balance_before)?;

            msg!("Player {} close", player_pubkey);
        }
    }

    msg!("Game closed!");

    Ok(())
}

#[derive(Accounts)]
pub struct ResetGame<'info> {
    #[account(
        mut,
        seeds = [b"game", game.config_id.as_ref(), &game.game_id.to_le_bytes().as_ref()],
        bump,
        constraint = game.game_status == GameStatus::InProgress @ GameError::GameNotInProgress,
        constraint = game.current_players >= MIN_PLAYERS @ GameError::MinPlayersNotMet,
        constraint = authority.key() == game.creator @ GameError::Unauthorized,
    )]
    pub game: Box<Account<'info, GameState>>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub clock: Sysvar<'info, Clock>,
}

pub fn reset_game_handler<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, ResetGame<'info>>,
) -> Result<()> {
    {
        let game = &mut ctx.accounts.game;
        let clock = &ctx.accounts.clock;

        // Change game status to in progress
        game.game_status = GameStatus::InProgress;
        game.current_turn = 0; // First player starts
        game.houses_remaining = TOTAL_HOUSES; // First player starts
        game.hotels_remaining = TOTAL_HOTELS; // First player starts
        game.bank_balance = 1_000_000; // First player starts
        game.winner = None; // First player starts
        game.active_trades = vec![]; // First player starts
        game.next_trade_id = 0; // First player starts
        game.turn_started_at = clock.unix_timestamp;

        // Reset all properties to unowned state
        for property in game.properties.iter_mut() {
            property.owner = None;
            property.houses = 0;
            property.has_hotel = false;
            property.is_mortgaged = false;
        }
    }

    {
        let remaining_accounts_iter = &mut ctx.remaining_accounts.iter();
        let game = &ctx.accounts.game;
        let clock = &ctx.accounts.clock;

        for _player_pubkey in game.players.iter() {
            let data_account_info = next_account_info(remaining_accounts_iter)?;
            require_eq!(data_account_info.is_writable, true);
            msg!(
                "Player data account: {} and {}",
                data_account_info.key(),
                _player_pubkey
            );

            let mut player_account = Account::<PlayerState>::try_from(data_account_info)?;

            player_account.cash_balance = STARTING_MONEY as u64;
            player_account.position = 0;
            player_account.in_jail = false;
            player_account.jail_turns = 0;
            player_account.doubles_count = 0;
            player_account.is_bankrupt = false;
            player_account.properties_owned = Vec::new();
            player_account.get_out_of_jail_cards = 0;
            player_account.net_worth = STARTING_MONEY as u64;
            player_account.last_rent_collected = clock.unix_timestamp;
            player_account.festival_boost_turns = 0;
            player_account.has_rolled_dice = false;
            player_account.last_dice_roll = [0, 0];
            player_account.needs_property_action = false;
            player_account.pending_property_position = None;
            player_account.needs_chance_card = false;
            player_account.needs_community_chest_card = false;
            player_account.needs_bankruptcy_check = false;
            player_account.needs_special_space_action = false;
            player_account.pending_special_space_position = None;
            player_account.card_drawn_at = None;

            player_account.exit(&crate::ID)?;

            msg!("Player {} reset", _player_pubkey);
        }
    }

    msg!("Game resetted!");

    Ok(())
}
