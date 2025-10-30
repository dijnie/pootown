#![allow(unexpected_cfgs)]
pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;
pub mod utils;

use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::ephemeral;

pub use constants::*;
pub use instructions::*;
pub use state::*;
pub use utils::*;

declare_id!("4vucUqMcXN4sgLsgnrXTUC9U7ACZ5DmoRBLbWt4vrnyR");

#[ephemeral]
#[program]
pub mod panda_monopoly {
    use super::*;

    // Platform instructions
    pub fn create_platform_config(
        ctx: Context<CreatePlatformConfig>,
        platform_id: Pubkey,
        fee_basis_points: u16,
        fee_vault: Pubkey,
    ) -> Result<()> {
        instructions::platform::create_platform_config_handler(
            ctx,
            platform_id,
            fee_basis_points,
            fee_vault,
        )
    }

    pub fn update_platform_config(
        ctx: Context<UpdatePlatformConfig>,
        fee_basis_points: Option<u16>,
        fee_vault: Option<Pubkey>,
    ) -> Result<()> {
        instructions::platform::update_platform_config_handler(ctx, fee_basis_points, fee_vault)
    }

    // Game management instructions
    pub fn initialize_game(
        ctx: Context<InitializeGame>,
        entry_fee: u64,
        time_limit_seconds: Option<i64>,
    ) -> Result<()> {
        instructions::initialize::initialize_game_handler(ctx, entry_fee, time_limit_seconds)
    }

    pub fn cancel_game<'c: 'info, 'info>(
        ctx: Context<'_, '_, 'c, 'info, CancelGame<'info>>,
    ) -> Result<()> {
        instructions::cancel_game::cancel_game_handler(ctx)
    }

    pub fn join_game(ctx: Context<JoinGame>) -> Result<()> {
        instructions::initialize::join_game_handler(ctx)
    }

    pub fn leave_game(ctx: Context<LeaveGame>) -> Result<()> {
        instructions::leave_game::leave_game_handler(ctx)
    }

    pub fn start_game<'c: 'info, 'info>(
        ctx: Context<'_, '_, 'c, 'info, StartGame<'info>>,
    ) -> Result<()> {
        instructions::initialize::start_game_handler(ctx)
    }

    // Game ending instruction
    pub fn end_game<'c: 'info, 'info>(
        ctx: Context<'_, '_, 'c, 'info, EndGame<'info>>,
    ) -> Result<()> {
        instructions::end_game::end_game_handler(ctx)
    }

    // Dice and movement instructions
    pub fn roll_dice(
        ctx: Context<RollDice>,
        use_vrf: bool,
        client_seed: u8,
        dice_roll: Option<[u8; 2]>,
    ) -> Result<()> {
        instructions::dice::roll_dice_handler(ctx, use_vrf, client_seed, dice_roll)
    }

    pub fn callback_roll_dice(
        ctx: Context<CallbackRollDiceCtx>,
        randomness: [u8; 32],
    ) -> Result<()> {
        instructions::dice::callback_roll_dice(ctx, randomness)
    }

    pub fn callback_draw_chance_card(
        ctx: Context<CallbackDrawChanceCardCtx>,
        randomness: [u8; 32],
    ) -> Result<()> {
        instructions::special_spaces::callback_draw_chance_card(ctx, randomness)
    }

    pub fn callback_draw_community_chest_card(
        ctx: Context<CallbackDrawCommunityChestCardCtx>,
        randomness: [u8; 32],
    ) -> Result<()> {
        instructions::special_spaces::callback_draw_community_chest_card(ctx, randomness)
    }

    pub fn end_turn(ctx: Context<EndTurn>) -> Result<()> {
        instructions::end_turn::end_turn_handler(ctx)
    }

    pub fn pay_jail_fine(ctx: Context<PayJailFine>) -> Result<()> {
        instructions::jail::pay_jail_fine_handler(ctx)
    }

    pub fn use_get_out_of_jail_card(ctx: Context<UseGetOutOfJailCard>) -> Result<()> {
        instructions::jail::use_get_out_of_jail_card_handler(ctx)
    }

    pub fn declare_bankruptcy<'c: 'info, 'info>(
        ctx: Context<'_, '_, 'c, 'info, DeclareBankruptcy<'info>>,
    ) -> Result<()> {
        instructions::bankruptcy::declare_bankruptcy_handler(ctx)
    }

    // Tax instructions
    pub fn pay_mev_tax_handler(ctx: Context<PayTax>) -> Result<()> {
        instructions::special_spaces::pay_mev_tax_handler(ctx)
    }

    pub fn pay_priority_fee_tax_handler(ctx: Context<PayTax>) -> Result<()> {
        instructions::special_spaces::pay_priority_fee_tax_handler(ctx)
    }

    pub fn draw_chance_card(
        ctx: Context<DrawChanceCard>,
        use_vrf: bool,
        client_seed: u8,
        card_index: Option<u8>,
    ) -> Result<()> {
        instructions::special_spaces::draw_chance_card_handler(
            ctx,
            use_vrf,
            client_seed,
            card_index,
        )
    }

    pub fn draw_community_chest_card(
        ctx: Context<DrawCommunityChestCard>,
        use_vrf: bool,
        client_seed: u8,
        card_index: Option<u8>,
    ) -> Result<()> {
        instructions::special_spaces::draw_community_chest_card_handler(
            ctx,
            use_vrf,
            client_seed,
            card_index,
        )
    }

    pub fn buy_property_v2(ctx: Context<BuyPropertyV2>, position: u8) -> Result<()> {
        instructions::property::buy_property_v2_handler(ctx, position)
    }

    pub fn sell_building_v2(
        ctx: Context<SellBuildingV2>,
        position: u8,
        building_type: BuildingType,
    ) -> Result<()> {
        instructions::property::sell_building_v2_handler(ctx, position, building_type)
    }

    pub fn decline_property_v2(ctx: Context<DeclinePropertyV2>, position: u8) -> Result<()> {
        instructions::property::decline_property_v2_handler(ctx, position)
    }

    pub fn pay_rent_v2(ctx: Context<PayRentV2>, position: u8) -> Result<()> {
        instructions::property::pay_rent_v2_handler(ctx, position)
    }

    pub fn build_house_v2(ctx: Context<BuildHouseV2>, position: u8) -> Result<()> {
        instructions::property::build_house_v2_handler(ctx, position)
    }

    pub fn build_hotel_v2(ctx: Context<BuildHotelV2>, position: u8) -> Result<()> {
        instructions::property::build_hotel_v2_handler(ctx, position)
    }

    pub fn mortgage_property_v2(ctx: Context<MortgagePropertyV2>, position: u8) -> Result<()> {
        instructions::property::mortgage_property_v2_handler(ctx, position)
    }

    pub fn unmortgage_property_v2(ctx: Context<MortgagePropertyV2>, position: u8) -> Result<()> {
        instructions::property::unmortgage_property_v2_handler(ctx, position)
    }

    // Trading instructions
    pub fn create_trade(
        ctx: Context<CreateTrade>,
        trade_type: TradeType,
        proposer_money: u64,
        receiver_money: u64,
        proposer_property: Option<u8>,
        receiver_property: Option<u8>,
    ) -> Result<()> {
        instructions::trading::create_trade_handler(
            ctx,
            trade_type,
            proposer_money,
            receiver_money,
            proposer_property,
            receiver_property,
        )
    }

    pub fn accept_trade(ctx: Context<AcceptTrade>, trade_id: u8) -> Result<()> {
        instructions::trading::accept_trade_handler(ctx, trade_id)
    }

    pub fn reject_trade(ctx: Context<RejectTrade>, trade_id: u8) -> Result<()> {
        instructions::trading::reject_trade_handler(ctx, trade_id)
    }

    pub fn cancel_trade(ctx: Context<CancelTrade>, trade_id: u8) -> Result<()> {
        instructions::trading::cancel_trade_handler(ctx, trade_id)
    }

    pub fn cleanup_expired_trades(ctx: Context<CleanupExpiredTrades>) -> Result<()> {
        instructions::trading::cleanup_expired_trades_handler(ctx)
    }

    pub fn claim_reward(ctx: Context<ClaimReward>) -> Result<()> {
        instructions::claim_reward::claim_reward_handler(ctx)
    }

    // permissionless instructions

    pub fn force_end_turn(ctx: Context<ForceEndTurn>) -> Result<()> {
        instructions::permissionless::force_end_turn_handler(ctx)
    }

    pub fn force_bankruptcy_for_timeout(ctx: Context<ForceBankruptcyForTimeout>) -> Result<()> {
        instructions::permissionless::force_bankruptcy_for_timeout_handler(ctx)
    }

    // for test

    pub fn reset_game_handler<'c: 'info, 'info>(
        ctx: Context<'_, '_, 'c, 'info, ResetGame<'info>>,
    ) -> Result<()> {
        instructions::test::reset_game_handler(ctx)
    }

    pub fn undelegate_game_handler<'c: 'info, 'info>(
        ctx: Context<'_, '_, 'c, 'info, UndelegateGame<'info>>,
    ) -> Result<()> {
        instructions::test::undelegate_game_handler(ctx)
    }

    pub fn close_game_handler<'c: 'info, 'info>(
        ctx: Context<'_, '_, 'c, 'info, CloseGame<'info>>,
    ) -> Result<()> {
        instructions::test::close_game_handler(ctx)
    }
}
