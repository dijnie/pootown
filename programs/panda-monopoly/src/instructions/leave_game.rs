// instructions/leave_game.rs
use crate::error::GameError;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
};

#[derive(Accounts)]
pub struct LeaveGame<'info> {
    #[account(
        mut,
        seeds = [b"game", game.config_id.as_ref(), &game.game_id.to_le_bytes()],
        bump = game.bump,
        constraint = game.game_status == GameStatus::WaitingForPlayers @ GameError::GameAlreadyStarted,
    )]
    pub game: Box<Account<'info, GameState>>,

    #[account(
        mut,
        seeds = [b"player", game.key().as_ref(), player.key().as_ref()],
        bump,
        close = player
    )]
    pub player_state: Box<Account<'info, PlayerState>>,

    #[account(mut)]
    pub player: Signer<'info>,

    /// CHECK: game authority PDA - validated in handler
    #[account(
        seeds = [crate::constants::GAME_AUTHORITY_SEED.as_ref()],
        bump,
    )]
    pub game_authority: UncheckedAccount<'info>,

    #[account(
        mint::token_program = token_program,
    )]
    pub token_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = player,
        associated_token::token_program = token_program
    )]
    pub player_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        token::mint = token_mint,
        token::authority = game_authority,
        token::token_program = token_program,
    )]
    pub token_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    pub token_program: Interface<'info, TokenInterface>,

    pub system_program: Program<'info, System>,
    pub clock: Sysvar<'info, Clock>,
}

pub fn leave_game_handler(ctx: Context<LeaveGame>) -> Result<()> {
    let game = &mut ctx.accounts.game;
    let player_pubkey = ctx.accounts.player.key();
    let clock = &ctx.accounts.clock;

    require!(
        game.creator != player_pubkey,
        GameError::CreatorCannotLeaveGame
    );

    let player_index = game
        .players
        .iter()
        .position(|&p| p == player_pubkey)
        .ok_or(GameError::PlayerNotFound)?;

    if game.entry_fee > 0 {
        let token_mint = &ctx.accounts.token_mint;
        let player_token_account = &ctx.accounts.player_token_account;
        let token_vault = &ctx.accounts.token_vault;
        let game_authority = &ctx.accounts.game_authority;

        let (expected_game_authority, game_authority_bump) =
            Pubkey::find_program_address(&[crate::constants::GAME_AUTHORITY_SEED], ctx.program_id);

        require!(
            game_authority.key() == expected_game_authority,
            GameError::InvalidGameAuthority
        );

        require!(
            Some(token_mint.key()) == game.token_mint,
            GameError::InvalidTokenAccount
        );
        require!(
            Some(token_vault.key()) == game.token_vault,
            GameError::InvalidTokenAccount
        );

        let authority_seeds = &[
            crate::constants::GAME_AUTHORITY_SEED,
            &[game_authority_bump],
        ];
        let signer_seeds = &[&authority_seeds[..]];

        let transfer_accounts = TransferChecked {
            from: token_vault.to_account_info(),
            mint: token_mint.to_account_info(),
            to: player_token_account.to_account_info(),
            authority: game_authority.to_account_info(),
        };

        let transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            transfer_accounts,
            signer_seeds,
        );

        transfer_checked(transfer_ctx, game.entry_fee, token_mint.decimals)?;

        game.total_prize_pool = game
            .total_prize_pool
            .checked_sub(game.entry_fee)
            .ok_or(GameError::ArithmeticUnderflow)?;

        msg!(
            "Entry fee {} refunded to player {}",
            game.entry_fee,
            player_pubkey
        );
    }

    game.players.remove(player_index);
    game.player_eliminated.remove(player_index);
    game.current_players = game
        .current_players
        .checked_sub(1)
        .ok_or(GameError::ArithmeticUnderflow)?;
    game.total_players = game
        .total_players
        .checked_sub(1)
        .ok_or(GameError::ArithmeticUnderflow)?;
    game.active_players = game
        .active_players
        .checked_sub(1)
        .ok_or(GameError::ArithmeticUnderflow)?;

    msg!(
        "Player {} left game. Remaining players: {}",
        player_pubkey,
        game.current_players
    );

    emit!(PlayerLeft {
        game: game.key(),
        player: player_pubkey,
        refund_amount: game.entry_fee,
        remaining_players: game.current_players,
        timestamp: clock.unix_timestamp,
    });

    // PlayerState account is automatically closed via close constraint

    Ok(())
}
