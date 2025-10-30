use crate::constants::*;
use crate::error::GameError;
use crate::state::*;
use crate::utils::*;
use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::cpi::DelegateConfig;

// #[derive(Accounts)]
// #[instruction(game_key: Pubkey, position: u8)]
// pub struct InitProperty<'info> {
//     #[account(
//         init,
//         payer = authority,
//         space = 8 + PropertyState::INIT_SPACE,
//         seeds = [b"property", game_key.as_ref(), position.to_le_bytes().as_ref()],
//         bump
//     )]
//     pub property_state: Box<Account<'info, PropertyState>>,

//     /// CHECK: Validate by CPI
//     #[account(mut)]
//     pub property_buffer_account: UncheckedAccount<'info>,

//     /// CHECK: Validate by CPI
//     #[account(mut)]
//     pub property_delegation_record_account: UncheckedAccount<'info>,

//     /// CHECK: Validate by CPI
//     #[account(mut)]
//     pub property_delegation_metadata_account: UncheckedAccount<'info>,

//     #[account(mut)]
//     pub authority: Signer<'info>,

//     pub system_program: Program<'info, System>,

//     /// CHECK: Validate by CPI
//     pub delegation_program: UncheckedAccount<'info>,

//     /// CHECK: Validate by CPI
//     pub owner_program: UncheckedAccount<'info>,
// }

// pub fn init_property_handler(
//     ctx: Context<InitProperty>,
//     game_key: Pubkey,
//     position: u8,
// ) -> Result<()> {
//     msg!("Init property {} for game {}", position, game_key);
//     msg!("property: {}", ctx.accounts.property_state.key());

//     {
//         let property = &mut ctx.accounts.property_state;
//         property.position = position;
//         property.game = game_key;
//         property.init = false;
//     }

//     {
//         let property = &ctx.accounts.property_state;
//         property.exit(&crate::ID)?;

//         let del_accounts = ephemeral_rollups_sdk::cpi::DelegateAccounts {
//             payer: &ctx.accounts.authority.to_account_info(),
//             pda: &property.to_account_info(),
//             owner_program: &ctx.accounts.owner_program.to_account_info(),
//             buffer: &ctx.accounts.property_buffer_account.to_account_info(),
//             delegation_record: &ctx
//                 .accounts
//                 .property_delegation_record_account
//                 .to_account_info(),
//             delegation_metadata: &ctx
//                 .accounts
//                 .property_delegation_metadata_account
//                 .to_account_info(),
//             delegation_program: &ctx.accounts.delegation_program.to_account_info(),
//             system_program: &ctx.accounts.system_program.to_account_info(),
//         };

//         let pos_seed = property.position.to_le_bytes();
//         let seeds = &[b"property", property.game.as_ref(), pos_seed.as_ref()];

//         msg!("seeds: {:?}", seeds);

//         let config = DelegateConfig {
//             commit_frequency_ms: 30_000,
//             validator: Some(pubkey!("MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57")),
//         };

//         ephemeral_rollups_sdk::cpi::delegate_account(del_accounts, seeds, config)?;

//         msg!("Property {} delegated");
//     }

//     Ok(())
// }

// #[derive(Accounts)]
// pub struct BuyProperty<'info> {
//     #[account(
//         mut,
//         seeds = [b"game", game.config_id.as_ref(), &game.game_id.to_le_bytes().as_ref()],
//         bump = game.bump,
//         constraint = game.game_status == GameStatus::InProgress @ GameError::GameNotInProgress
//     )]
//     pub game: Box<Account<'info, GameState>>,

//     #[account(
//         mut,
//         seeds = [b"player", game.key().as_ref(), player.key().as_ref()],
//         bump
//     )]
//     pub player_state: Box<Account<'info, PlayerState>>,

//     #[account(
//         mut,
//         seeds = [b"property", property_state.game.as_ref(), property_state.position.to_le_bytes().as_ref()],
//         bump
//     )]
//     pub property_state: Box<Account<'info, PropertyState>>,

//     #[account(mut)]
//     pub player: Signer<'info>,

//     pub system_program: Program<'info, System>,
//     pub clock: Sysvar<'info, Clock>,
// }

// pub fn buy_property_handler(ctx: Context<BuyProperty>, position: u8) -> Result<()> {
//     let game = &mut ctx.accounts.game;
//     let player_state = &mut ctx.accounts.player_state;
//     let property_state = &mut ctx.accounts.property_state;
//     let player_pubkey = ctx.accounts.player.key();
//     let clock = &ctx.accounts.clock;

//     let player_index = game
//         .players
//         .iter()
//         .position(|&p| p == player_pubkey)
//         .ok_or(GameError::PlayerNotFound)?;

//     if game.current_turn != player_index as u8 {
//         return Err(GameError::NotPlayerTurn.into());
//     }

//     if player_state.position != position {
//         return Err(GameError::InvalidPropertyPosition.into());
//     }

//     if !is_property_purchasable(position) {
//         return Err(GameError::PropertyNotPurchasable.into());
//     }

//     let property_data = get_property_data(position)?;

//     // Check if property is already owned
//     if property_state.owner.is_some() {
//         return Err(GameError::PropertyAlreadyOwned.into());
//     }

//     if player_state.cash_balance < property_data.price {
//         return Err(GameError::InsufficientFunds.into());
//     }

//     // Initialize property state if needed
//     if !property_state.init {
//         // Not initialized
//         property_state.init = true;
//         property_state.price = property_data.price as u16;
//         property_state.color_group = property_data.color_group;
//         // property_state.color_group = match property_data.color_group {
//         //     1 => ColorGroup::Brown,
//         //     2 => ColorGroup::LightBlue,
//         //     3 => ColorGroup::Pink,
//         //     4 => ColorGroup::Orange,
//         //     5 => ColorGroup::Red,
//         //     6 => ColorGroup::Yellow,
//         //     7 => ColorGroup::Green,
//         //     8 => ColorGroup::DarkBlue,
//         //     9 => ColorGroup::Railroad,
//         //     10 => ColorGroup::Utility,
//         //     _ => ColorGroup::Special,
//         // };
//         property_state.property_type = property_data.property_type;
//         // property_state.property_type = match property_data.property_type {
//         //     0 => PropertyType::Street,
//         //     1 => PropertyType::Railroad,
//         //     2 => PropertyType::Utility,
//         //     _ => PropertyType::Property,
//         // };
//         property_state.houses = 0;
//         property_state.has_hotel = false;
//         property_state.is_mortgaged = false;
//         property_state.rent_base = property_data.rent[0] as u16;
//         property_state.rent_with_color_group = (property_data.rent[0] * 2) as u16;
//         property_state.rent_with_houses = [
//             property_data.rent[1] as u16,
//             property_data.rent[2] as u16,
//             property_data.rent[3] as u16,
//             property_data.rent[4] as u16,
//         ];
//         property_state.rent_with_hotel = property_data.rent[5] as u16;
//         property_state.house_cost = property_data.house_cost as u16;
//         property_state.mortgage_value = property_data.mortgage_value as u16;
//         property_state.last_rent_paid = 0;
//     }

//     // Transfer ownership
//     property_state.owner = Some(player_pubkey);

//     // Deduct money from player
//     player_state.cash_balance = player_state
//         .cash_balance
//         .checked_sub(property_data.price)
//         .ok_or(GameError::ArithmeticUnderflow)?;

//     // Add property to player's owned properties
//     if !player_state.properties_owned.contains(&position) {
//         player_state.properties_owned.push(position);
//     }

//     // Update player's net worth
//     player_state.net_worth = player_state
//         .net_worth
//         .checked_add(property_data.price)
//         .ok_or(GameError::ArithmeticOverflow)?;

//     // Clear property action flag
//     player_state.needs_property_action = false;
//     player_state.pending_property_position = None;

//     // Update timestamps
//     game.turn_started_at = clock.unix_timestamp;

//     // In the buy_property_handler function, remove or update the msg! that references property_data.name:
//     msg!(
//         "Player {} purchased property at position {} for ${}",
//         player_pubkey,
//         position,
//         property_data.price
//     );

//     Ok(())
// }

// // ---------------------------------------------------------------------------

// #[derive(Accounts)]
// pub struct DeclineProperty<'info> {
//     #[account(
//         mut,
//         seeds = [b"game", game.config_id.as_ref(), &game.game_id.to_le_bytes().as_ref()],
//         bump = game.bump,
//         constraint = game.game_status == GameStatus::InProgress @ GameError::GameNotInProgress
//     )]
//     pub game: Box<Account<'info, GameState>>,

//     #[account(
//         mut,
//         seeds = [b"player", game.key().as_ref(), player.key().as_ref()],
//         bump
//     )]
//     pub player_state: Box<Account<'info, PlayerState>>,

//     #[account(mut)]
//     pub player: Signer<'info>,

//     pub clock: Sysvar<'info, Clock>,
// }

// pub fn decline_property_handler(ctx: Context<DeclineProperty>, position: u8) -> Result<()> {
//     let game = &mut ctx.accounts.game;
//     let player_state = &mut ctx.accounts.player_state;
//     let player_pubkey = ctx.accounts.player.key();
//     let clock = &ctx.accounts.clock;

//     // Validate it's the player's turn
//     let player_index = game
//         .players
//         .iter()
//         .position(|&p| p == player_pubkey)
//         .ok_or(GameError::PlayerNotFound)?;

//     if game.current_turn != player_index as u8 {
//         return Err(GameError::NotPlayerTurn.into());
//     }

//     // Validate player is at the property position
//     if player_state.position != position {
//         return Err(GameError::InvalidPropertyPosition.into());
//     }

//     // Validate player has a pending property action
//     if !player_state.needs_property_action {
//         return Err(GameError::InvalidSpecialSpaceAction.into());
//     }

//     // Validate the pending property position matches
//     if player_state.pending_property_position != Some(position) {
//         return Err(GameError::InvalidPropertyPosition.into());
//     }

//     // Validate position is a purchasable property
//     if !is_property_purchasable(position) {
//         return Err(GameError::PropertyNotPurchasable.into());
//     }

//     // Get property data for logging
//     let property_data = get_property_data(position)?;

//     // Clear property action flags
//     player_state.needs_property_action = false;
//     player_state.pending_property_position = None;

//     // Allow player to end turn after declining
//     // player_state.can_end_turn = true;

//     // Update timestamps
//     game.turn_started_at = clock.unix_timestamp;

//     msg!(
//         "Player {} declined to purchase property at position {} (${}) - property may go to auction",
//         player_pubkey,
//         position,
//         property_data.price
//     );

//     // Note: In a full implementation, this would trigger an auction
//     // The auction system would be implemented separately with its own instruction

//     Ok(())
// }

// // ---------------------------------------------------------------------------

// #[derive(Accounts)]
// #[instruction(position: u8)]
// pub struct PayRent<'info> {
//     #[account(
//         mut,
//         seeds = [b"game", game.config_id.as_ref(), &game.game_id.to_le_bytes().as_ref()],
//         bump = game.bump,
//         constraint = game.game_status == GameStatus::InProgress @ GameError::GameNotInProgress
//     )]
//     pub game: Box<Account<'info, GameState>>,

//     #[account(
//         mut,
//         seeds = [b"player", game.key().as_ref(), payer.key().as_ref()],
//         bump
//     )]
//     pub payer_state: Box<Account<'info, PlayerState>>,

//     #[account(
//         mut,
//         seeds = [b"player", game.key().as_ref(), property_owner.key().as_ref()],
//         bump
//     )]
//     pub owner_state: Box<Account<'info, PlayerState>>,

//     #[account(
//         mut,
//         seeds = [b"property", game.key().as_ref(), position.to_le_bytes().as_ref()],
//         bump
//     )]
//     pub property_state: Box<Account<'info, PropertyState>>,

//     #[account(mut)]
//     pub payer: Signer<'info>,

//     /// CHECK: Property owner account - validated by property_state.owner
//     pub property_owner: UncheckedAccount<'info>,

//     pub clock: Sysvar<'info, Clock>,
// }

// pub fn pay_rent_handler(ctx: Context<PayRent>, position: u8) -> Result<()> {
//     let game = &mut ctx.accounts.game;
//     let payer_state = &mut ctx.accounts.payer_state;
//     let owner_state = &mut ctx.accounts.owner_state;
//     let property_state = &mut ctx.accounts.property_state;
//     let payer_pubkey = ctx.accounts.payer.key();
//     let property_owner_pubkey = ctx.accounts.property_owner.key();
//     let clock = &ctx.accounts.clock;

//     let payer_index = game
//         .players
//         .iter()
//         .position(|&p| p == payer_pubkey)
//         .ok_or(GameError::PlayerNotFound)?;

//     if game.current_turn != payer_index as u8 {
//         return Err(GameError::NotPlayerTurn.into());
//     }

//     if payer_state.position != position {
//         return Err(GameError::InvalidPropertyPosition.into());
//     }

//     let property_owner = property_state.owner.ok_or(GameError::PropertyNotOwned)?;
//     if property_owner != property_owner_pubkey {
//         return Err(GameError::InvalidPropertyOwner.into());
//     }

//     // Can't pay rent to yourself
//     if payer_pubkey == property_owner {
//         return Ok(());
//     }

//     // Check if property is mortgaged (no rent if mortgaged)
//     if property_state.is_mortgaged {
//         return Ok(()); // No rent payment needed
//     }

//     let rent_amount =
//         calculate_rent_for_property(&property_state, &owner_state, payer_state.last_dice_roll)?;

//     // Check if payer has enough money
//     if payer_state.cash_balance < rent_amount {
//         // Set bankruptcy check flag
//         payer_state.needs_bankruptcy_check = true;
//         return Err(GameError::InsufficientFunds.into());
//     }

//     // Transfer rent from payer to owner
//     payer_state.cash_balance = payer_state
//         .cash_balance
//         .checked_sub(rent_amount)
//         .ok_or(GameError::ArithmeticUnderflow)?;

//     owner_state.cash_balance = owner_state
//         .cash_balance
//         .checked_add(rent_amount)
//         .ok_or(GameError::ArithmeticOverflow)?;

//     // Update net worth
//     payer_state.net_worth = payer_state
//         .net_worth
//         .checked_sub(rent_amount)
//         .ok_or(GameError::ArithmeticUnderflow)?;

//     owner_state.net_worth = owner_state
//         .net_worth
//         .checked_add(rent_amount)
//         .ok_or(GameError::ArithmeticOverflow)?;

//     // FIXME
//     payer_state.needs_property_action = false;

//     // Update property rent tracking
//     property_state.last_rent_paid = clock.unix_timestamp;
//     owner_state.last_rent_collected = clock.unix_timestamp;

//     // Update game timestamp
//     game.turn_started_at = clock.unix_timestamp;

//     msg!(
//         "Player {} paid ${} rent to {} for property at position {}",
//         payer_pubkey,
//         rent_amount,
//         property_owner,
//         position
//     );

//     Ok(())
// }

// // ---------------------------------------------------------------------------
// #[derive(Accounts)]
// #[instruction(position: u8)]
// pub struct BuildHouse<'info> {
//     #[account(
//         mut,
//         // seeds = [b"game", game.authority.as_ref(), &game.game_id.to_le_bytes().as_ref()],
//         seeds = [b"game", game.config_id.as_ref(), &game.game_id.to_le_bytes().as_ref()],
//         bump = game.bump,
//         constraint = game.game_status == GameStatus::InProgress @ GameError::GameNotInProgress
//     )]
//     pub game: Box<Account<'info, GameState>>,

//     #[account(
//         mut,
//         seeds = [b"player", game.key().as_ref(), player.key().as_ref()],
//         bump
//     )]
//     pub player_state: Box<Account<'info, PlayerState>>,

//     #[account(
//         mut,
//         seeds = [b"property", game.key().as_ref(), position.to_le_bytes().as_ref()],
//         bump,
//         constraint = property_state.owner == Some(player.key()) @ GameError::PropertyNotOwnedByPlayer,
//         constraint = !property_state.is_mortgaged @ GameError::PropertyMortgaged,
//         constraint = property_state.property_type == PropertyType::Street @ GameError::CannotBuildOnPropertyType,
//         constraint = property_state.houses < MAX_HOUSES_PER_PROPERTY @ GameError::MaxHousesReached,
//         constraint = !property_state.has_hotel @ GameError::PropertyHasHotel
//     )]
//     pub property_state: Box<Account<'info, PropertyState>>,

//     #[account(mut)]
//     pub player: Signer<'info>,

//     pub clock: Sysvar<'info, Clock>,
// }

// pub fn build_house_handler(ctx: Context<BuildHouse>, position: u8) -> Result<()> {
//     let game = &mut ctx.accounts.game;
//     let player_state = &mut ctx.accounts.player_state;
//     let property_state = &mut ctx.accounts.property_state;
//     let player_pubkey = ctx.accounts.player.key();
//     let clock = &ctx.accounts.clock;

//     // Validate it's the player's turn
//     let player_index = game
//         .players
//         .iter()
//         .position(|&p| p == player_pubkey)
//         .ok_or(GameError::PlayerNotFound)?;

//     if game.current_turn != player_index as u8 {
//         return Err(GameError::NotPlayerTurn.into());
//     }

//     // Get property data
//     // let property_data = get_property_data(position).ok_or(GameError::InvalidPropertyPosition)?;

//     // Check monopoly requirement
//     if !has_monopoly_for_player(player_state, property_state.color_group) {
//         return Err(GameError::DoesNotOwnColorGroup.into());
//     }

//     // Check even building rule
//     if !can_build_evenly_for_player(
//         player_state,
//         property_state.color_group,
//         position,
//         property_state.houses + 1,
//     ) {
//         return Err(GameError::MustBuildEvenly.into());
//     }

//     // Check if enough houses available
//     if game.houses_remaining == 0 {
//         return Err(GameError::NotEnoughHousesInBank.into());
//     }

//     // Check if player has enough money
//     if player_state.cash_balance < property_state.house_cost as u64 {
//         return Err(GameError::InsufficientFunds.into());
//     }

//     // Deduct money from player
//     player_state.cash_balance = player_state
//         .cash_balance
//         .checked_sub(property_state.house_cost as u64)
//         .ok_or(GameError::ArithmeticUnderflow)?;

//     // Add house to property
//     property_state.houses += 1;

//     // Update game state
//     game.houses_remaining -= 1;
//     game.turn_started_at = clock.unix_timestamp;

//     // Update player's net worth
//     player_state.net_worth = player_state
//         .net_worth
//         .checked_add(property_state.house_cost as u64)
//         .ok_or(GameError::ArithmeticOverflow)?;

//     msg!(
//         "Player {} built a house on property {} for ${}",
//         player_pubkey,
//         position,
//         property_state.house_cost
//     );

//     Ok(())
// }

// // ---------------------------------------------------------------------------

// #[derive(Accounts)]
// #[instruction(position: u8)]
// pub struct BuildHotel<'info> {
//     #[account(
//         mut,
//         // seeds = [b"game", game.authority.as_ref(), &game.game_id.to_le_bytes().as_ref()],
//         seeds = [b"game", game.config_id.as_ref(), &game.game_id.to_le_bytes().as_ref()],
//         bump = game.bump,
//         constraint = game.game_status == GameStatus::InProgress @ GameError::GameNotInProgress
//     )]
//     pub game: Box<Account<'info, GameState>>,

//     #[account(
//         mut,
//         seeds = [b"player", game.key().as_ref(), player.key().as_ref()],
//         bump
//     )]
//     pub player_state: Box<Account<'info, PlayerState>>,

//     #[account(
//         mut,
//         seeds = [b"property", game.key().as_ref(), position.to_le_bytes().as_ref()],
//         bump,
//         constraint = property_state.owner == Some(player.key()) @ GameError::PropertyNotOwnedByPlayer,
//         constraint = !property_state.is_mortgaged @ GameError::PropertyMortgaged,
//         constraint = property_state.property_type == PropertyType::Street @ GameError::CannotBuildOnPropertyType,
//         constraint = property_state.houses == MAX_HOUSES_PER_PROPERTY @ GameError::InvalidHouseCount,
//         constraint = !property_state.has_hotel @ GameError::PropertyHasHotel
//     )]
//     pub property_state: Box<Account<'info, PropertyState>>,

//     #[account(mut)]
//     pub player: Signer<'info>,

//     pub clock: Sysvar<'info, Clock>,
// }

// pub fn build_hotel_handler(ctx: Context<BuildHotel>, position: u8) -> Result<()> {
//     let game = &mut ctx.accounts.game;
//     let player_state = &mut ctx.accounts.player_state;
//     let property_state = &mut ctx.accounts.property_state;
//     let player_pubkey = ctx.accounts.player.key();
//     let clock = &ctx.accounts.clock;

//     // Validate it's the player's turn
//     let player_index = game
//         .players
//         .iter()
//         .position(|&p| p == player_pubkey)
//         .ok_or(GameError::PlayerNotFound)?;

//     if game.current_turn != player_index as u8 {
//         return Err(GameError::NotPlayerTurn.into());
//     }

//     // Check monopoly requirement
//     if !has_monopoly_for_player(player_state, property_state.color_group) {
//         return Err(GameError::DoesNotOwnColorGroup.into());
//     }

//     // Check if enough hotels available
//     if game.hotels_remaining == 0 {
//         return Err(GameError::NotEnoughHotelsInBank.into());
//     }

//     // Check if player has enough money
//     if player_state.cash_balance < property_state.house_cost as u64 {
//         return Err(GameError::InsufficientFunds.into());
//     }

//     // Deduct money from player
//     player_state.cash_balance = player_state
//         .cash_balance
//         .checked_sub(property_state.house_cost as u64)
//         .ok_or(GameError::ArithmeticUnderflow)?;

//     // Convert houses to hotel
//     property_state.houses = 0;
//     property_state.has_hotel = true;

//     // Update game state - return houses to bank and take a hotel
//     game.houses_remaining += MAX_HOUSES_PER_PROPERTY;
//     game.hotels_remaining -= 1;
//     game.turn_started_at = clock.unix_timestamp;

//     // Update player's net worth
//     player_state.net_worth = player_state
//         .net_worth
//         .checked_add(property_state.house_cost as u64)
//         .ok_or(GameError::ArithmeticOverflow)?;

//     msg!(
//         "Player {} built a hotel on property {} for ${}",
//         player_pubkey,
//         position,
//         property_state.house_cost
//     );

//     Ok(())
// }

// // ---------------------------------------------------------------------------

// #[derive(Accounts)]
// #[instruction(position: u8, building_type: BuildingType)]
// pub struct SellBuilding<'info> {
//     #[account(
//         mut,
//         // seeds = [b"game", game.authority.as_ref(), &game.game_id.to_le_bytes().as_ref()],
//         seeds = [b"game", game.config_id.as_ref(), &game.game_id.to_le_bytes().as_ref()],
//         bump = game.bump,
//         constraint = game.game_status == GameStatus::InProgress @ GameError::GameNotInProgress
//     )]
//     pub game: Box<Account<'info, GameState>>,

//     #[account(
//         mut,
//         seeds = [b"player", game.key().as_ref(), player.key().as_ref()],
//         bump
//     )]
//     pub player_state: Box<Account<'info, PlayerState>>,

//     #[account(
//         mut,
//         seeds = [b"property", game.key().as_ref(), position.to_le_bytes().as_ref()],
//         bump,
//         constraint = property_state.owner == Some(player.key()) @ GameError::PropertyNotOwnedByPlayer,
//         constraint = property_state.property_type == PropertyType::Street @ GameError::CannotBuildOnPropertyType
//     )]
//     pub property_state: Box<Account<'info, PropertyState>>,

//     #[account(mut)]
//     pub player: Signer<'info>,

//     pub clock: Sysvar<'info, Clock>,
// }

// pub fn sell_building_handler(
//     ctx: Context<SellBuilding>,
//     position: u8,
//     building_type: BuildingType,
// ) -> Result<()> {
//     let game = &mut ctx.accounts.game;
//     let player_state = &mut ctx.accounts.player_state;
//     let property_state = &mut ctx.accounts.property_state;
//     let player_pubkey = ctx.accounts.player.key();
//     let clock = &ctx.accounts.clock;

//     // Validate it's the player's turn
//     let player_index = game
//         .players
//         .iter()
//         .position(|&p| p == player_pubkey)
//         .ok_or(GameError::PlayerNotFound)?;

//     if game.current_turn != player_index as u8 {
//         return Err(GameError::NotPlayerTurn.into());
//     }

//     let sale_price = property_state.house_cost as u64 / 2; // Sell at half price

//     match building_type {
//         BuildingType::House => {
//             // Check if property has houses to sell
//             if property_state.houses == 0 {
//                 return Err(GameError::NoHousesToSell.into());
//             }

//             // Check even selling rule
//             if !can_sell_evenly_for_player(
//                 player_state,
//                 property_state.color_group,
//                 position,
//                 property_state.houses - 1,
//             ) {
//                 return Err(GameError::MustSellEvenly.into());
//             }

//             // Sell house
//             property_state.houses -= 1;
//             game.houses_remaining += 1;

//             msg!(
//                 "Player {} sold a house from property {} for ${}",
//                 player_pubkey,
//                 position,
//                 sale_price
//             );
//         }
//         BuildingType::Hotel => {
//             // Check if property has hotel to sell
//             if !property_state.has_hotel {
//                 return Err(GameError::NoHotelToSell.into());
//             }

//             // Check if there are enough houses in bank to convert hotel back
//             if game.houses_remaining < MAX_HOUSES_PER_PROPERTY {
//                 return Err(GameError::NotEnoughHousesInBank.into());
//             }

//             // Sell hotel and convert back to houses
//             property_state.has_hotel = false;
//             property_state.houses = MAX_HOUSES_PER_PROPERTY;
//             game.hotels_remaining += 1;
//             game.houses_remaining -= MAX_HOUSES_PER_PROPERTY;

//             msg!(
//                 "Player {} sold a hotel from property {} for ${}",
//                 player_pubkey,
//                 position,
//                 sale_price
//             );
//         }
//     }

//     // Add money to player
//     player_state.cash_balance = player_state
//         .cash_balance
//         .checked_add(sale_price)
//         .ok_or(GameError::ArithmeticOverflow)?;

//     // Update player's net worth
//     player_state.net_worth = player_state
//         .net_worth
//         .checked_sub(sale_price)
//         .ok_or(GameError::ArithmeticUnderflow)?;

//     // Update timestamp
//     game.turn_started_at = clock.unix_timestamp;

//     Ok(())
// }

// // ---------------------------------------------------------------------------

// #[derive(Accounts)]
// #[instruction(position: u8)]
// pub struct MortgageProperty<'info> {
//     #[account(
//         mut,
//         // seeds = [b"game", game.authority.as_ref(), &game.game_id.to_le_bytes().as_ref()],
//         seeds = [b"game", game.config_id.as_ref(), &game.game_id.to_le_bytes().as_ref()],
//         bump = game.bump,
//         constraint = game.game_status == GameStatus::InProgress @ GameError::GameNotInProgress
//     )]
//     pub game: Box<Account<'info, GameState>>,

//     #[account(
//         mut,
//         seeds = [b"player", game.key().as_ref(), player.key().as_ref()],
//         bump
//     )]
//     pub player_state: Box<Account<'info, PlayerState>>,

//     #[account(
//         mut,
//         seeds = [b"property", game.key().as_ref(), position.to_le_bytes().as_ref()],
//         bump,
//         constraint = property_state.owner == Some(player.key()) @ GameError::PropertyNotOwnedByPlayer,
//         constraint = !property_state.is_mortgaged @ GameError::PropertyAlreadyMortgaged,
//         constraint = property_state.houses == 0 @ GameError::CannotMortgageWithBuildings,
//         constraint = !property_state.has_hotel @ GameError::CannotMortgageWithBuildings
//     )]
//     pub property_state: Box<Account<'info, PropertyState>>,

//     #[account(mut)]
//     pub player: Signer<'info>,

//     pub clock: Sysvar<'info, Clock>,
// }

// pub fn mortgage_property_handler(ctx: Context<MortgageProperty>, position: u8) -> Result<()> {
//     let game = &mut ctx.accounts.game;
//     let player_state = &mut ctx.accounts.player_state;
//     let property_state = &mut ctx.accounts.property_state;
//     let player_pubkey = ctx.accounts.player.key();
//     let clock = &ctx.accounts.clock;

//     // Validate it's the player's turn
//     let player_index = game
//         .players
//         .iter()
//         .position(|&p| p == player_pubkey)
//         .ok_or(GameError::PlayerNotFound)?;

//     if game.current_turn != player_index as u8 {
//         return Err(GameError::NotPlayerTurn.into());
//     }

//     // Validate position is a mortgageable property
//     if !is_property_purchasable(position) {
//         return Err(GameError::PropertyNotPurchasable.into());
//     }

//     // Calculate mortgage value (half of purchase price)
//     let mortgage_value = property_state.mortgage_value as u64;

//     // Update property state
//     property_state.is_mortgaged = true;
//     property_state.last_rent_paid = clock.unix_timestamp;

//     // Update player cash balance
//     player_state.cash_balance += mortgage_value;
//     player_state.net_worth -= mortgage_value; // Reduce net worth by mortgage value

//     // Update game timestamp
//     game.turn_started_at = clock.unix_timestamp;

//     msg!(
//         "Player {} mortgaged property at position {} for ${}",
//         player_pubkey,
//         position,
//         mortgage_value
//     );

//     Ok(())
// }

// #[derive(Accounts)]
// #[instruction(position: u8)]
// pub struct UnmortgageProperty<'info> {
//     #[account(
//         mut,
//         // seeds = [b"game", game.authority.as_ref(), &game.game_id.to_le_bytes().as_ref()],
//         seeds = [b"game", game.config_id.as_ref(), &game.game_id.to_le_bytes().as_ref()],
//         bump = game.bump,
//         constraint = game.game_status == GameStatus::InProgress @ GameError::GameNotInProgress
//     )]
//     pub game: Box<Account<'info, GameState>>,

//     #[account(
//         mut,
//         seeds = [b"player", game.key().as_ref(), player.key().as_ref()],
//         bump
//     )]
//     pub player_state: Box<Account<'info, PlayerState>>,

//     #[account(
//         mut,
//         seeds = [b"property", game.key().as_ref(), position.to_le_bytes().as_ref()],
//         bump,
//         constraint = property_state.owner == Some(player.key()) @ GameError::PropertyNotOwnedByPlayer,
//         constraint = property_state.is_mortgaged @ GameError::PropertyNotMortgaged
//     )]
//     pub property_state: Box<Account<'info, PropertyState>>,

//     #[account(mut)]
//     pub player: Signer<'info>,

//     pub clock: Sysvar<'info, Clock>,
// }

// pub fn unmortgage_property_handler(ctx: Context<UnmortgageProperty>, position: u8) -> Result<()> {
//     let game = &mut ctx.accounts.game;
//     let player_state = &mut ctx.accounts.player_state;
//     let property_state = &mut ctx.accounts.property_state;
//     let player_pubkey = ctx.accounts.player.key();
//     let clock = &ctx.accounts.clock;

//     // Validate it's the player's turn
//     let player_index = game
//         .players
//         .iter()
//         .position(|&p| p == player_pubkey)
//         .ok_or(GameError::PlayerNotFound)?;

//     if game.current_turn != player_index as u8 {
//         return Err(GameError::NotPlayerTurn.into());
//     }

//     // Validate position is a mortgageable property
//     if !is_property_purchasable(position) {
//         return Err(GameError::PropertyNotPurchasable.into());
//     }

//     // Calculate unmortgage cost (mortgage value + 10% interest)
//     let mortgage_value = property_state.mortgage_value as u64;
//     let interest = mortgage_value / 10; // 10% interest
//     let unmortgage_cost = mortgage_value + interest;

//     // Check if player has enough money
//     if player_state.cash_balance < unmortgage_cost {
//         return Err(GameError::InsufficientFunds.into());
//     }

//     // Update property state
//     property_state.is_mortgaged = false;
//     property_state.last_rent_paid = clock.unix_timestamp;

//     // Update player cash balance and net worth
//     player_state.cash_balance -= unmortgage_cost;
//     player_state.net_worth += mortgage_value; // Restore net worth

//     // Update game timestamp
//     game.turn_started_at = clock.unix_timestamp;

//     msg!(
//         "Player {} unmortgaged property at position {} for ${} (mortgage: ${}, interest: ${})",
//         player_pubkey,
//         position,
//         unmortgage_cost,
//         mortgage_value,
//         interest
//     );

//     Ok(())
// }

// v2 --------------------------

#[derive(Accounts)]
pub struct BuyPropertyV2<'info> {
    #[account(
        mut,
        seeds = [b"game", game.config_id.as_ref(), &game.game_id.to_le_bytes()],
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

pub fn buy_property_v2_handler(ctx: Context<BuyPropertyV2>, position: u8) -> Result<()> {
    let game = &mut ctx.accounts.game;
    let player_state = &mut ctx.accounts.player_state;
    let player_pubkey = ctx.accounts.player.key();
    let clock = &ctx.accounts.clock;

    // Validate player's turn
    let player_index = game
        .players
        .iter()
        .position(|&p| p == player_pubkey)
        .ok_or(GameError::PlayerNotFound)?;

    require!(
        game.current_turn == player_index as u8,
        GameError::NotPlayerTurn
    );

    // Validate player position
    require!(
        player_state.position == position,
        GameError::InvalidPropertyPosition
    );

    player_state.record_action(clock);

    // Get static property data
    let property_data = get_property_data(position)?;

    // Validate property is purchasable
    require!(
        is_property_purchasable(position),
        GameError::PropertyNotPurchasable
    );

    let property = game.get_property_mut(position)?;

    require!(property.owner.is_none(), GameError::PropertyAlreadyOwned);

    require!(
        player_state.cash_balance >= property_data.price,
        GameError::InsufficientFunds
    );

    // Transfer ownership
    property.owner = Some(player_pubkey);

    // Deduct money
    player_state.cash_balance = player_state
        .cash_balance
        .checked_sub(property_data.price)
        .ok_or(GameError::ArithmeticUnderflow)?;

    // Update player's properties list
    if !player_state.properties_owned.contains(&position) {
        player_state.properties_owned.push(position);
    }

    // Update net worth
    player_state.net_worth = player_state
        .net_worth
        .checked_add(property_data.price)
        .ok_or(GameError::ArithmeticOverflow)?;

    // Clear flags
    player_state.needs_property_action = false;
    player_state.pending_property_position = None;

    // Update timestamp
    game.turn_started_at = clock.unix_timestamp;

    msg!(
        "Player {} purchased property {} for ${}",
        player_pubkey,
        position,
        property_data.price
    );

    emit!(PropertyPurchased {
        game: game.key(),
        player: player_pubkey,
        property_position: position,
        price: property_data.price,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct SellBuildingV2<'info> {
    #[account(
        mut,
        seeds = [b"game", game.config_id.as_ref(), &game.game_id.to_le_bytes()],
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

pub fn sell_building_v2_handler(
    ctx: Context<SellBuildingV2>,
    position: u8,
    building_type: BuildingType,
) -> Result<()> {
    let game = &mut ctx.accounts.game;
    let player_state = &mut ctx.accounts.player_state;
    let player_pubkey = ctx.accounts.player.key();
    let clock = &ctx.accounts.clock;

    // Validate turn
    let player_index = game
        .players
        .iter()
        .position(|&p| p == player_pubkey)
        .ok_or(GameError::PlayerNotFound)?;

    require!(
        game.current_turn == player_index as u8,
        GameError::NotPlayerTurn
    );

    player_state.record_action(clock);

    // Get static data
    let static_data = get_property_data(position)?;

    // Validate property type
    require!(
        static_data.property_type == PropertyType::Street,
        GameError::CannotBuildOnPropertyType
    );

    // Get property
    let property = game.get_property(position)?;

    // Validate ownership
    require!(
        property.owner == Some(player_pubkey),
        GameError::PropertyNotOwnedByPlayer
    );

    // Calculate sale price (half of building cost)
    let sale_price = static_data.house_cost / 2;

    match building_type {
        BuildingType::House => {
            // Validate has houses to sell
            require!(property.houses > 0, GameError::NoHousesToSell);

            // Check even selling rule
            require!(
                game.can_sell_evenly(
                    &player_pubkey,
                    static_data.color_group,
                    position,
                    property.houses - 1
                ),
                GameError::MustSellEvenly
            );

            // Sell house
            let property_mut = game.get_property_mut(position)?;
            property_mut.houses -= 1;
            game.houses_remaining += 1;

            msg!(
                "Player {} sold a house from property {} for ${}",
                player_pubkey,
                position,
                sale_price
            );
        }
        BuildingType::Hotel => {
            // Validate has hotel to sell
            require!(property.has_hotel, GameError::NoHotelToSell);

            // Check if enough houses in bank to convert back
            require!(game.houses_remaining >= 4, GameError::NotEnoughHousesInBank);

            // Sell hotel and convert back to 4 houses
            let property_mut = game.get_property_mut(position)?;
            property_mut.has_hotel = false;
            property_mut.houses = 4;
            game.hotels_remaining += 1;
            game.houses_remaining -= 4;

            msg!(
                "Player {} sold a hotel from property {} for ${}",
                player_pubkey,
                position,
                sale_price
            );
        }
    }

    // Add money to player
    player_state.cash_balance = player_state
        .cash_balance
        .checked_add(sale_price)
        .ok_or(GameError::ArithmeticOverflow)?;

    // Update net worth
    player_state.net_worth = player_state
        .net_worth
        .checked_sub(sale_price)
        .ok_or(GameError::ArithmeticUnderflow)?;

    // Update timestamp
    game.turn_started_at = clock.unix_timestamp;

    emit!(BuildingSold {
        game: game.key(),
        player: player_pubkey,
        property_position: position,
        building_type: match building_type {
            BuildingType::House => "House".to_string(),
            BuildingType::Hotel => "Hotel".to_string(),
        },
        sale_price,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct DeclinePropertyV2<'info> {
    #[account(
        mut,
        seeds = [b"game", game.config_id.as_ref(), &game.game_id.to_le_bytes()],
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

pub fn decline_property_v2_handler(ctx: Context<DeclinePropertyV2>, position: u8) -> Result<()> {
    let game = &mut ctx.accounts.game;
    let player_state = &mut ctx.accounts.player_state;
    let player_pubkey = ctx.accounts.player.key();
    let clock = &ctx.accounts.clock;

    // Validate turn
    let player_index = game
        .players
        .iter()
        .position(|&p| p == player_pubkey)
        .ok_or(GameError::PlayerNotFound)?;

    require!(
        game.current_turn == player_index as u8,
        GameError::NotPlayerTurn
    );

    // Validate player position
    require!(
        player_state.position == position,
        GameError::InvalidPropertyPosition
    );

    // Validate pending property action
    require!(
        player_state.needs_property_action,
        GameError::InvalidSpecialSpaceAction
    );

    require!(
        player_state.pending_property_position == Some(position),
        GameError::InvalidPropertyPosition
    );

    // Validate property is purchasable
    require!(
        is_property_purchasable(position),
        GameError::PropertyNotPurchasable
    );

    player_state.record_action(clock);

    // Get property to verify it's unowned
    let property = game.get_property(position)?;
    require!(property.owner.is_none(), GameError::PropertyAlreadyOwned);

    // Get static data for logging
    let static_data = get_property_data(position)?;

    // Clear flags
    player_state.needs_property_action = false;
    player_state.pending_property_position = None;

    // Update timestamp
    game.turn_started_at = clock.unix_timestamp;

    msg!(
        "Player {} declined to purchase property {} (${}) - property may go to auction",
        player_pubkey,
        position,
        static_data.price
    );

    emit!(PropertyDeclined {
        game: game.key(),
        player: player_pubkey,
        property_position: position,
        price: static_data.price,
        timestamp: clock.unix_timestamp,
    });

    // Note: Auction system would be triggered here in full implementation

    Ok(())
}

#[derive(Accounts)]
pub struct PayRentV2<'info> {
    #[account(
        mut,
        seeds = [b"game", game.config_id.as_ref(), &game.game_id.to_le_bytes()],
        bump = game.bump,
        constraint = game.game_status == GameStatus::InProgress @ GameError::GameNotInProgress
    )]
    pub game: Box<Account<'info, GameState>>,

    #[account(
        mut,
        seeds = [b"player", game.key().as_ref(), payer.key().as_ref()],
        bump
    )]
    pub payer_state: Box<Account<'info, PlayerState>>,

    #[account(
        mut,
        seeds = [b"player", game.key().as_ref(), property_owner.key().as_ref()],
        bump
    )]
    pub owner_state: Box<Account<'info, PlayerState>>,

    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: Validated by property ownership
    pub property_owner: UncheckedAccount<'info>,

    pub clock: Sysvar<'info, Clock>,
}

pub fn pay_rent_v2_handler(ctx: Context<PayRentV2>, position: u8) -> Result<()> {
    let game = &mut ctx.accounts.game;
    let payer_state = &mut ctx.accounts.payer_state;
    let owner_state = &mut ctx.accounts.owner_state;
    let payer_pubkey = ctx.accounts.payer.key();
    let property_owner_pubkey = ctx.accounts.property_owner.key();
    let clock = &ctx.accounts.clock;

    // Validate turn
    let payer_index = game
        .players
        .iter()
        .position(|&p| p == payer_pubkey)
        .ok_or(GameError::PlayerNotFound)?;

    require!(
        game.current_turn == payer_index as u8,
        GameError::NotPlayerTurn
    );

    require!(
        payer_state.position == position,
        GameError::InvalidPropertyPosition
    );

    // Get property
    let property = game.get_property(position)?;

    // Validate ownership
    let owner = property.owner.ok_or(GameError::PropertyNotOwned)?;
    require!(
        owner == property_owner_pubkey,
        GameError::InvalidPropertyOwner
    );

    payer_state.record_action(clock);

    // Can't pay rent to yourself
    if payer_pubkey == owner {
        return Ok(());
    }

    // No rent if mortgaged
    if property.is_mortgaged {
        return Ok(());
    }

    // Calculate rent
    let rent_amount = calculate_rent(
        game,
        position,
        &owner_state.properties_owned,
        payer_state.last_dice_roll,
    )?;

    // Check funds
    // require!(
    //     payer_state.cash_balance >= rent_amount,
    //     GameError::InsufficientFunds
    // );
    if payer_state.cash_balance < rent_amount {
        // Set bankruptcy check flag
        payer_state.needs_bankruptcy_check = true;
        return Ok(());
    }

    // Transfer rent
    payer_state.cash_balance = payer_state
        .cash_balance
        .checked_sub(rent_amount)
        .ok_or(GameError::ArithmeticUnderflow)?;

    owner_state.cash_balance = owner_state
        .cash_balance
        .checked_add(rent_amount)
        .ok_or(GameError::ArithmeticOverflow)?;

    // Update net worth
    payer_state.net_worth = payer_state
        .net_worth
        .checked_sub(rent_amount)
        .ok_or(GameError::ArithmeticUnderflow)?;

    owner_state.net_worth = owner_state
        .net_worth
        .checked_add(rent_amount)
        .ok_or(GameError::ArithmeticOverflow)?;

    // Clear flags
    payer_state.needs_property_action = false;

    // Update timestamps
    owner_state.last_rent_collected = clock.unix_timestamp;
    game.turn_started_at = clock.unix_timestamp;

    msg!(
        "Player {} paid ${} rent to {} for property {}",
        payer_pubkey,
        rent_amount,
        owner,
        position
    );

    emit!(RentPaid {
        game: game.key(),
        payer: payer_pubkey,
        owner: ctx.accounts.property_owner.key(),
        property_position: position,
        amount: rent_amount,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct BuildHouseV2<'info> {
    #[account(
        mut,
        seeds = [b"game", game.config_id.as_ref(), &game.game_id.to_le_bytes()],
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

pub fn build_house_v2_handler(ctx: Context<BuildHouseV2>, position: u8) -> Result<()> {
    let player_state = &mut ctx.accounts.player_state;
    let player_pubkey = ctx.accounts.player.key();
    let clock = &ctx.accounts.clock;
    let static_data = get_property_data(position)?;

    {
        let game = &ctx.accounts.game;
        // Validate turn
        let player_index = game
            .players
            .iter()
            .position(|&p| p == player_pubkey)
            .ok_or(GameError::PlayerNotFound)?;

        require!(
            game.current_turn == player_index as u8,
            GameError::NotPlayerTurn
        );

        // Validate property type
        require!(
            static_data.property_type == PropertyType::Street,
            GameError::CannotBuildOnPropertyType
        );

        player_state.record_action(clock);

        // // Get property
        // let property = game.get_property(position)?;

        // // Validate ownership
        // require!(
        //     property.owner == Some(player_pubkey),
        //     GameError::PropertyNotOwnedByPlayer
        // );

        // require!(!property.is_mortgaged, GameError::PropertyMortgaged);
        // require!(!property.has_hotel, GameError::PropertyHasHotel);
        // require!(property.houses < 4, GameError::MaxHousesReached);

        // // Check monopoly
        // require!(
        //     game.has_monopoly(&player_pubkey, static_data.color_group),
        //     GameError::DoesNotOwnColorGroup
        // );

        // // Check even building
        // require!(
        //     game.can_build_evenly(
        //         &player_pubkey,
        //         static_data.color_group,
        //         position,
        //         property.houses + 1
        //     ),
        //     GameError::MustBuildEvenly
        // );

        // // Check houses available
        // require!(game.houses_remaining > 0, GameError::NotEnoughHousesInBank);

        // // Check funds
        // require!(
        //     player_state.cash_balance >= static_data.house_cost,
        //     GameError::InsufficientFunds
        // );

        let houses = {
            let property = game.get_property(position)?;

            // Validate ownership
            require!(
                property.owner == Some(player_pubkey),
                GameError::PropertyNotOwnedByPlayer
            );

            require!(!property.is_mortgaged, GameError::PropertyMortgaged);
            require!(!property.has_hotel, GameError::PropertyHasHotel);
            require!(property.houses < 4, GameError::MaxHousesReached);

            property.houses
        };

        // Check monopoly
        require!(
            game.has_monopoly(&player_pubkey, static_data.color_group),
            GameError::DoesNotOwnColorGroup
        );

        // Check even building
        require!(
            game.can_build_evenly(
                &player_pubkey,
                static_data.color_group,
                position,
                houses + 1
            ),
            GameError::MustBuildEvenly
        );

        // Check houses available
        require!(game.houses_remaining > 0, GameError::NotEnoughHousesInBank);

        // Check funds
        require!(
            player_state.cash_balance >= static_data.house_cost,
            GameError::InsufficientFunds
        );
    }

    {
        // Build house
        let game = &mut ctx.accounts.game;
        let property_mut = game.get_property_mut(position)?;
        property_mut.houses += 1;
        game.houses_remaining -= 1;

        // Deduct money
        player_state.cash_balance = player_state
            .cash_balance
            .checked_sub(static_data.house_cost)
            .ok_or(GameError::ArithmeticUnderflow)?;

        // Update net worth
        player_state.net_worth = player_state
            .net_worth
            .checked_add(static_data.house_cost)
            .ok_or(GameError::ArithmeticOverflow)?;

        // Update timestamp
        game.turn_started_at = clock.unix_timestamp;
    }

    {
        let game = &ctx.accounts.game;
        let property = game.get_property(position)?;
        emit!(HouseBuilt {
            game: game.key(),
            player: player_pubkey,
            property_position: position,
            house_count: property.houses,
            cost: static_data.house_cost,
            timestamp: clock.unix_timestamp,
        });
    }

    Ok(())
}

#[derive(Accounts)]
pub struct BuildHotelV2<'info> {
    #[account(
        mut,
        seeds = [b"game", game.config_id.as_ref(), &game.game_id.to_le_bytes()],
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

pub fn build_hotel_v2_handler(ctx: Context<BuildHotelV2>, position: u8) -> Result<()> {
    let game = &mut ctx.accounts.game;
    let player_state = &mut ctx.accounts.player_state;
    let player_pubkey = ctx.accounts.player.key();
    let clock = &ctx.accounts.clock;

    // Validate turn
    let player_index = game
        .players
        .iter()
        .position(|&p| p == player_pubkey)
        .ok_or(GameError::PlayerNotFound)?;

    require!(
        game.current_turn == player_index as u8,
        GameError::NotPlayerTurn
    );

    player_state.record_action(clock);

    // Get static data
    let static_data = get_property_data(position)?;

    // Validate property type
    require!(
        static_data.property_type == PropertyType::Street,
        GameError::CannotBuildOnPropertyType
    );

    // Get property
    let property = game.get_property(position)?;

    // Validate state
    require!(
        property.owner == Some(player_pubkey),
        GameError::PropertyNotOwnedByPlayer
    );
    require!(!property.is_mortgaged, GameError::PropertyMortgaged);
    require!(property.houses == 4, GameError::InvalidHouseCount);
    require!(!property.has_hotel, GameError::PropertyHasHotel);

    // Check monopoly
    require!(
        game.has_monopoly(&player_pubkey, static_data.color_group),
        GameError::DoesNotOwnColorGroup
    );

    // Check hotels available
    require!(game.hotels_remaining > 0, GameError::NotEnoughHotelsInBank);

    // Check funds
    require!(
        player_state.cash_balance >= static_data.house_cost,
        GameError::InsufficientFunds
    );

    // Build hotel
    let property_mut = game.get_property_mut(position)?;
    property_mut.houses = 0;
    property_mut.has_hotel = true;
    game.houses_remaining += 4; // Return 4 houses to bank
    game.hotels_remaining -= 1;

    // Deduct money
    player_state.cash_balance = player_state
        .cash_balance
        .checked_sub(static_data.house_cost)
        .ok_or(GameError::ArithmeticUnderflow)?;

    // Update net worth
    player_state.net_worth = player_state
        .net_worth
        .checked_add(static_data.house_cost)
        .ok_or(GameError::ArithmeticOverflow)?;

    // Update timestamp
    game.turn_started_at = clock.unix_timestamp;

    msg!(
        "Player {} built a hotel on property {} for ${}",
        player_pubkey,
        position,
        static_data.house_cost
    );

    emit!(HotelBuilt {
        game: game.key(),
        player: player_pubkey,
        property_position: position,
        cost: static_data.house_cost as u64,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct MortgagePropertyV2<'info> {
    #[account(
        mut,
        seeds = [b"game", game.config_id.as_ref(), &game.game_id.to_le_bytes()],
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

pub fn mortgage_property_v2_handler(ctx: Context<MortgagePropertyV2>, position: u8) -> Result<()> {
    let game = &mut ctx.accounts.game;
    let player_state = &mut ctx.accounts.player_state;
    let player_pubkey = ctx.accounts.player.key();
    let clock = &ctx.accounts.clock;

    // Validate turn
    let player_index = game
        .players
        .iter()
        .position(|&p| p == player_pubkey)
        .ok_or(GameError::PlayerNotFound)?;

    require!(
        game.current_turn == player_index as u8,
        GameError::NotPlayerTurn
    );

    player_state.record_action(clock);

    // Get static data
    let static_data = get_property_data(position)?;
    require!(
        is_property_purchasable(position),
        GameError::PropertyNotPurchasable
    );

    // Get property
    let property = game.get_property_mut(position)?;

    // Validate state
    require!(
        property.owner == Some(player_pubkey),
        GameError::PropertyNotOwnedByPlayer
    );
    require!(!property.is_mortgaged, GameError::PropertyAlreadyMortgaged);
    require!(
        property.houses == 0 && !property.has_hotel,
        GameError::CannotMortgageWithBuildings
    );

    // Mortgage property
    property.is_mortgaged = true;

    // Give player money
    player_state.cash_balance += static_data.mortgage_value;
    player_state.net_worth -= static_data.mortgage_value;

    // Update timestamp
    game.turn_started_at = clock.unix_timestamp;

    msg!(
        "Player {} mortgaged property {} for ${}",
        player_pubkey,
        position,
        static_data.mortgage_value
    );

    emit!(PropertyMortgaged {
        game: game.key(),
        player: player_pubkey,
        property_position: position,
        mortgage_value: static_data.mortgage_value,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

pub fn unmortgage_property_v2_handler(
    ctx: Context<MortgagePropertyV2>,
    position: u8,
) -> Result<()> {
    let game = &mut ctx.accounts.game;
    let player_state = &mut ctx.accounts.player_state;
    let player_pubkey = ctx.accounts.player.key();
    let clock = &ctx.accounts.clock;

    // Validate turn
    let player_index = game
        .players
        .iter()
        .position(|&p| p == player_pubkey)
        .ok_or(GameError::PlayerNotFound)?;

    require!(
        game.current_turn == player_index as u8,
        GameError::NotPlayerTurn
    );

    player_state.record_action(clock);

    // Get static data
    let static_data = get_property_data(position)?;

    // Get property
    let property = game.get_property_mut(position)?;

    // Validate state
    require!(
        property.owner == Some(player_pubkey),
        GameError::PropertyNotOwnedByPlayer
    );
    require!(property.is_mortgaged, GameError::PropertyNotMortgaged);

    // Calculate unmortgage cost (mortgage + 10% interest)
    let interest = static_data.mortgage_value / 10;
    let unmortgage_cost = static_data.mortgage_value + interest;

    // Check funds
    require!(
        player_state.cash_balance >= unmortgage_cost,
        GameError::InsufficientFunds
    );

    // Unmortgage property
    property.is_mortgaged = false;

    // Deduct money
    player_state.cash_balance -= unmortgage_cost;
    player_state.net_worth += static_data.mortgage_value;

    // Update timestamp
    game.turn_started_at = clock.unix_timestamp;

    msg!(
        "Player {} unmortgaged property {} for ${} (mortgage: ${}, interest: ${})",
        player_pubkey,
        position,
        unmortgage_cost,
        static_data.mortgage_value,
        interest
    );

    emit!(PropertyUnmortgaged {
        game: game.key(),
        player: player_pubkey,
        property_position: position,
        unmortgage_cost,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
