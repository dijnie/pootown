use crate::error::GameError;
use crate::{constants::*, force_end_turn_util, state::*};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct PayJailFine<'info> {
    #[account(
        mut,
        seeds = [b"game", game.config_id.as_ref(), &game.game_id.to_le_bytes().as_ref()],
        bump = game.bump,
        constraint = game.game_status == GameStatus::InProgress @ GameError::GameNotInProgress
    )]
    pub game: Box<Account<'info, GameState>>,

    #[account(
        mut,
        seeds = [b"player", game.key().as_ref(), player.key().as_ref()],
        bump
    )]
    pub player_state: Box<Account<'info, PlayerState>>,

    #[account(mut)]
    pub player: Signer<'info>,

    pub clock: Sysvar<'info, Clock>,
}

pub fn pay_jail_fine_handler(ctx: Context<PayJailFine>) -> Result<()> {
    let game = &mut ctx.accounts.game;
    let player_state = &mut ctx.accounts.player_state;
    let player_pubkey = ctx.accounts.player.key();
    let clock = &ctx.accounts.clock;

    // Validate it's the player's turn
    let player_index = game
        .players
        .iter()
        .position(|&p| p == player_pubkey)
        .ok_or(GameError::PlayerNotFound)?;

    if game.current_turn != player_index as u8 {
        return Err(GameError::NotPlayerTurn.into());
    }

    if !player_state.in_jail {
        return Err(GameError::PlayerNotInJail.into());
    }

    // Check if player has enough money
    if player_state.cash_balance < JAIL_FINE as u64 {
        player_state.needs_bankruptcy_check = true;
        return Ok(());
    }

    // Pay fine and release from jail
    player_state.cash_balance -= JAIL_FINE as u64;
    player_state.in_jail = false;
    player_state.jail_turns = 0;

    // End the turn after paying the fine
    force_end_turn_util(game, player_state, clock);

    msg!(
        "Player {} paid ${} jail fine and is released! Turn ended.",
        player_pubkey,
        JAIL_FINE
    );

    Ok(())
}

#[derive(Accounts)]
pub struct UseGetOutOfJailCard<'info> {
    #[account(
        mut,
        seeds = [b"game", game.config_id.as_ref(), &game.game_id.to_le_bytes().as_ref()],
        bump = game.bump,
        constraint = game.game_status == GameStatus::InProgress @ GameError::GameNotInProgress
    )]
    pub game: Box<Account<'info, GameState>>,

    #[account(
        mut,
        seeds = [b"player", game.key().as_ref(), player.key().as_ref()],
        bump
    )]
    pub player_state: Box<Account<'info, PlayerState>>,

    #[account(mut)]
    pub player: Signer<'info>,

    pub clock: Sysvar<'info, Clock>,
}

pub fn use_get_out_of_jail_card_handler(ctx: Context<UseGetOutOfJailCard>) -> Result<()> {
    let game = &mut ctx.accounts.game;
    let player_state = &mut ctx.accounts.player_state;
    let player_pubkey = ctx.accounts.player.key();
    let clock = &ctx.accounts.clock;

    // Validate it's the player's turn
    let player_index = game
        .players
        .iter()
        .position(|&p| p == player_pubkey)
        .ok_or(GameError::PlayerNotFound)?;

    if game.current_turn != player_index as u8 {
        return Err(GameError::NotPlayerTurn.into());
    }

    if !player_state.in_jail {
        return Err(GameError::PlayerNotInJail.into());
    }

    // Check if player has get out of jail cards
    if player_state.get_out_of_jail_cards == 0 {
        return Err(GameError::NoGetOutOfJailCards.into());
    }

    // Use the card and release from jail
    player_state.get_out_of_jail_cards -= 1;
    player_state.in_jail = false;
    player_state.jail_turns = 0;

    // End the turn after using the card
    force_end_turn_util(game, player_state, clock);

    msg!(
        "Player {} used a Get Out of Jail card and is released! Turn ended. Cards remaining: {}",
        player_pubkey,
        player_state.get_out_of_jail_cards
    );

    Ok(())
}