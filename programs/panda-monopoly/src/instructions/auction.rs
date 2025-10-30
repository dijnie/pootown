// use crate::constants::*;
// use crate::error::GameError;
// use crate::state::*;
// use crate::utils::*;
// use anchor_lang::prelude::*;

// #[derive(Accounts)]
// #[instruction(property_position: u8)]
// pub struct StartAuction<'info> {
//     #[account(
//         mut,
//         seeds = [b"game", game.authority.as_ref(), &game.game_id.to_le_bytes()],
//         bump = game.bump,
//         constraint = game.game_status == GameStatus::InProgress @ GameError::GameNotInProgress
//     )]
//     pub game: Account<'info, GameState>,

//     #[account(
//         init,
//         payer = initiator,
//         space = 8 + AuctionState::INIT_SPACE,
//         seeds = [b"auction", game.key().as_ref(), &property_position.to_le_bytes()],
//         bump
//     )]
//     pub auction: Account<'info, AuctionState>,

//     #[account(
//         seeds = [b"property", game.key().as_ref(), &property_position.to_le_bytes()],
//         bump
//     )]
//     pub property_state: Account<'info, PropertyState>,

//     #[account(mut)]
//     pub initiator: Signer<'info>,

//     pub system_program: Program<'info, System>,
//     pub clock: Sysvar<'info, Clock>,
// }

// pub fn start_auction_handler(ctx: Context<StartAuction>, property_position: u8) -> Result<()> {
//     let game = &ctx.accounts.game;
//     let auction = &mut ctx.accounts.auction;
//     let property_state = &ctx.accounts.property_state;
//     let clock = &ctx.accounts.clock;

//     // Validate property is unowned
//     if property_state.owner.is_some() {
//         return Err(GameError::PropertyAlreadyOwned.into());
//     }

//     // Validate position is purchasable
//     if !is_property_purchasable(property_position) {
//         return Err(GameError::PropertyNotPurchasable.into());
//     }

//     // Initialize auction
//     auction.game = game.key();
//     auction.property_position = property_position;
//     auction.current_bid = 0;
//     auction.highest_bidder = None;
//     auction.started_at = clock.unix_timestamp;
//     auction.ends_at = clock.unix_timestamp + AUCTION_DURATION_SECONDS;
//     auction.is_active = true;
//     auction.bump = ctx.bumps.auction;

//     msg!(
//         "Auction started for property at position {}",
//         property_position
//     );

//     Ok(())
// }

// #[derive(Accounts)]
// pub struct PlaceBid<'info> {
//     #[account(
//         mut,
//         seeds = [b"auction", auction.game.as_ref(), &auction.property_position.to_le_bytes()],
//         bump = auction.bump,
//         constraint = auction.is_active @ GameError::AuctionNotActive
//     )]
//     pub auction: Account<'info, AuctionState>,

//     #[account(
//         seeds = [b"game", game.authority.as_ref(), &game.game_id.to_le_bytes()],
//         bump = game.bump
//     )]
//     pub game: Account<'info, GameState>,

//     #[account(
//         seeds = [b"player", game.key().as_ref(), bidder.key().as_ref()],
//         bump
//     )]
//     pub bidder_state: Account<'info, PlayerState>,

//     #[account(mut)]
//     pub bidder: Signer<'info>,

//     pub clock: Sysvar<'info, Clock>,
// }

// pub fn place_bid_handler(ctx: Context<PlaceBid>, bid_amount: u64) -> Result<()> {
//     let auction = &mut ctx.accounts.auction;
//     let bidder_state = &ctx.accounts.bidder_state;
//     let bidder_pubkey = ctx.accounts.bidder.key();
//     let clock = &ctx.accounts.clock;

//     // Check if auction has ended
//     if clock.unix_timestamp > auction.ends_at {
//         return Err(GameError::AuctionEnded.into());
//     }

//     // Validate bid amount
//     if bid_amount <= auction.current_bid {
//         return Err(GameError::BidTooLow.into());
//     }

//     // Check if bidder has enough money
//     if bidder_state.cash_balance < bid_amount {
//         return Err(GameError::InsufficientFunds.into());
//     }

//     // Update auction
//     auction.current_bid = bid_amount;
//     auction.highest_bidder = Some(bidder_pubkey);

//     msg!("New bid of ${} placed by {}", bid_amount, bidder_pubkey);

//     Ok(())
// }

// #[derive(Accounts)]
// pub struct EndAuction<'info> {
//     #[account(
//         mut,
//         seeds = [b"auction", auction.game.as_ref(), &auction.property_position.to_le_bytes()],
//         bump = auction.bump,
//         constraint = auction.is_active @ GameError::AuctionNotActive,
//         close = closer
//     )]
//     pub auction: Account<'info, AuctionState>,

//     #[account(
//         mut,
//         seeds = [b"game", game.authority.as_ref(), &game.game_id.to_le_bytes()],
//         bump = game.bump
//     )]
//     pub game: Account<'info, GameState>,

//     #[account(
//         mut,
//         seeds = [b"property", game.key().as_ref(), &auction.property_position.to_le_bytes()],
//         bump
//     )]
//     pub property_state: Account<'info, PropertyState>,

//     #[account(
//         mut,
//         seeds = [b"player", game.key().as_ref(), winner.key().as_ref()],
//         bump
//     )]
//     pub winner_state: Account<'info, PlayerState>,

//     #[account(mut)]
//     pub closer: Signer<'info>,

//     /// CHECK: This is validated by the winner_state account constraint
//     pub winner: UncheckedAccount<'info>,

//     pub clock: Sysvar<'info, Clock>,
// }

// pub fn end_auction_handler(ctx: Context<EndAuction>) -> Result<()> {
//     let auction = &mut ctx.accounts.auction;
//     let property_state = &mut ctx.accounts.property_state;
//     let winner_state = &mut ctx.accounts.winner_state;
//     let winner_pubkey = ctx.accounts.winner.key();
//     let clock = &ctx.accounts.clock;

//     // Check if auction time has ended
//     if clock.unix_timestamp <= auction.ends_at {
//         return Err(GameError::AuctionStillActive.into());
//     }

//     auction.is_active = false;

//     if let Some(highest_bidder) = auction.highest_bidder {
//         // Validate winner matches highest bidder
//         if highest_bidder != winner_pubkey {
//             return Err(GameError::InvalidAccount.into());
//         }

//         // Transfer property
//         property_state.owner = Some(winner_pubkey);

//         // Deduct money from winner
//         winner_state.cash_balance = winner_state
//             .cash_balance
//             .checked_sub(auction.current_bid)
//             .ok_or(GameError::ArithmeticUnderflow)?;

//         // Add property to winner's owned properties
//         winner_state
//             .properties_owned
//             .push(auction.property_position);

//         // Update net worth
//         if let Some(property_data) = get_property_data(auction.property_position) {
//             winner_state.net_worth = winner_state
//                 .net_worth
//                 .checked_add(property_data.price)
//                 .ok_or(GameError::ArithmeticOverflow)?;
//         }

//         msg!(
//             "Auction won by {} for ${}",
//             highest_bidder,
//             auction.current_bid
//         );
//     } else {
//         msg!("Auction ended with no bids");
//     }

//     Ok(())
// }
