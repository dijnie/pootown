use crate::error::GameError;
use crate::{constants::*, random_two_u8_with_range, xorshift64star, ID};
use crate::{force_end_turn_util, send_player_to_jail_and_end_turn, state::*};
use anchor_lang::prelude::*;
use ephemeral_vrf_sdk::anchor::vrf;
use ephemeral_vrf_sdk::instructions::create_request_randomness_ix;
use ephemeral_vrf_sdk::types::SerializableAccountMeta;

#[vrf]
#[derive(Accounts)]
pub struct RollDice<'info> {
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

    /// CHECK: The oracle queue
    #[account(mut, address = ephemeral_vrf_sdk::consts::DEFAULT_EPHEMERAL_QUEUE)]
    pub oracle_queue: AccountInfo<'info>,

    /// CHECK: This is the recent blockhashes sysvar
    #[account(address = anchor_lang::solana_program::sysvar::recent_blockhashes::ID)]
    pub recent_blockhashes: UncheckedAccount<'info>,
}

pub fn roll_dice_handler(
    ctx: Context<RollDice>,
    use_vrf: bool,
    client_seed: u8,
    dice_roll: Option<[u8; 2]>,
) -> Result<()> {
    let game = &mut ctx.accounts.game;
    let player_state = &mut ctx.accounts.player_state;
    let player_pubkey = ctx.accounts.player.key();
    let clock = &ctx.accounts.clock;

    let player_index = game
        .players
        .iter()
        .position(|&p| p == player_pubkey)
        .ok_or(GameError::PlayerNotFound)?;

    if game.current_turn != player_index as u8 {
        return Err(GameError::NotPlayerTurn.into());
    }

    if player_state.has_rolled_dice {
        return Err(GameError::AlreadyRolledDice.into());
    }

    player_state.record_action(clock);

    if dice_roll.is_none() {
        if use_vrf {
            msg!("Requesting randomness...");

            let ix = create_request_randomness_ix(
                ephemeral_vrf_sdk::instructions::RequestRandomnessParams {
                    payer: ctx.accounts.player.key(),
                    oracle_queue: ctx.accounts.oracle_queue.key(),
                    callback_program_id: ID,
                    callback_discriminator: crate::instruction::CallbackRollDice::DISCRIMINATOR
                        .to_vec(),
                    caller_seed: [client_seed; 32],
                    accounts_metas: Some(vec![
                        // game
                        SerializableAccountMeta {
                            pubkey: ctx.accounts.game.key(),
                            is_signer: false,
                            is_writable: true,
                        },
                        // player state
                        SerializableAccountMeta {
                            pubkey: ctx.accounts.player_state.key(),
                            is_signer: false,
                            is_writable: true,
                        },
                        // clock
                        SerializableAccountMeta {
                            pubkey: ctx.accounts.clock.key(),
                            is_signer: false,
                            is_writable: false,
                        },
                    ]),
                    ..Default::default()
                },
            );

            ctx.accounts
                .invoke_signed_vrf(&ctx.accounts.player.to_account_info(), &ix)?;
        } else {
            if player_state.in_jail {
                return handle_jail_dice_roll_without_vrf(
                    game,
                    player_state,
                    clock,
                    &ctx.accounts.recent_blockhashes,
                );
            }

            // Generate secure random dice roll using recent blockhash
            let dice_roll = dice_roll.unwrap_or_else(|| {
                generate_fake_dice_roll(&ctx.accounts.recent_blockhashes, clock.unix_timestamp)
                    .unwrap()
            });

            player_state.last_dice_roll = dice_roll;
            game.turn_started_at = clock.unix_timestamp;

            let is_doubles = dice_roll[0] == dice_roll[1];
            if is_doubles {
                player_state.doubles_count += 1;

                // Three doubles in a row sends player to jail
                if player_state.doubles_count >= 3 {
                    send_player_to_jail_and_end_turn(game, player_state, clock);

                    msg!(
                "Player {} rolled three doubles and goes to jail! Turn ended automatically.",
                player_pubkey
            );
                    return Ok(());
                }

                msg!(
                    "Player {} rolled doubles ({}, {})! Gets another turn.",
                    player_pubkey,
                    dice_roll[0],
                    dice_roll[1]
                );
            } else {
                // Reset doubles count if not doubles
                player_state.doubles_count = 0;
                player_state.has_rolled_dice = true;
            }

            msg!(
                "Player {} rolled: {} and {}",
                player_pubkey,
                dice_roll[0],
                dice_roll[1]
            );

            let dice_sum = dice_roll[0] + dice_roll[1];
            let old_position = player_state.position;
            let new_position = (old_position + dice_sum) % BOARD_SIZE;

            // Check if player passed GO
            if new_position < old_position {
                player_state.cash_balance += GO_SALARY as u64;

                emit!(PlayerPassedGo {
                    player: player_pubkey,
                    game: game.key(),
                    salary_collected: GO_SALARY as u64,
                    new_position,
                    timestamp: clock.unix_timestamp,
                });

                msg!(
                    "Player {} passed GO and collected ${}",
                    player_pubkey,
                    GO_SALARY
                );
            }

            player_state.position = new_position;

            handle_space_landing(game, player_state, new_position, clock)?;

            msg!(
                "Player {} rolled: {} and {} - moved from {} to {}",
                player_pubkey,
                dice_roll[0],
                dice_roll[1],
                old_position,
                new_position
            );
        }
    } else {
        // for test - handle the dice roll directly
        let dice_roll = dice_roll.unwrap();

        player_state.last_dice_roll = dice_roll;
        game.turn_started_at = clock.unix_timestamp;

        let is_doubles = dice_roll[0] == dice_roll[1];
        if is_doubles {
            player_state.doubles_count += 1;

            // Three doubles in a row sends player to jail
            if player_state.doubles_count >= 3 {
                send_player_to_jail_and_end_turn(game, player_state, clock);

                msg!(
                    "Player {} rolled three doubles and goes to jail! Turn ended automatically.",
                    player_pubkey
                );
                return Ok(());
            }

            msg!(
                "Player {} rolled doubles ({}, {})! Gets another turn.",
                player_pubkey,
                dice_roll[0],
                dice_roll[1]
            );
        } else {
            // Reset doubles count if not doubles
            player_state.doubles_count = 0;
            player_state.has_rolled_dice = true;
        }

        msg!(
            "Player {} rolled: {} and {}",
            player_pubkey,
            dice_roll[0],
            dice_roll[1]
        );

        let dice_sum = dice_roll[0] + dice_roll[1];
        let old_position = player_state.position;
        let new_position = (old_position + dice_sum) % BOARD_SIZE;

        // Check if player passed GO
        if new_position < old_position {
            player_state.cash_balance += GO_SALARY as u64;

            emit!(PlayerPassedGo {
                player: player_pubkey,
                game: game.key(),
                salary_collected: GO_SALARY as u64,
                new_position,
                timestamp: clock.unix_timestamp,
            });

            msg!(
                "Player {} passed GO and collected ${}",
                player_pubkey,
                GO_SALARY
            );
        }

        player_state.position = new_position;

        handle_space_landing(game, player_state, new_position, clock)?;

        msg!(
            "Player {} rolled: {} and {} - moved from {} to {}",
            player_pubkey,
            dice_roll[0],
            dice_roll[1],
            old_position,
            new_position
        );
    }

    Ok(())
}

#[derive(Accounts)]
pub struct CallbackRollDiceCtx<'info> {
    /// This check ensure that the vrf_program_identity (which is a PDA) is a singer
    /// enforcing the callback is executed by the VRF program trough CPI
    #[account(address = ephemeral_vrf_sdk::consts::VRF_PROGRAM_IDENTITY)]
    pub vrf_program_identity: Signer<'info>,

    #[account(
        mut,
        seeds = [b"game", game.config_id.as_ref(), &game.game_id.to_le_bytes().as_ref()],
        bump = game.bump,
        constraint = game.game_status == GameStatus::InProgress @ GameError::GameNotInProgress
    )]
    pub game: Box<Account<'info, GameState>>,

    #[account(
        mut,
        seeds = [b"player", player_state.game.as_ref(), player_state.wallet.as_ref()],
        bump
    )]
    pub player_state: Box<Account<'info, PlayerState>>,

    pub clock: Sysvar<'info, Clock>,
}

pub fn callback_roll_dice(ctx: Context<CallbackRollDiceCtx>, randomness: [u8; 32]) -> Result<()> {
    let dice_roll = random_two_u8_with_range(&randomness, 1, 6);
    msg!("Roll: {} - {}", dice_roll[0], dice_roll[1]);

    let game = &mut ctx.accounts.game;
    let player_state = &mut ctx.accounts.player_state;
    let clock = &ctx.accounts.clock;
    let player_pubkey = player_state.wallet;

    // Handle jail logic first if player is in jail
    if player_state.in_jail {
        return handle_jail_dice_roll(game, player_state, clock, dice_roll);
    }

    player_state.last_dice_roll = dice_roll;
    game.turn_started_at = clock.unix_timestamp;

    let is_doubles = dice_roll[0] == dice_roll[1];
    if is_doubles {
        player_state.doubles_count += 1;

        // Three doubles in a row sends player to jail
        if player_state.doubles_count >= 3 {
            send_player_to_jail_and_end_turn(game, player_state, clock);

            msg!(
                "Player {} rolled three doubles and goes to jail! Turn ended automatically.",
                player_pubkey
            );
            return Ok(());
        }

        msg!(
            "Player {} rolled doubles ({}, {})! Gets another turn.",
            player_pubkey,
            dice_roll[0],
            dice_roll[1]
        );
    } else {
        // Reset doubles count if not doubles
        player_state.doubles_count = 0;
        player_state.has_rolled_dice = true;
    }

    msg!(
        "Player {} rolled: {} and {}",
        player_pubkey,
        dice_roll[0],
        dice_roll[1]
    );

    let dice_sum = dice_roll[0] + dice_roll[1];
    let old_position = player_state.position;
    let new_position = (old_position + dice_sum) % BOARD_SIZE;

    // Check if player passed GO
    if new_position < old_position {
        player_state.cash_balance += GO_SALARY as u64;

        emit!(PlayerPassedGo {
            player: player_pubkey,
            game: game.key(),
            salary_collected: GO_SALARY as u64,
            new_position,
            timestamp: clock.unix_timestamp,
        });

        msg!(
            "Player {} passed GO and collected ${}",
            player_pubkey,
            GO_SALARY
        );
    }

    player_state.position = new_position;

    handle_space_landing(game, player_state, new_position, clock)?;

    msg!(
        "Player {} rolled: {} and {} - moved from {} to {}",
        player_pubkey,
        dice_roll[0],
        dice_roll[1],
        old_position,
        new_position
    );

    Ok(())
}

fn handle_jail_dice_roll(
    game: &mut Box<Account<'_, GameState>>,
    player_state: &mut Box<Account<'_, PlayerState>>,
    clock: &Sysvar<Clock>,
    dice_roll: [u8; 2],
) -> Result<()> {
    player_state.jail_turns += 1;
    player_state.last_dice_roll = dice_roll;
    player_state.has_rolled_dice = true;

    let is_doubles = dice_roll[0] == dice_roll[1];
    let mut player_escaped = false;

    if is_doubles {
        player_state.in_jail = false;
        player_state.jail_turns = 0;
        player_state.doubles_count = 0;
        player_escaped = true;

        msg!("Player rolled doubles and escaped jail!");
    } else if player_state.jail_turns >= MAX_JAIL_TURNS {
        // Must pay fine after max turns
        if player_state.cash_balance >= JAIL_FINE as u64 {
            player_state.cash_balance -= JAIL_FINE as u64;
            player_state.in_jail = false;
            player_state.jail_turns = 0;
            player_escaped = true;

            msg!("Player paid jail fine and is released!");
        } else {
            // Player can't afford jail fine - declare bankruptcy and end turn
            player_state.cash_balance = 0;
            player_state.is_bankrupt = true;
            player_state.in_jail = false; // Remove from jail since they're bankrupt
            player_state.jail_turns = 0;

            force_end_turn_util(game, player_state, clock);

            msg!("Player cannot afford jail fine and is declared bankrupt. Turn ended automatically.");
            return Ok(());
        }
    } else {
        msg!("Player remains in jail. Turn {}/3", player_state.jail_turns);
        force_end_turn_util(game, player_state, clock);
        return Ok(());
    }

    if player_escaped {
        // Calculate movement
        let dice_sum = dice_roll[0] + dice_roll[1];
        let old_position = player_state.position;
        let new_position = (old_position + dice_sum) % BOARD_SIZE;

        if new_position < old_position {
            player_state.cash_balance += GO_SALARY as u64;

            emit!(PlayerPassedGo {
                player: player_state.wallet,
                game: game.key(),
                salary_collected: GO_SALARY as u64,
                new_position,
                timestamp: clock.unix_timestamp,
            });

            msg!("Player passed GO and collected ${}", GO_SALARY);
        }

        player_state.position = new_position;

        handle_space_landing(game, player_state, new_position, clock)?;

        msg!(
            "Player escaped jail and moved from {} to {}",
            old_position,
            new_position
        );
    }

    game.turn_started_at = clock.unix_timestamp;
    Ok(())
}

fn handle_space_landing(
    game: &mut Box<Account<'_, GameState>>,
    player_state: &mut Box<Account<'_, PlayerState>>,
    position: u8,
    clock: &Sysvar<Clock>,
) -> Result<()> {
    let property_data = get_property_data(position)?;

    match property_data.property_type {
        PropertyType::Street | PropertyType::Utility | PropertyType::Railroad => {
            if player_state.properties_owned.contains(&position) {
                return Ok(());
            }

            player_state.needs_property_action = true;
            player_state.pending_property_position = Some(position);
            msg!("Player landed on unowned property at position {}", position);
        }
        PropertyType::Corner
        | PropertyType::Chance
        | PropertyType::CommunityChest
        | PropertyType::Tax => {
            // Special space
            handle_special_space(game, player_state, position, clock)?;
        }
        _ => {}
    }

    Ok(())
}

fn handle_special_space(
    game: &mut Box<Account<'_, GameState>>,
    player_state: &mut Box<Account<'_, PlayerState>>,
    position: u8,
    clock: &Sysvar<Clock>,
) -> Result<()> {
    match position {
        GO_POSITION => {
            // Already handled in movement
        }
        JAIL_POSITION => {
            // Just visiting jail, no action needed
        }
        GO_TO_JAIL_POSITION => {
            send_player_to_jail_and_end_turn(game, player_state, clock);
        }
        MEV_TAX_POSITION | PRIORITY_FEE_TAX_POSITION => {
            player_state.needs_special_space_action = true;
            player_state.pending_special_space_position = Some(position);
        }
        pos if CHANCE_POSITIONS.contains(&pos) => {
            player_state.needs_chance_card = true;
        }
        pos if COMMUNITY_CHEST_POSITIONS.contains(&pos) => {
            player_state.needs_community_chest_card = true;
        }
        FREE_PARKING_POSITION => {
            // Free parking - no action
        }
        _ => {}
    }
    Ok(())
}

// --- for test
fn handle_jail_dice_roll_without_vrf(
    game: &mut Box<Account<'_, GameState>>,
    player_state: &mut Box<Account<'_, PlayerState>>,
    clock: &Sysvar<Clock>,
    recent_blockhashes: &UncheckedAccount,
) -> Result<()> {
    player_state.jail_turns += 1;

    let dice_roll = generate_fake_dice_roll(recent_blockhashes, clock.unix_timestamp)?;
    player_state.last_dice_roll = dice_roll;
    player_state.has_rolled_dice = true;

    let is_doubles = dice_roll[0] == dice_roll[1];
    let mut player_escaped = false;

    if is_doubles {
        player_state.in_jail = false;
        player_state.jail_turns = 0;
        player_state.doubles_count = 0;
        player_escaped = true;

        msg!("Player rolled doubles and escaped jail!");
    } else if player_state.jail_turns >= MAX_JAIL_TURNS {
        // Must pay fine after max turns
        if player_state.cash_balance >= JAIL_FINE as u64 {
            player_state.cash_balance -= JAIL_FINE as u64;
            player_state.in_jail = false;
            player_state.jail_turns = 0;
            player_escaped = true;

            msg!("Player paid jail fine and is released!");
        } else {
            // Player can't afford jail fine - declare bankruptcy and end turn
            player_state.cash_balance = 0;
            player_state.is_bankrupt = true;
            player_state.in_jail = false; // Remove from jail since they're bankrupt
            player_state.jail_turns = 0;

            force_end_turn_util(game, player_state, clock);

            msg!("Player cannot afford jail fine and is declared bankrupt. Turn ended automatically.");
            return Ok(());
        }
    } else {
        msg!("Player remains in jail. Turn {}/3", player_state.jail_turns);
        force_end_turn_util(game, player_state, clock);
        return Ok(());
    }

    if player_escaped {
        // Calculate movement
        let dice_sum = dice_roll[0] + dice_roll[1];
        let old_position = player_state.position;
        let new_position = (old_position + dice_sum) % BOARD_SIZE;

        if new_position < old_position {
            player_state.cash_balance += GO_SALARY as u64;

            emit!(PlayerPassedGo {
                player: player_state.wallet,
                game: game.key(),
                salary_collected: GO_SALARY as u64,
                new_position,
                timestamp: clock.unix_timestamp,
            });

            msg!("Player passed GO and collected ${}", GO_SALARY);
        }

        player_state.position = new_position;

        handle_space_landing(game, player_state, new_position, clock)?;

        msg!(
            "Player escaped jail and moved from {} to {}",
            old_position,
            new_position
        );
    }

    game.turn_started_at = clock.unix_timestamp;
    Ok(())
}

fn generate_fake_dice_roll(
    recent_blockhashes: &UncheckedAccount,
    timestamp: i64,
) -> Result<[u8; 2]> {
    // Get recent blockhash data for randomness
    let data = recent_blockhashes.try_borrow_data()?;

    // Create a more diverse seed by combining multiple entropy sources
    let mut seed = 0u64;

    // Use blockhash data (take 8 bytes and convert to u64)
    if data.len() >= 8 {
        seed ^= u64::from_le_bytes([
            data[0], data[1], data[2], data[3], data[4], data[5], data[6], data[7],
        ]);
    }

    // Mix in timestamp
    seed ^= timestamp as u64;

    // Mix in more blockhash data from different positions if available
    if data.len() >= 16 {
        seed ^= u64::from_le_bytes([
            data[8], data[9], data[10], data[11], data[12], data[13], data[14], data[15],
        ]);
    }

    // Ensure seed is never zero (xorshift doesn't work with 0)
    if seed == 0 {
        seed = 0x123456789ABCDEF0u64;
    }

    // Generate first random number for dice1
    let rand1 = xorshift64star(seed);
    // Generate second random number for dice2 (use first result as seed)
    let rand2 = xorshift64star(rand1);

    // Convert to dice values (1-6)
    let dice1 = ((rand1 % 6) + 1) as u8;
    let dice2 = ((rand2 % 6) + 1) as u8;

    Ok([dice1, dice2])
}
