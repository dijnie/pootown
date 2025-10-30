use crate::constants::get_property_data;
use crate::error::GameError;
use crate::{state::*, PlayerBankrupt};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct DeclareBankruptcy<'info> {
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
        bump,
        constraint = !player_state.is_bankrupt @ GameError::BankruptcyAlreadyStarted
    )]
    pub player_state: Box<Account<'info, PlayerState>>,

    #[account(mut)]
    pub player: Signer<'info>,

    pub clock: Sysvar<'info, Clock>,
}

pub fn declare_bankruptcy_handler(ctx: Context<DeclareBankruptcy>) -> Result<()> {
    let game = &mut ctx.accounts.game;
    let player_state = &mut ctx.accounts.player_state;
    let player_pubkey = ctx.accounts.player.key();
    let clock = &ctx.accounts.clock;

    require!(!game.end_condition_met, GameError::GameAlreadyEnding);

    // Find player index in game.players vector
    let player_index = game
        .players
        .iter()
        .position(|&p| p == player_pubkey)
        .ok_or(GameError::PlayerNotFound)?;

    // Verify it's the player's turn or they need bankruptcy check
    // if game.current_turn != player_index as u8 && !player_state.needs_bankruptcy_check {
    //     return Err(GameError::NotPlayerTurn.into());
    // }

    player_state.is_bankrupt = true;

    let mut total_liquidation_value = 0u64;
    let mut houses_returned = 0u8;
    let mut hotels_returned = 0u8;

    // Process all properties owned by the player
    for &position in &player_state.properties_owned.clone() {
        // Get property from GameState
        let property = game.get_property_mut(position)?;

        // Verify this property belongs to the bankrupt player
        if property.owner == Some(player_pubkey) {
            // Get static property data for costs
            let property_data = get_property_data(position)?;

            // Calculate building liquidation value
            let building_value = calculate_building_liquidation_value(property, property_data)?;
            total_liquidation_value = total_liquidation_value
                .checked_add(building_value)
                .ok_or(GameError::ArithmeticOverflow)?;

            // Return buildings to bank
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

            // Calculate mortgage value if not already mortgaged
            if !property.is_mortgaged {
                let mortgage_value = property_data.mortgage_value;
                total_liquidation_value = total_liquidation_value
                    .checked_add(mortgage_value)
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

    // Add liquidation value to bank
    game.bank_balance = game
        .bank_balance
        .checked_add(total_liquidation_value)
        .ok_or(GameError::ArithmeticOverflow)?;

    // Clear bankruptcy check flag
    player_state.needs_bankruptcy_check = false;

    // Transfer all remaining cash to the bank
    let remaining_cash = player_state.cash_balance;
    game.bank_balance = game
        .bank_balance
        .checked_add(remaining_cash)
        .ok_or(GameError::ArithmeticOverflow)?;

    player_state.cash_balance = 0;
    player_state.net_worth = 0;
    player_state.properties_owned.clear();
    player_state.get_out_of_jail_cards = 0;

    // Clear all player flags and reset position
    reset_player_state_for_bankruptcy(player_state);

    // Remove player from active game
    remove_player_from_game(game, player_index as u8)?;

    // Update game timestamp
    game.turn_started_at = clock.unix_timestamp;

    msg!(
        "Player {} declared bankruptcy. Liquidated ${} in assets, ${} cash transferred to bank. {} houses and {} hotels returned to bank.",
        player_pubkey,
        total_liquidation_value,
        remaining_cash,
        houses_returned,
        hotels_returned
    );

    if game.check_bankruptcy_end_condition() {
        game.end_condition_met = true;
        game.end_reason = Some(GameEndReason::BankruptcyVictory);

        emit!(GameEndConditionMet {
            game: game.key(),
            reason: GameEndReason::TimeLimit,
            timestamp: clock.unix_timestamp,
        });

        // Find winner
        // if let Some(winner_pubkey) = game.get_active_players().first().copied() {
        //     game.winner = Some(winner_pubkey);

        //     msg!(
        //         "Game ended by bankruptcy victory. Winner: {}",
        //         winner_pubkey
        //     );

        //     emit!(GameEnded {
        //         game_id: game.game_id,
        //         winner: Some(winner_pubkey),
        //         reason: GameEndReason::BankruptcyVictory,
        //         winner_net_worth: None, // Can be calculated in claim_reward
        //         ended_at: clock.unix_timestamp,
        //     });
        // } else {
        //     msg!("Game ended with no remaining players");

        //     emit!(GameEnded {
        //         game_id: game.game_id,
        //         winner: None,
        //         reason: GameEndReason::BankruptcyVictory,
        //         winner_net_worth: None,
        //         ended_at: clock.unix_timestamp,
        //     });
        // }
    } else {
        // Advance to next turn
        game.advance_turn()?;
    }

    emit!(PlayerBankrupt {
        game: game.key(),
        player: player_pubkey,
        liquidation_value: total_liquidation_value,
        cash_transferred: remaining_cash,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

fn calculate_building_liquidation_value(
    property: &PropertyInfo,
    property_data: &crate::constants::PropertyData,
) -> Result<u64> {
    let mut value = 0u64;

    // Houses sell for half their cost
    if property.houses > 0 {
        let house_value = (property_data.house_cost / 2) * property.houses as u64;
        value = value
            .checked_add(house_value)
            .ok_or(GameError::ArithmeticOverflow)?;
    }

    // Hotels sell for half their cost (house_cost * 5 / 2)
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
    player_state.position = 0; // Reset to GO
    player_state.festival_boost_turns = 0;
    player_state.card_drawn_at = None;
}

fn remove_player_from_game(game: &mut GameState, player_index: u8) -> Result<()> {
    if (player_index as usize) < game.players.len() {
        // game.players[player_index as usize] = Pubkey::default();
        game.player_eliminated[player_index as usize] = true;
    }

    game.current_players = game
        .current_players
        .checked_sub(1)
        .ok_or(GameError::ArithmeticUnderflow)?;

    game.active_players = game
        .active_players
        .checked_sub(1)
        .ok_or(GameError::ArithmeticUnderflow)?;

    // Adjust current_turn if necessary
    game.advance_turn()?;
    // if game.current_turn >= game.current_players && game.current_players > 0 {
    //     game.current_turn = 0;
    // }

    msg!(
        "Player at index {} removed from game. Remaining players: {}",
        player_index,
        game.current_players
    );

    Ok(())
}
