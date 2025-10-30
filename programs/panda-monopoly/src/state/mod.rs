use anchor_lang::prelude::*;

mod events;
pub use events::*;

use crate::{error::GameError, get_color_group_properties_enum, get_property_data, STARTING_MONEY};

#[account]
#[derive(InitSpace, Debug)]
pub struct PlatformConfig {
    pub id: Pubkey,
    pub fee_basis_points: u16, // 500 = 5%
    pub authority: Pubkey,
    pub fee_vault: Pubkey,
    pub total_games_created: u64,
    pub next_game_id: u64,
    pub bump: u8,
}

impl PlatformConfig {
    pub fn calculate_fee(&self, amount: u64) -> u64 {
        (amount * self.fee_basis_points as u64) / 10000
    }
}

#[derive(Debug, InitSpace, AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum GameStatus {
    WaitingForPlayers,
    InProgress,
    Finished,
}

#[derive(AnchorSerialize, AnchorDeserialize, Debug, InitSpace, Clone, PartialEq, Eq)]
pub enum TradeStatus {
    Pending,
    Accepted,
    Rejected,
    Cancelled,
    Expired,
}

#[derive(Debug, InitSpace, AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum ColorGroup {
    Brown,
    LightBlue,
    Pink,
    Orange,
    Red,
    Yellow,
    Green,
    DarkBlue,
    Railroad,
    Utility,
    Special,
}

#[derive(Debug, InitSpace, AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum PropertyType {
    Street,
    Railroad,
    Utility,
    Corner,
    Chance,
    CommunityChest,
    Tax,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum BuildingType {
    House,
    Hotel,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub enum GameEndReason {
    BankruptcyVictory, // Last player standing
    TimeLimit,         // Time ran out
    Manual,            // Manual forfeit/end
}

// New simplified trade structure for storing in GameState vector
#[derive(Debug, InitSpace, AnchorSerialize, AnchorDeserialize, Clone)]
pub struct TradeInfo {
    pub id: u8,                        // Unique trade ID within the game
    pub proposer: Pubkey,              // Trade proposer
    pub receiver: Pubkey,              // Trade receiver
    pub trade_type: TradeType,         // Type of trade
    pub proposer_money: u64,           // Money offered by proposer
    pub receiver_money: u64,           // Money requested from receiver
    pub proposer_property: Option<u8>, // Property offered by proposer
    pub receiver_property: Option<u8>, // Property requested from receiver
    pub status: TradeStatus,           // Current trade status
    pub created_at: i64,               // Creation timestamp
    pub expires_at: i64,               // Expiration timestamp
}

#[account]
#[derive(Debug, InitSpace)]
pub struct GameState {
    pub game_id: u64,
    pub config_id: Pubkey,
    pub creator: Pubkey,     // 32 bytes - game creator
    pub bump: u8,            // 1 byte - PDA bump seed
    pub max_players: u8,     // 1 byte - maximum players (2-8)
    pub current_players: u8, // 1 byte - current player count
    pub current_turn: u8,    // 1 byte - whose turn (player index)
    #[max_len(4)]
    pub players: Vec<Pubkey>, // 32 * 8 = 256 bytes max
    #[max_len(4)]
    pub player_eliminated: Vec<bool>, // Parallel array tracking elimination
    pub total_players: u8,   // Total who joined (never decreases)
    pub active_players: u8,  // Current non-bankrupt count
    pub game_status: GameStatus, // 1 byte - current game status
    pub bank_balance: u64,   // 8 bytes - bank's money
    pub free_parking_pool: u64, // 8 bytes - parking pool
    pub houses_remaining: u8, // 1 byte - houses left in bank (32 total)
    pub hotels_remaining: u8, // 1 byte - hotels left in bank (12 total)
    pub winner: Option<Pubkey>, // 33 bytes - game winner

    // Entry fee fields
    pub entry_fee: u64, // 8 bytes - entry fee amount (0 for free games)
    pub token_mint: Option<Pubkey>, // 33 bytes - token mint for entry fee
    pub token_vault: Option<Pubkey>, // 33 bytes - vault holding entry fees
    pub total_prize_pool: u64, // 8 bytes - total collected fees

    // pub is_ending: bool,     // 1 byte - game ending status
    pub prize_claimed: bool,     // Track if reward claimed
    pub end_condition_met: bool, // Track if end condition met

    pub end_reason: Option<GameEndReason>, // How game ended

    #[max_len(20)]
    pub active_trades: Vec<TradeInfo>, // Vector of active trades
    pub next_trade_id: u8, // Next trade ID to assign

    pub properties: [PropertyInfo; 40], // Fixed array: 40 × 36 bytes = 1,440 bytes

    pub created_at: i64, // 8 bytes - game creation timestamp
    pub started_at: Option<i64>,
    pub ended_at: Option<i64>,
    pub game_end_time: Option<i64>, // 8 bytes - game end time
    pub turn_started_at: i64,       // 8 bytes - when current turn started
    pub time_limit: Option<i64>,    // 9 bytes - optional time limit

    pub turn_timeout_seconds: u64, // 8 bytes - timeout duration (default 30)
    pub turn_grace_period_seconds: u64, // 8 bytes - grace period (default 10)
    pub timeout_enforcement_enabled: bool, // 1 byte - can disable for testing
}

impl GameState {
    pub fn cleanup_expired_trades(&mut self, current_time: i64) {
        self.active_trades.retain(|trade| {
            trade.expires_at > current_time && trade.status == TradeStatus::Pending
        });
    }

    pub fn find_trade_by_id(&self, trade_id: u8) -> Option<&TradeInfo> {
        self.active_trades.iter().find(|trade| trade.id == trade_id)
    }

    pub fn find_trade_by_id_mut(&mut self, trade_id: u8) -> Option<&mut TradeInfo> {
        self.active_trades
            .iter_mut()
            .find(|trade| trade.id == trade_id)
    }

    pub fn remove_trade_by_id(&mut self, trade_id: u8) -> bool {
        if let Some(pos) = self
            .active_trades
            .iter()
            .position(|trade| trade.id == trade_id)
        {
            self.active_trades.remove(pos);
            true
        } else {
            false
        }
    }

    pub fn can_add_trade(&self) -> bool {
        self.active_trades.len() < crate::constants::MAX_ACTIVE_TRADES
    }

    pub fn get_next_trade_id(&mut self) -> u8 {
        let id = self.next_trade_id;
        self.next_trade_id = self.next_trade_id.wrapping_add(1);
        id
    }

    // properties
    pub fn initialize_properties(&mut self) {
        self.properties = [PropertyInfo::default(); 40];
    }

    pub fn get_property(&self, position: u8) -> Result<&PropertyInfo> {
        self.properties
            .get(position as usize)
            .ok_or(error!(GameError::InvalidPropertyPosition))
    }

    pub fn get_property_mut(&mut self, position: u8) -> Result<&mut PropertyInfo> {
        self.properties
            .get_mut(position as usize)
            .ok_or(error!(GameError::InvalidPropertyPosition))
    }

    pub fn has_monopoly(&self, player: &Pubkey, color_group: ColorGroup) -> bool {
        let group_positions = get_color_group_properties_enum(color_group);

        group_positions.iter().all(|&pos| {
            self.properties
                .get(pos as usize)
                .map(|p| p.owner.as_ref() == Some(player))
                .unwrap_or(false)
        })
    }

    pub fn get_player_properties(&self, player: &Pubkey) -> Vec<u8> {
        self.properties
            .iter()
            .enumerate()
            .filter_map(|(idx, prop)| {
                if prop.owner.as_ref() == Some(player) {
                    Some(idx as u8)
                } else {
                    None
                }
            })
            .collect()
    }

    pub fn can_build_evenly(
        &self,
        player: &Pubkey,
        color_group: ColorGroup,
        position: u8,
        new_house_count: u8,
    ) -> bool {
        let group_positions = get_color_group_properties_enum(color_group);

        for &pos in &group_positions {
            if pos == position {
                continue; // Skip the property we're building on
            }

            if let Some(prop) = self.properties.get(pos as usize) {
                if prop.owner.as_ref() != Some(player) {
                    return false;
                }

                // New house count can't be more than 1 higher than other properties
                if new_house_count > prop.houses + 1 {
                    return false;
                }
            }
        }

        true
    }

    pub fn can_sell_evenly(
        &self,
        player: &Pubkey,
        color_group: ColorGroup,
        position: u8,
        new_house_count: u8,
    ) -> bool {
        let group_positions = get_color_group_properties_enum(color_group);

        for &pos in &group_positions {
            if pos == position {
                continue;
            }

            if let Some(prop) = self.properties.get(pos as usize) {
                if prop.owner.as_ref() != Some(player) {
                    return false;
                }

                // Can't sell if this would make us have less than others
                if new_house_count < prop.houses.saturating_sub(1) {
                    return false;
                }
            }
        }

        true
    }

    /// Calculate net worth for a specific player
    pub fn calculate_player_net_worth(&self, player: &Pubkey) -> Result<u64> {
        let mut total_value = 0u64;

        // Iterate through properties owned by this player
        for (position, property) in self.properties.iter().enumerate() {
            if property.owner.as_ref() == Some(player) {
                let property_data = get_property_data(position as u8)?;

                // Add property value (use mortgage value as liquidation value)
                if property.is_mortgaged {
                    // Mortgaged property value = mortgage_value * 0.9 (accounting for 10% unmortgage fee)
                    let mortgaged_value = (property_data.mortgage_value * 9) / 10;
                    total_value = total_value
                        .checked_add(mortgaged_value)
                        .ok_or(GameError::ArithmeticOverflow)?;
                } else {
                    // Unmortgaged property = full mortgage value
                    total_value = total_value
                        .checked_add(property_data.mortgage_value)
                        .ok_or(GameError::ArithmeticOverflow)?;
                }

                // Add building value (houses and hotels at construction cost)
                if property.houses > 0 {
                    let houses_value = property_data
                        .house_cost
                        .checked_mul(property.houses as u64)
                        .ok_or(GameError::ArithmeticOverflow)?;
                    total_value = total_value
                        .checked_add(houses_value)
                        .ok_or(GameError::ArithmeticOverflow)?;
                }

                if property.has_hotel {
                    // Hotel = 5 houses worth
                    let hotel_value = property_data
                        .house_cost
                        .checked_mul(5)
                        .ok_or(GameError::ArithmeticOverflow)?;
                    total_value = total_value
                        .checked_add(hotel_value)
                        .ok_or(GameError::ArithmeticOverflow)?;
                }
            }
        }

        Ok(total_value)
    }

    /// Check if game should end due to bankruptcy (only 1 player remaining)
    pub fn check_bankruptcy_end_condition(&self) -> bool {
        let active_count = self
            .player_eliminated
            .iter()
            .filter(|&&eliminated| !eliminated)
            .count();

        active_count <= 1
    }

    /// Check if game should end due to time limit
    pub fn check_time_end_condition(&self, current_time: i64) -> bool {
        if let Some(end_time) = self.game_end_time {
            current_time >= end_time
        } else {
            false
        }
    }

    /// Get all active players (non-default, non-bankrupt)
    pub fn get_active_players(&self) -> Vec<Pubkey> {
        self.players
            .iter()
            .zip(self.player_eliminated.iter())
            .filter_map(|(player, &eliminated)| if !eliminated { Some(player) } else { None })
            .copied()
            .collect()
    }

    pub fn advance_turn(&mut self) -> Result<()> {
        let mut attempts = 0;

        loop {
            self.current_turn = (self.current_turn + 1) % self.players.len() as u8;

            // Skip eliminated players
            if !self.player_eliminated[self.current_turn as usize] {
                break;
            }

            attempts += 1;
            if attempts >= self.players.len() {
                return Err(GameError::NoActivePlayers.into());
            }
        }

        Ok(())
    }
}

#[account]
#[derive(Debug, InitSpace)]
pub struct PlayerState {
    pub wallet: Pubkey,    // 32 bytes - player's wallet
    pub game: Pubkey,      // 32 bytes - game account
    pub cash_balance: u64, // 8 bytes - player's cash
    pub position: u8,      // 1 byte - board position (0-39)
    pub in_jail: bool,     // 1 byte - jail status
    pub jail_turns: u8,    // 1 byte - turns in jail
    pub doubles_count: u8, // 1 byte - consecutive doubles
    pub is_bankrupt: bool, // 1 byte - bankruptcy status
    #[max_len(40)]
    pub properties_owned: Vec<u8>, // variable - owned property positions
    pub get_out_of_jail_cards: u8, // 1 byte - jail cards owned
    pub net_worth: u64,    // 8 bytes - total asset value
    pub last_rent_collected: i64, // 8 bytes - last rent collection time
    pub festival_boost_turns: u8, // 1 byte - remaining festival boost turns

    pub has_rolled_dice: bool,       // 1 byte - has rolled dice this turn
    pub last_dice_roll: [u8; 2],     // 2 bytes - last dice roll
    pub needs_property_action: bool, // Player landed on property
    pub pending_property_position: Option<u8>, // Which property
    pub needs_chance_card: bool,     // Needs to draw chance card
    pub needs_community_chest_card: bool, // Needs to draw community chest
    pub needs_bankruptcy_check: bool, // Insufficient funds detected
    // pub can_end_turn: bool,          // All actions completed
    pub needs_special_space_action: bool, // Player landed on special space
    pub pending_special_space_position: Option<u8>, // Which special space

    pub card_drawn_at: Option<i64>, // Timestamp when card was drawn

    pub timeout_penalty_count: u8, // 1 byte - number of timeout penalties
    pub last_action_timestamp: i64, // 8 bytes - last action taken
    pub total_timeout_penalties: u8, // 1 byte - lifetime count for stats
}

impl PlayerState {
    pub fn initialize_player_state(
        self: &mut PlayerState,
        wallet: Pubkey,
        game: Pubkey,
        clock: &Sysvar<Clock>,
    ) {
        self.wallet = wallet;
        self.game = game;
        self.cash_balance = STARTING_MONEY as u64;
        self.position = 0;
        self.in_jail = false;
        self.jail_turns = 0;
        self.doubles_count = 0;
        self.is_bankrupt = false;
        self.properties_owned = Vec::new();
        self.get_out_of_jail_cards = 0;
        self.net_worth = STARTING_MONEY as u64;
        self.last_rent_collected = clock.unix_timestamp;
        self.festival_boost_turns = 0;
        self.has_rolled_dice = false;
        self.last_dice_roll = [0, 0];
        self.needs_property_action = false;
        self.pending_property_position = None;
        self.needs_chance_card = false;
        self.needs_community_chest_card = false;
        self.needs_bankruptcy_check = false;
        self.needs_special_space_action = false;
        self.pending_special_space_position = None;
        self.card_drawn_at = None;

        self.timeout_penalty_count = 0;
        self.last_action_timestamp = clock.unix_timestamp;
        self.total_timeout_penalties = 0;
    }

    pub fn record_action(&mut self, clock: &Sysvar<Clock>) {
        self.last_action_timestamp = clock.unix_timestamp;
    }

    pub fn has_recent_activity(&self, current_time: i64, grace_period: u64) -> bool {
        let elapsed = current_time.saturating_sub(self.last_action_timestamp);
        elapsed < grace_period as i64
    }
}

// #[account]
// #[derive(Debug, InitSpace)]
// pub struct PropertyState {
//     pub position: u8,                // 1 byte - board position (0-39)
//     pub game: Pubkey,                // 32 bytes - game account
//     pub owner: Option<Pubkey>,       // 33 bytes - property owner
//     pub price: u16,                  // 2 bytes - purchase price
//     pub color_group: ColorGroup,     // 1 byte - property color group
//     pub property_type: PropertyType, // 1 byte - type of space
//     pub houses: u8,                  // 1 byte - number of houses (0-4)
//     pub has_hotel: bool,             // 1 byte - hotel status
//     pub is_mortgaged: bool,          // 1 byte - mortgage status
//     pub rent_base: u16,              // 2 bytes - base rent
//     pub rent_with_color_group: u16,  // 2 bytes - rent with monopoly
//     pub rent_with_houses: [u16; 4],  // 8 bytes - rent with 1-4 houses
//     pub rent_with_hotel: u16,        // 2 bytes - rent with hotel
//     pub house_cost: u16,             // 2 bytes - cost to build house
//     pub mortgage_value: u16,         // 2 bytes - mortgage value
//     pub last_rent_paid: i64,         // 8 bytes - last rent payment time
//     pub init: bool,                  // 1 byte - init status
// }

// impl PropertyState {}

#[derive(AnchorSerialize, AnchorDeserialize, Debug, InitSpace, Clone, PartialEq, Eq)]
pub enum TradeType {
    MoneyOnly,
    PropertyOnly,
    MoneyForProperty,
    PropertyForMoney,
}

#[account]
#[derive(Debug, InitSpace)]
pub struct TradeState {
    pub game: Pubkey,
    pub proposer: Pubkey,
    pub receiver: Pubkey,
    pub trade_type: TradeType,

    // Money amounts
    pub proposer_money: u64,
    pub receiver_money: u64,

    // Single property (since you want 1 item per trade)
    pub proposer_property: Option<u8>, // property position
    pub receiver_property: Option<u8>, // property position

    pub status: TradeStatus,
    pub created_at: i64,
    pub expires_at: i64,
    pub bump: u8,
}

impl TradeState {}

#[account]
#[derive(Debug, InitSpace)]
pub struct AuctionState {
    pub game: Pubkey,
    pub property_position: u8,
    pub current_bid: u64,
    pub highest_bidder: Option<Pubkey>,
    pub started_at: i64,
    pub ends_at: i64,
    pub is_active: bool,
    pub bump: u8,
}

// ----- new struct
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, InitSpace, PartialEq, Eq)]
pub struct PropertyInfo {
    pub owner: Option<Pubkey>, // 33 bytes - who owns this property
    pub houses: u8,            // 1 byte - number of houses (0-4)
    pub has_hotel: bool,       // 1 byte - has hotel built
    pub is_mortgaged: bool,    // 1 byte - mortgage status
}

impl Default for PropertyInfo {
    fn default() -> Self {
        Self {
            owner: None,
            houses: 0,
            has_hotel: false,
            is_mortgaged: false,
        }
    }
}

impl PropertyInfo {
    pub fn initialize_all() -> Vec<PropertyInfo> {
        vec![PropertyInfo::default(); 40]
    }
}
