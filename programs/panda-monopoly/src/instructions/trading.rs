use crate::constants::*;
use crate::error::GameError;
use crate::state::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct CreateTrade<'info> {
    #[account(
        mut,
        seeds = [b"game", game.config_id.as_ref(), &game.game_id.to_le_bytes().as_ref()],
        bump = game.bump,
        constraint = game.game_status == GameStatus::InProgress @ GameError::GameNotInProgress
    )]
    pub game: Box<Account<'info, GameState>>,

    #[account(
        mut,
        seeds = [b"player", game.key().as_ref(), proposer.key().as_ref()],
        bump
    )]
    pub proposer_state: Box<Account<'info, PlayerState>>,

    #[account(
        seeds = [b"player", game.key().as_ref(), receiver.key().as_ref()],
        bump
    )]
    pub receiver_state: Box<Account<'info, PlayerState>>,

    #[account(mut)]
    pub proposer: Signer<'info>,

    /// CHECK: This is validated by the receiver_state account constraint
    pub receiver: UncheckedAccount<'info>,

    pub clock: Sysvar<'info, Clock>,
}

pub fn create_trade_handler(
    ctx: Context<CreateTrade>,
    trade_type: TradeType,
    proposer_money: u64,
    receiver_money: u64,
    proposer_property: Option<u8>,
    receiver_property: Option<u8>,
) -> Result<()> {
    let game = &mut ctx.accounts.game;
    let proposer_state = &mut ctx.accounts.proposer_state;
    let receiver_state = &ctx.accounts.receiver_state;
    let clock = &ctx.accounts.clock;

    // Clean up expired trades first
    game.cleanup_expired_trades(clock.unix_timestamp);

    // Check if we can add a new trade
    require!(game.can_add_trade(), GameError::TooManyActiveTrades);

    // Validate trade parameters
    require!(
        proposer_money <= proposer_state.cash_balance,
        GameError::InsufficientFunds
    );

    proposer_state.record_action(clock);

    // Validate proposer property ownership
    if let Some(prop_pos) = proposer_property {
        require!(
            proposer_state.properties_owned.contains(&prop_pos),
            GameError::PropertyNotOwned
        );

        // Also validate ownership in GameState properties
        let property = game.get_property(prop_pos)?;
        require!(
            property.owner == Some(ctx.accounts.proposer.key()),
            GameError::PropertyNotOwnedByPlayer
        );

        // Cannot trade mortgaged properties
        require!(
            !property.is_mortgaged,
            GameError::CannotTradeMortgagedProperties
        );
    }

    // Validate receiver property ownership
    if let Some(prop_pos) = receiver_property {
        require!(
            receiver_state.properties_owned.contains(&prop_pos),
            GameError::PropertyNotOwned
        );

        // Also validate ownership in GameState properties
        let property = game.get_property(prop_pos)?;
        require!(
            property.owner == Some(ctx.accounts.receiver.key()),
            GameError::PropertyNotOwnedByPlayer
        );

        // Cannot trade mortgaged properties
        require!(
            !property.is_mortgaged,
            GameError::CannotTradeMortgagedProperties
        );
    }

    // Validate trade type matches the provided parameters
    match trade_type {
        TradeType::MoneyOnly => {
            require!(
                proposer_property.is_none() && receiver_property.is_none(),
                GameError::InvalidTradeType
            );
            require!(
                proposer_money > 0 || receiver_money > 0,
                GameError::InvalidTradeType
            );
        }
        TradeType::PropertyOnly => {
            require!(
                proposer_money == 0 && receiver_money == 0,
                GameError::InvalidTradeType
            );
            require!(
                proposer_property.is_some() || receiver_property.is_some(),
                GameError::InvalidTradeType
            );
        }
        TradeType::MoneyForProperty => {
            require!(
                proposer_money > 0 && receiver_property.is_some(),
                GameError::InvalidTradeType
            );
            require!(
                receiver_money == 0 && proposer_property.is_none(),
                GameError::InvalidTradeType
            );
        }
        TradeType::PropertyForMoney => {
            require!(
                proposer_property.is_some() && receiver_money > 0,
                GameError::InvalidTradeType
            );
            require!(
                proposer_money == 0 && receiver_property.is_none(),
                GameError::InvalidTradeType
            );
        }
    }

    // Create the trade
    let trade_id = game.get_next_trade_id();
    let trade = TradeInfo {
        id: trade_id,
        proposer: ctx.accounts.proposer.key(),
        receiver: ctx.accounts.receiver.key(),
        trade_type: trade_type.clone(),
        proposer_money,
        receiver_money,
        proposer_property,
        receiver_property,
        status: TradeStatus::Pending,
        created_at: clock.unix_timestamp,
        expires_at: clock.unix_timestamp + TRADE_EXPIRY_SECONDS,
    };

    game.active_trades.push(trade);

    emit!(TradeCreated {
        game: game.key(),
        trade_id,
        proposer: ctx.accounts.proposer.key(),
        receiver: ctx.accounts.receiver.key(),
        trade_type,
        proposer_money,
        receiver_money,
        proposer_property,
        receiver_property,
        expires_at: clock.unix_timestamp + TRADE_EXPIRY_SECONDS,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct AcceptTrade<'info> {
    #[account(
        mut,
        seeds = [b"game", game.config_id.as_ref(), &game.game_id.to_le_bytes().as_ref()],
        bump = game.bump,
        constraint = game.game_status == GameStatus::InProgress @ GameError::GameNotInProgress
    )]
    pub game: Box<Account<'info, GameState>>,

    #[account(
        mut,
        seeds = [b"player", game.key().as_ref(), proposer_state.wallet.as_ref()],
        bump
    )]
    pub proposer_state: Box<Account<'info, PlayerState>>,

    #[account(
        mut,
        seeds = [b"player", game.key().as_ref(), accepter.key().as_ref()],
        bump
    )]
    pub accepter_state: Box<Account<'info, PlayerState>>,

    #[account(mut)]
    pub accepter: Signer<'info>,

    pub clock: Sysvar<'info, Clock>,
}

pub fn accept_trade_handler(ctx: Context<AcceptTrade>, trade_id: u8) -> Result<()> {
    let game = &mut ctx.accounts.game;
    let proposer_state = &mut ctx.accounts.proposer_state;
    let accepter_state = &mut ctx.accounts.accepter_state;
    let clock = &ctx.accounts.clock;

    // Clean up expired trades first
    // game.cleanup_expired_trades(clock.unix_timestamp);

    // Find the trade
    let trade = game
        .find_trade_by_id(trade_id)
        .ok_or(GameError::TradeNotFound)?
        .clone(); // Clone to avoid borrow checker issues

    // Validate trade
    require!(
        trade.status == TradeStatus::Pending,
        GameError::TradeNotPending
    );
    require!(
        trade.receiver == ctx.accounts.accepter.key(),
        GameError::NotTradeTarget
    );
    require!(
        trade.expires_at > clock.unix_timestamp,
        GameError::TradeExpired
    );

    // Validate funds and properties are still available
    require!(
        proposer_state.cash_balance >= trade.proposer_money,
        GameError::InsufficientFunds
    );
    require!(
        accepter_state.cash_balance >= trade.receiver_money,
        GameError::InsufficientFunds
    );

    accepter_state.record_action(clock);

    if let Some(prop_pos) = trade.proposer_property {
        require!(
            proposer_state.properties_owned.contains(&prop_pos),
            GameError::PropertyNotOwned
        );

        // Validate ownership in GameState properties
        let property = game.get_property(prop_pos)?;
        require!(
            property.owner == Some(trade.proposer),
            GameError::PropertyNotOwnedByPlayer
        );
        require!(
            !property.is_mortgaged,
            GameError::CannotTradeMortgagedProperties
        );
    }

    if let Some(prop_pos) = trade.receiver_property {
        require!(
            accepter_state.properties_owned.contains(&prop_pos),
            GameError::PropertyNotOwned
        );

        // Validate ownership in GameState properties
        let property = game.get_property(prop_pos)?;
        require!(
            property.owner == Some(trade.receiver),
            GameError::PropertyNotOwnedByPlayer
        );
        require!(
            !property.is_mortgaged,
            GameError::CannotTradeMortgagedProperties
        );
    }

    // Execute the trade
    // Transfer money
    if trade.proposer_money > 0 {
        proposer_state.cash_balance -= trade.proposer_money;
        accepter_state.cash_balance += trade.proposer_money;
    }

    if trade.receiver_money > 0 {
        accepter_state.cash_balance -= trade.receiver_money;
        proposer_state.cash_balance += trade.receiver_money;
    }

    // Transfer properties
    if let Some(prop_pos) = trade.proposer_property {
        // Update PlayerState ownership arrays
        proposer_state.properties_owned.retain(|&x| x != prop_pos);
        accepter_state.properties_owned.push(prop_pos);

        // Update GameState property ownership
        let property = game.get_property_mut(prop_pos)?;
        property.owner = Some(trade.receiver);
    }

    if let Some(prop_pos) = trade.receiver_property {
        // Update PlayerState ownership arrays
        accepter_state.properties_owned.retain(|&x| x != prop_pos);
        proposer_state.properties_owned.push(prop_pos);

        // Update GameState property ownership
        let property = game.get_property_mut(prop_pos)?;
        property.owner = Some(trade.proposer);
    }

    // Update trade status and remove from active trades
    game.remove_trade_by_id(trade_id);

    emit!(TradeAccepted {
        game: game.key(),
        trade_id,
        proposer: trade.proposer,
        receiver: trade.receiver,
        accepter: ctx.accounts.accepter.key(),
    });

    Ok(())
}

#[derive(Accounts)]
pub struct RejectTrade<'info> {
    #[account(
        mut,
        seeds = [b"game", game.config_id.as_ref(), &game.game_id.to_le_bytes().as_ref()],
        bump = game.bump,
    )]
    pub game: Box<Account<'info, GameState>>,

    #[account(
        mut,
        seeds = [b"player", game.key().as_ref(), rejecter_state.wallet.as_ref()],
        bump
    )]
    pub rejecter_state: Box<Account<'info, PlayerState>>,

    #[account(mut)]
    pub rejecter: Signer<'info>,

    pub clock: Sysvar<'info, Clock>,
}

pub fn reject_trade_handler(ctx: Context<RejectTrade>, trade_id: u8) -> Result<()> {
    let game_key = ctx.accounts.game.key().clone();
    let game = &mut ctx.accounts.game;
    let clock = &ctx.accounts.clock;

    // Clean up expired trades first
    game.cleanup_expired_trades(clock.unix_timestamp);

    // Find the trade
    let trade = game
        .find_trade_by_id_mut(trade_id)
        .ok_or(GameError::TradeNotFound)?;

    // Validate trade
    require!(
        trade.status == TradeStatus::Pending,
        GameError::TradeNotPending
    );
    require!(
        trade.receiver == ctx.accounts.rejecter.key(),
        GameError::NotTradeTarget
    );

    ctx.accounts.rejecter_state.record_action(clock);

    // Update trade status
    trade.status = TradeStatus::Rejected;

    emit!(TradeRejected {
        game: game_key,
        trade_id,
        proposer: trade.proposer,
        receiver: trade.receiver,
        rejecter: ctx.accounts.rejecter.key(),
    });

    // Remove the trade from active trades
    game.remove_trade_by_id(trade_id);

    Ok(())
}

#[derive(Accounts)]
#[instruction(trade_id: u8)]
pub struct CancelTrade<'info> {
    #[account(
        mut,
        seeds = [b"game", game.config_id.as_ref(), &game.game_id.to_le_bytes().as_ref()],
        bump = game.bump,
    )]
    pub game: Box<Account<'info, GameState>>,

    #[account(
        mut,
        seeds = [b"player", game.key().as_ref(), canceller_state.wallet.as_ref()],
        bump
    )]
    pub canceller_state: Box<Account<'info, PlayerState>>,

    #[account(mut)]
    pub canceller: Signer<'info>,

    pub clock: Sysvar<'info, Clock>,
}

pub fn cancel_trade_handler(ctx: Context<CancelTrade>, trade_id: u8) -> Result<()> {
    let game_key = ctx.accounts.game.key().clone();
    let game = &mut ctx.accounts.game;
    let clock = &ctx.accounts.clock;

    // Clean up expired trades first
    game.cleanup_expired_trades(clock.unix_timestamp);

    // Find the trade
    let trade = game
        .find_trade_by_id_mut(trade_id)
        .ok_or(GameError::TradeNotFound)?;

    // Validate trade
    require!(
        trade.status == TradeStatus::Pending,
        GameError::TradeNotPending
    );
    require!(
        trade.proposer == ctx.accounts.canceller.key(),
        GameError::NotTradeProposer
    );

    ctx.accounts.canceller_state.record_action(clock);

    // Update trade status
    trade.status = TradeStatus::Cancelled;

    emit!(TradeCancelled {
        game: game_key,
        trade_id,
        proposer: trade.proposer,
        receiver: trade.receiver,
        canceller: ctx.accounts.canceller.key(),
    });

    // Remove the trade from active trades
    game.remove_trade_by_id(trade_id);

    Ok(())
}

// New instruction to clean up expired trades (can be called by anyone)
#[derive(Accounts)]
pub struct CleanupExpiredTrades<'info> {
    #[account(
        mut,
        seeds = [b"game", game.config_id.as_ref(), &game.game_id.to_le_bytes().as_ref()],
        bump = game.bump,
    )]
    pub game: Box<Account<'info, GameState>>,

    pub clock: Sysvar<'info, Clock>,
}

pub fn cleanup_expired_trades_handler(ctx: Context<CleanupExpiredTrades>) -> Result<()> {
    let game = &mut ctx.accounts.game;
    let clock = &ctx.accounts.clock;

    let initial_count = game.active_trades.len();
    game.cleanup_expired_trades(clock.unix_timestamp);
    let final_count = game.active_trades.len();

    msg!(
        "Cleaned up {} expired trades. Active trades: {}",
        initial_count - final_count,
        final_count
    );

    emit!(TradesCleanedUp {
        game: game.key(),
        trades_removed: (initial_count - final_count) as u8,
        remaining_trades: final_count as u8,
    });

    Ok(())
}
