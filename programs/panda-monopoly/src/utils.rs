use anchor_lang::prelude::*;

use crate::{
    error::GameError, get_property_data, ColorGroup, GameState, PlayerState, PropertyType,
    SpecialSpaceAction, JAIL_POSITION,
};

// Helper function for rent calculation
// pub fn calculate_rent_for_property(
//     property_state: &PropertyState,
//     owner_state: &PlayerState,
//     dice_result: [u8; 2],
// ) -> Result<u64> {
//     match property_state.property_type {
//         PropertyType::Street => {
//             if property_state.has_hotel {
//                 Ok(property_state.rent_with_hotel as u64)
//             } else if property_state.houses > 0 {
//                 let house_index = (property_state.houses - 1) as usize;
//                 if house_index < property_state.rent_with_houses.len() {
//                     Ok(property_state.rent_with_houses[house_index] as u64)
//                 } else {
//                     Err(GameError::InvalidHouseCount.into())
//                 }
//             } else {
//                 // Check for monopoly to double rent
//                 if has_color_group_monopoly(owner_state, property_state.color_group) {
//                     Ok(property_state.rent_with_color_group as u64)
//                 } else {
//                     Ok(property_state.rent_base as u64)
//                 }
//             }
//         }
//         PropertyType::Railroad => {
//             // Count railroads owned by the owner
//             let railroads_owned = count_railroads_owned(owner_state);
//             let base_rent = property_state.rent_base as u64;

//             match railroads_owned {
//                 1 => Ok(base_rent),
//                 2 => Ok(base_rent * 2),
//                 3 => Ok(base_rent * 4),
//                 4 => Ok(base_rent * 8),
//                 _ => Ok(base_rent),
//             }
//         }
//         PropertyType::Utility => {
//             // Count utilities owned by the owner
//             let utilities_owned = count_utilities_owned(owner_state);
//             let dice_sum = (dice_result[0] + dice_result[1]) as u64;

//             let multiplier = if utilities_owned == 1 { 4 } else { 10 };
//             Ok(dice_sum * multiplier)
//         }
//         _ => Ok(0), // No rent for other property types
//     }
// }

// Helper function to check if owner has monopoly on color group
// fn has_color_group_monopoly(owner_state: &PlayerState, color_group: ColorGroup) -> bool {
//     let properties_in_group = get_color_group_properties(color_group);

//     properties_in_group
//         .iter()
//         .all(|&position| owner_state.properties_owned.contains(&position))
// }

// // Helper function to count railroads owned
// fn count_railroads_owned(owner_state: &PlayerState) -> u8 {
//     let railroad_positions = [5, 15, 25, 35]; // Railroad positions on the board

//     railroad_positions
//         .iter()
//         .filter(|&&pos| owner_state.properties_owned.contains(&pos))
//         .count() as u8
// }

// // Helper function to count utilities owned
// fn count_utilities_owned(owner_state: &PlayerState) -> u8 {
//     let utility_positions = [12, 28]; // Electric Company and Water Works

//     utility_positions
//         .iter()
//         .filter(|&&pos| owner_state.properties_owned.contains(&pos))
//         .count() as u8
// }

// Helper function to get properties in a color group
fn get_color_group_properties(color_group: ColorGroup) -> Vec<u8> {
    match color_group {
        ColorGroup::Brown => vec![1, 3],
        ColorGroup::LightBlue => vec![6, 8, 9],
        ColorGroup::Pink => vec![11, 13, 14],
        ColorGroup::Orange => vec![16, 18, 19],
        ColorGroup::Red => vec![21, 23, 24],
        ColorGroup::Yellow => vec![26, 27, 29],
        ColorGroup::Green => vec![31, 32, 34],
        ColorGroup::DarkBlue => vec![37, 39],
        ColorGroup::Railroad => vec![5, 15, 25, 35],
        ColorGroup::Utility => vec![12, 28],
        ColorGroup::Special => vec![], // No properties in special group
    }
}

// Helper functions for building validation
pub fn has_monopoly_for_player(player_state: &PlayerState, color_group: ColorGroup) -> bool {
    let properties_in_group = get_color_group_properties(color_group);

    properties_in_group
        .iter()
        .all(|&pos| player_state.properties_owned.contains(&pos))
}

pub fn can_build_evenly_for_player(
    _player_state: &PlayerState,
    color_group: ColorGroup,
    _target_position: u8,
    _target_houses: u8,
) -> bool {
    let _properties_in_group = get_color_group_properties(color_group);

    // For this simplified version, we'll assume even building is allowed
    // In a full implementation, you'd need to check other properties in the group
    // This would require additional property state lookups
    true
}

pub fn can_sell_evenly_for_player(
    _player_state: &PlayerState,
    color_group: ColorGroup,
    _target_position: u8,
    _target_houses: u8,
) -> bool {
    let _properties_in_group = get_color_group_properties(color_group);

    // For this simplified version, we'll assume even selling is allowed
    // In a full implementation, you'd need to check other properties in the group
    // This would require additional property state lookups
    true
}

// Helper function to generate random card index
pub fn generate_card_index(
    recent_blockhashes: &UncheckedAccount,
    timestamp: i64,
    deck_size: usize,
) -> Result<usize> {
    // Get recent blockhash data for randomness
    let data = recent_blockhashes.try_borrow_data()?;

    // Use a combination of blockhash and timestamp for randomness
    let mut seed_bytes = [0u8; 32];

    // Take first 24 bytes from recent blockhash data
    if data.len() >= 24 {
        seed_bytes[..24].copy_from_slice(&data[..24]);
    }

    // Add timestamp to last 8 bytes
    let timestamp_bytes = timestamp.to_le_bytes();
    seed_bytes[24..].copy_from_slice(&timestamp_bytes);

    // Generate random index
    let random_value =
        u32::from_le_bytes([seed_bytes[0], seed_bytes[1], seed_bytes[2], seed_bytes[3]]);

    Ok((random_value as usize) % deck_size)
}

// Helper function for generating random seed (similar to dice roll generation)
pub fn generate_random_seed(recent_blockhashes: &UncheckedAccount, timestamp: i64) -> Result<u64> {
    let recent_blockhashes_data = recent_blockhashes.try_borrow_data()?;

    if recent_blockhashes_data.len() < 8 {
        return Err(GameError::RandomnessUnavailable.into());
    }

    let mut seed_bytes = [0u8; 8];
    seed_bytes.copy_from_slice(&recent_blockhashes_data[0..8]);

    let blockhash_seed = u64::from_le_bytes(seed_bytes);
    let timestamp_seed = timestamp as u64;

    Ok(blockhash_seed.wrapping_mul(timestamp_seed))
}

pub fn xorshift64star(seed: u64) -> u64 {
    let mut x = seed;
    x ^= x << 12;
    x ^= x >> 25;
    x ^= x << 27;
    x = (x as u128 * 0x2545F4914F6CDD1D) as u64;
    x
}

// Replace the existing send_player_to_jail function with this enhanced version
pub fn send_player_to_jail_and_end_turn(
    game: &mut Box<Account<'_, GameState>>,
    player_state: &mut Box<Account<'_, PlayerState>>,
    clock: &Sysvar<Clock>,
) {
    // Send player to jail
    player_state.position = JAIL_POSITION;
    player_state.in_jail = true;
    player_state.jail_turns = 0;
    player_state.doubles_count = 0;

    // Clear any pending actions since player is going to jail
    player_state.needs_property_action = false;
    player_state.pending_property_position = None;
    player_state.needs_special_space_action = false;
    player_state.pending_special_space_position = None;
    player_state.needs_chance_card = false;
    player_state.needs_community_chest_card = false;

    // Automatically end turn
    player_state.has_rolled_dice = false;

    // Advance to next player
    // let next_turn = (game.current_turn + 1) % game.current_players;
    // game.current_turn = next_turn;
    game.advance_turn().unwrap();
    game.turn_started_at = clock.unix_timestamp;

    msg!(
        "Player sent to jail and turn ended automatically. Next turn: Player {}",
        game.current_turn
    );

    emit!(SpecialSpaceAction {
        game: game.key(),
        player: player_state.wallet,
        space_type: 2, // Go To Jail
        position: JAIL_POSITION,
        timestamp: clock.unix_timestamp,
    });
}

pub fn send_player_to_jail(player_state: &mut PlayerState) {
    player_state.position = JAIL_POSITION;
    player_state.in_jail = true;
    player_state.jail_turns = 0;
    player_state.doubles_count = 0;

    // Clear any pending actions since player is going to jail
    player_state.needs_property_action = false;
    player_state.pending_property_position = None;
    player_state.needs_special_space_action = false;
    player_state.pending_special_space_position = None;
    player_state.needs_chance_card = false;
    player_state.needs_community_chest_card = false;
}

pub fn force_end_turn_util(
    game: &mut GameState,
    player_state: &mut PlayerState,
    clock: &Sysvar<Clock>,
) {
    // Reset turn-specific flags
    player_state.has_rolled_dice = false;
    player_state.needs_property_action = false;
    player_state.pending_property_position = None;
    player_state.needs_chance_card = false;
    player_state.needs_community_chest_card = false;
    player_state.needs_special_space_action = false;
    player_state.pending_special_space_position = None;

    // Reset doubles count when turn ends
    player_state.doubles_count = 0;

    // Advance to next player
    game.advance_turn().unwrap();
    game.turn_started_at = clock.unix_timestamp;

    msg!(
        "Turn automatically ended. Next turn: Player {}",
        game.current_turn
    );
}

pub fn random_two_u8_with_range(bytes: &[u8; 32], min_value: u8, max_value: u8) -> [u8; 2] {
    let range = (max_value - min_value + 1) as u16;
    let threshold = (256 / range * range) as u8;

    // First value from the first half [0..16]
    let mut first = None;
    for &b in bytes[..16].iter().rev() {
        if b < threshold {
            first = Some(min_value + (b % range as u8));
            break;
        }
    }
    let die1 = first.unwrap_or_else(|| min_value + (bytes[15] % range as u8));

    // Second value from the second half [16..32]
    let mut second = None;
    for &b in bytes[16..].iter().rev() {
        if b < threshold {
            second = Some(min_value + (b % range as u8));
            break;
        }
    }
    let die2 = second.unwrap_or_else(|| min_value + (bytes[31] % range as u8));

    [die1, die2]
}

// news

pub fn calculate_rent(
    game: &GameState,
    position: u8,
    owner_properties: &[u8],
    dice_roll: [u8; 2],
) -> Result<u64> {
    let property = game.get_property(position)?;
    let static_data = get_property_data(position)?;

    // Mortgaged properties don't collect rent
    if property.is_mortgaged {
        return Ok(0);
    }

    match static_data.property_type {
        PropertyType::Street => {
            if property.has_hotel {
                Ok(static_data.rent[5])
            } else if property.houses > 0 {
                Ok(static_data.rent[property.houses as usize])
            } else {
                // Check for monopoly
                let owner = property.owner.ok_or(GameError::PropertyNotOwned)?;
                if game.has_monopoly(&owner, static_data.color_group) {
                    Ok(static_data.rent[0] * 2) // Double rent with monopoly
                } else {
                    Ok(static_data.rent[0])
                }
            }
        }
        PropertyType::Railroad => {
            // Count railroads owned
            let railroad_count = owner_properties
                .iter()
                .filter(|&&pos| {
                    matches!(
                        get_property_data(pos).map(|d| d.property_type),
                        Ok(PropertyType::Railroad)
                    )
                })
                .count();

            Ok(match railroad_count {
                1 => 25,
                2 => 50,
                3 => 100,
                4 => 200,
                _ => 0,
            })
        }
        PropertyType::Utility => {
            // Count utilities owned
            let utility_count = owner_properties
                .iter()
                .filter(|&&pos| {
                    matches!(
                        get_property_data(pos).map(|d| d.property_type),
                        Ok(PropertyType::Utility)
                    )
                })
                .count();

            let multiplier = if utility_count == 2 { 10 } else { 4 };
            let dice_total = (dice_roll[0] + dice_roll[1]) as u64;

            Ok(dice_total * multiplier)
        }
        _ => Ok(0),
    }
}
