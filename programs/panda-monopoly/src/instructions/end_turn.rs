use crate::error::GameError;
use crate::state::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct EndTurn<'info> {
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

pub fn end_turn_handler(ctx: Context<EndTurn>) -> Result<()> {
    let game = &mut ctx.accounts.game;
    let player_state = &mut ctx.accounts.player_state;
    let player_pubkey = ctx.accounts.player.key();
    let clock = &ctx.accounts.clock;

    // Find player index in game.players vector
    let player_index = game
        .players
        .iter()
        .position(|&p| p == player_pubkey)
        .ok_or(GameError::PlayerNotFound)?;

    // Verify it's the current player's turn
    if game.current_turn != player_index as u8 {
        return Err(GameError::NotPlayerTurn.into());
    }

    // Verify player has rolled dice
    if !player_state.has_rolled_dice {
        return Err(GameError::HasNotRolledDice.into());
    }

    // Check if player has pending actions that must be completed
    if player_state.needs_property_action {
        return Err(GameError::MustHandleSpecialSpace.into());
    }

    if player_state.needs_chance_card {
        return Err(GameError::MustHandleSpecialSpace.into());
    }

    if player_state.needs_community_chest_card {
        return Err(GameError::MustHandleSpecialSpace.into());
    }

    if player_state.needs_bankruptcy_check {
        return Err(GameError::MustDeclareBankruptcy.into());
    }

    player_state.record_action(clock);

    if game.check_time_end_condition(clock.unix_timestamp) {
        msg!("Time limit reached! Game should be ended via end_game instruction.");
        game.end_condition_met = true;
        game.end_reason = Some(GameEndReason::TimeLimit);

        emit!(GameEndConditionMet {
            game: game.key(),
            reason: GameEndReason::TimeLimit,
            timestamp: clock.unix_timestamp,
        });
    }

    player_state.has_rolled_dice = false;
    player_state.needs_property_action = false;
    player_state.pending_property_position = None;
    player_state.needs_chance_card = false;
    player_state.needs_community_chest_card = false;
    player_state.needs_bankruptcy_check = false;
    // Advance to next player
    player_state.doubles_count = 0; // Reset doubles count
                                    //let next_turn = (game.current_turn + 1) % game.current_players;
                                    // game.current_turn = next_turn;
    game.advance_turn()?;
    game.turn_started_at = clock.unix_timestamp;

    msg!("Turn ended. Next turn: Player {}", game.current_turn);

    Ok(())
}
