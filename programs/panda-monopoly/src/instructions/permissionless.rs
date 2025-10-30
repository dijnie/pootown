use crate::constants::*;
use crate::error::GameError;
use crate::state::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct ForceEndTurn<'info> {
    #[account(
        mut,
        seeds = [b"game", game.config_id.as_ref(), &game.game_id.to_le_bytes()],
        bump = game.bump,
        constraint = game.game_status == GameStatus::InProgress @ GameError::GameNotInProgress,
        constraint = game.timeout_enforcement_enabled @ GameError::TimeoutEnforcementDisabled,
    )]
    pub game: Box<Account<'info, GameState>>,

    #[account(
        mut,
        seeds = [b"player", game.key().as_ref(), timed_out_player.key().as_ref()],
        bump,
        constraint = !timed_out_player_state.is_bankrupt @ GameError::PlayerAlreadyBankrupt,
    )]
    pub timed_out_player_state: Box<Account<'info, PlayerState>>,

    /// CHECK: The player whose turn is being force-ended
    #[account(mut)]
    pub timed_out_player: UncheckedAccount<'info>,

    #[account(mut)]
    pub enforcer: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub clock: Sysvar<'info, Clock>,
}

pub fn force_end_turn_handler(ctx: Context<ForceEndTurn>) -> Result<()> {
    let game = &mut ctx.accounts.game;
    let player_state = &mut ctx.accounts.timed_out_player_state;
    let timed_out_player_pubkey = ctx.accounts.timed_out_player.key();
    let enforcer_pubkey = ctx.accounts.enforcer.key();
    let clock = &ctx.accounts.clock;

    let player_index = game
        .players
        .iter()
        .position(|&p| p == timed_out_player_pubkey)
        .ok_or(GameError::PlayerNotFound)?;

    require!(
        game.current_turn == player_index as u8,
        GameError::NotPlayerTurn
    );

    // 2. Calculate time elapsed since turn started
    let current_time = clock.unix_timestamp;
    let time_elapsed = current_time.saturating_sub(game.turn_started_at);

    // 3. Check grace period first
    require!(
        time_elapsed >= game.turn_grace_period_seconds as i64,
        GameError::GracePeriodNotExpired
    );

    // 4. Check if timeout has been reached
    require!(
        time_elapsed >= game.turn_timeout_seconds as i64,
        GameError::TimeoutNotReached
    );

    // 5. Verify player hasn't taken recent action
    let action_elapsed = current_time.saturating_sub(player_state.last_action_timestamp);
    require!(
        action_elapsed >= game.turn_grace_period_seconds as i64,
        GameError::PlayerHasRecentActivity
    );

    // 6. Increment penalty count
    player_state.timeout_penalty_count = player_state
        .timeout_penalty_count
        .checked_add(1)
        .ok_or(GameError::ArithmeticOverflow)?;

    player_state.total_timeout_penalties = player_state
        .total_timeout_penalties
        .checked_add(1)
        .ok_or(GameError::ArithmeticOverflow)?;

    msg!(
        "Player {} timed out. Penalty count: {}/{}",
        timed_out_player_pubkey,
        player_state.timeout_penalty_count,
        MAX_TIMEOUT_PENALTIES
    );

    // 7. Reset turn-specific flags (simulate "do nothing" action)
    player_state.has_rolled_dice = false;
    player_state.needs_property_action = false;
    player_state.pending_property_position = None;
    player_state.needs_chance_card = false;
    player_state.needs_community_chest_card = false;
    player_state.needs_special_space_action = false;
    player_state.pending_special_space_position = None;
    player_state.doubles_count = 0;

    // 8. If player needed bankruptcy check, force it
    if player_state.needs_bankruptcy_check {
        msg!("Player has pending bankruptcy - will be handled separately");
        // Note: This should trigger force_bankruptcy_for_timeout instead
        return Err(GameError::MustDeclareBankruptcy.into());
    }

    // 10. Advance to next player
    let next_turn = find_next_active_player(game, game.current_turn)?;
    game.current_turn = next_turn;
    game.turn_started_at = clock.unix_timestamp;

    msg!(
        "Turn force-ended. Next player: {} (index {})",
        game.players[next_turn as usize],
        next_turn
    );

    // 11. Emit events
    emit!(TimeoutPenalty {
        game: game.key(),
        player: timed_out_player_pubkey,
        penalty_count: player_state.timeout_penalty_count,
        enforcer: enforcer_pubkey,
        timestamp: current_time,
    });

    emit!(ForcedTurnEnd {
        game: game.key(),
        timed_out_player: timed_out_player_pubkey,
        next_player: game.players[next_turn as usize],
        enforcer: enforcer_pubkey,
        timestamp: current_time,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct ForceBankruptcyForTimeout<'info> {
    #[account(
        mut,
        seeds = [b"game", game.config_id.as_ref(), &game.game_id.to_le_bytes()],
        bump = game.bump,
        constraint = game.game_status == GameStatus::InProgress @ GameError::GameNotInProgress,
        constraint = game.timeout_enforcement_enabled @ GameError::TimeoutEnforcementDisabled,
    )]
    pub game: Box<Account<'info, GameState>>,

    #[account(
        mut,
        seeds = [b"player", game.key().as_ref(), timed_out_player.key().as_ref()],
        bump,
        constraint = !timed_out_player_state.is_bankrupt @ GameError::PlayerAlreadyBankrupt,
        constraint = timed_out_player_state.timeout_penalty_count >= MAX_TIMEOUT_PENALTIES @ GameError::InsufficientTimeoutPenalties,
    )]
    pub timed_out_player_state: Box<Account<'info, PlayerState>>,

    /// CHECK: The player being bankrupted
    #[account(mut)]
    pub timed_out_player: UncheckedAccount<'info>,

    #[account(mut)]
    pub enforcer: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub clock: Sysvar<'info, Clock>,
}

pub fn force_bankruptcy_for_timeout_handler(ctx: Context<ForceBankruptcyForTimeout>) -> Result<()> {
    let game = &mut ctx.accounts.game;
    let player_state = &mut ctx.accounts.timed_out_player_state;
    let timed_out_player_pubkey = ctx.accounts.timed_out_player.key();
    let enforcer_pubkey = ctx.accounts.enforcer.key();
    let clock = &ctx.accounts.clock;

    require!(
        player_state.timeout_penalty_count >= MAX_TIMEOUT_PENALTIES,
        GameError::InsufficientTimeoutPenalties
    );

    msg!(
        "Forcing bankruptcy for player {} due to {} timeout penalties",
        timed_out_player_pubkey,
        player_state.timeout_penalty_count
    );

    let player_index = game
        .players
        .iter()
        .position(|&p| p == timed_out_player_pubkey)
        .ok_or(GameError::PlayerNotFound)?;

    // 3. Execute bankruptcy logic
    execute_bankruptcy(game, player_state, timed_out_player_pubkey)?;

    // 4. Remove player from game
    remove_player_from_game(game, player_index as u8)?;

    // 5. Check if game should end
    if check_game_end_condition(game) {
        game.game_status = GameStatus::Finished;

        if let Some(winner_pubkey) = game
            .players
            .iter()
            .find(|&&p| p != Pubkey::default())
            .copied()
        {
            game.winner = Some(winner_pubkey);
            msg!("Game ended. Winner: {}", winner_pubkey);

            emit!(GameEnded {
                game: game.key(),
                winner: Some(winner_pubkey),
                ended_at: clock.unix_timestamp,
                reason: GameEndReason::BankruptcyVictory,
                winner_net_worth: None,
            });
        }
    } else {
        // Adjust turn if necessary
        // if game.current_turn >= game.current_players && game.current_players > 0 {
        //     game.current_turn = 0;
        // }
        // game.turn_started_at = clock.unix_timestamp;
        game.advance_turn()?;
    }

    // 6. Emit events
    emit!(TimeoutBankruptcy {
        game: game.key(),
        player: timed_out_player_pubkey,
        total_penalties: player_state.timeout_penalty_count,
        enforcer: enforcer_pubkey,
        timestamp: clock.unix_timestamp,
    });

    emit!(PlayerBankrupt {
        game: game.key(),
        player: timed_out_player_pubkey,
        liquidation_value: 0, // Already handled in execute_bankruptcy
        cash_transferred: 0,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

fn find_next_active_player(game: &GameState, current_turn: u8) -> Result<u8> {
    let total_players = game.players.len() as u8;
    let mut next_turn = (current_turn + 1) % total_players;
    let mut attempts = 0;

    // Search for next active player
    while attempts < total_players {
        if game.players[next_turn as usize] != Pubkey::default() {
            return Ok(next_turn);
        }
        next_turn = (next_turn + 1) % total_players;
        attempts += 1;
    }

    Err(GameError::NoActivePlayersRemaining.into())
}

/// Execute bankruptcy process (extracted from declare_bankruptcy)
fn execute_bankruptcy(
    game: &mut GameState,
    player_state: &mut PlayerState,
    player_pubkey: Pubkey,
) -> Result<()> {
    // Mark player as bankrupt
    player_state.is_bankrupt = true;

    // Calculate total liquidation value
    let mut total_liquidation_value = 0u64;
    let mut houses_returned = 0u8;
    let mut hotels_returned = 0u8;

    // Process all properties
    for &position in &player_state.properties_owned.clone() {
        let property = game.get_property_mut(position)?;

        if property.owner == Some(player_pubkey) {
            let property_data = crate::constants::get_property_data(position)?;

            // Calculate building value
            let building_value = calculate_building_liquidation_value(property, property_data)?;
            total_liquidation_value = total_liquidation_value
                .checked_add(building_value)
                .ok_or(GameError::ArithmeticOverflow)?;

            // Return buildings
            if property.houses > 0 {
                houses_returned = houses_returned
                    .checked_add(property.houses)
                    .ok_or(GameError::ArithmeticOverflow)?;
                property.houses = 0;
            }

            if property.has_hotel {
                hotels_returned = hotels_returned
                    .checked_add(1)
                    .ok_or(GameError::ArithmeticOverflow)?;
                property.has_hotel = false;
            }

            // Add mortgage value
            if !property.is_mortgaged {
                total_liquidation_value = total_liquidation_value
                    .checked_add(property_data.mortgage_value)
                    .ok_or(GameError::ArithmeticOverflow)?;
            }

            // Clear ownership
            property.owner = None;
            property.is_mortgaged = false;
        }
    }

    // Return buildings to bank
    game.houses_remaining = game
        .houses_remaining
        .checked_add(houses_returned)
        .ok_or(GameError::ArithmeticOverflow)?;

    game.hotels_remaining = game
        .hotels_remaining
        .checked_add(hotels_returned)
        .ok_or(GameError::ArithmeticOverflow)?;

    // Add to bank balance
    let remaining_cash = player_state.cash_balance;
    game.bank_balance = game
        .bank_balance
        .checked_add(total_liquidation_value)
        .unwrap()
        .checked_add(remaining_cash)
        .ok_or(GameError::ArithmeticOverflow)?;

    // Clear player state
    player_state.cash_balance = 0;
    player_state.net_worth = 0;
    player_state.properties_owned.clear();
    player_state.get_out_of_jail_cards = 0;
    reset_player_state_for_bankruptcy(player_state);

    msg!(
        "Player {} bankrupted. Liquidated ${}, ${} cash, {} houses, {} hotels",
        player_pubkey,
        total_liquidation_value,
        remaining_cash,
        houses_returned,
        hotels_returned
    );

    Ok(())
}

fn calculate_building_liquidation_value(
    property: &PropertyInfo,
    property_data: &crate::constants::PropertyData,
) -> Result<u64> {
    let mut value = 0u64;

    if property.houses > 0 {
        let house_value = (property_data.house_cost / 2) * property.houses as u64;
        value = value
            .checked_add(house_value)
            .ok_or(GameError::ArithmeticOverflow)?;
    }

    if property.has_hotel {
        let hotel_value = (property_data.house_cost * 5) / 2;
        value = value
            .checked_add(hotel_value)
            .ok_or(GameError::ArithmeticOverflow)?;
    }

    Ok(value)
}

fn reset_player_state_for_bankruptcy(player_state: &mut PlayerState) {
    player_state.has_rolled_dice = false;
    player_state.needs_property_action = false;
    player_state.pending_property_position = None;
    player_state.needs_chance_card = false;
    player_state.needs_community_chest_card = false;
    player_state.needs_special_space_action = false;
    player_state.pending_special_space_position = None;
    player_state.doubles_count = 0;
    player_state.in_jail = false;
    player_state.jail_turns = 0;
    player_state.position = 0;
    player_state.festival_boost_turns = 0;
    player_state.card_drawn_at = None;
    player_state.needs_bankruptcy_check = false;
}

fn remove_player_from_game(game: &mut GameState, player_index: u8) -> Result<()> {
    if (player_index as usize) < game.players.len() {
        game.players[player_index as usize] = Pubkey::default();
    }

    game.current_players = game
        .current_players
        .checked_sub(1)
        .ok_or(GameError::ArithmeticUnderflow)?;

    Ok(())
}

fn check_game_end_condition(game: &GameState) -> bool {
    let active_count = game
        .players
        .iter()
        .filter(|&&p| p != Pubkey::default())
        .count();
    active_count <= 1
}
