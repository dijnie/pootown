use anchor_lang::prelude::*;

#[error_code]
pub enum GameError {
    // Game State Errors
    #[msg("Game has not been initialized")]
    GameNotInitialized,

    #[msg("Game has already been initialized")]
    GameAlreadyInitialized,

    #[msg("Game has already started, cannot leave")]
    GameAlreadyStarted,

    #[msg("Game is not in progress")]
    GameNotInProgress,

    #[msg("Game has already ended")]
    GameAlreadyEnded,

    #[msg("Game cannot end - multiple players still active")]
    GameCannotEnd,

    #[msg("Maximum number of players reached")]
    MaxPlayersReached,

    #[msg("Minimum number of players not met")]
    MinPlayersNotMet,

    #[msg("Game cannot start with current player count")]
    CannotStartGame,

    #[msg("Creator cannot leave game, use cancel_game instead")]
    CreatorCannotLeaveGame,

    #[msg("Missing player account in remaining accounts")]
    MissingPlayerAccount,

    #[msg("Missing player token account in remaining accounts")]
    MissingPlayerTokenAccount,

    #[msg("Invalid player account provided")]
    InvalidPlayerAccount,

    // Player Errors
    #[msg("Player not found in game")]
    PlayerNotFound,

    #[msg("Player already exists in game")]
    PlayerAlreadyExists,

    #[msg("Not player's turn")]
    NotPlayerTurn,

    #[msg("Player is in jail")]
    PlayerInJail,

    #[msg("Player is not in jail")]
    PlayerNotInJail,

    #[msg("Player is bankrupt")]
    PlayerBankrupt,

    #[msg("Player has insufficient funds")]
    InsufficientFunds,

    #[msg("Player already rolled dice this turn")]
    AlreadyRolledDice,

    #[msg("Player has not rolled dice yet")]
    HasNotRolledDice,

    #[msg("Player must pay rent before ending turn")]
    MustPayRent,

    #[msg("Player must handle special space before ending turn")]
    MustHandleSpecialSpace,

    // Property Errors
    #[msg("Property not found")]
    PropertyNotFound,

    #[msg("Property is not purchasable")]
    PropertyNotPurchasable,

    #[msg("Property already owned")]
    PropertyAlreadyOwned,

    #[msg("Property not owned by player")]
    PropertyNotOwnedByPlayer,

    #[msg("Property is mortgaged")]
    PropertyMortgaged,

    #[msg("Property is not mortgaged")]
    PropertyNotMortgaged,

    #[msg("Cannot mortgage property with buildings")]
    CannotMortgageWithBuildings,

    #[msg("Player does not own all properties in color group")]
    DoesNotOwnColorGroup,

    #[msg("Cannot build on this property type")]
    CannotBuildOnPropertyType,

    #[msg("Maximum houses reached on property")]
    MaxHousesReached,

    #[msg("Property already has hotel")]
    PropertyHasHotel,

    #[msg("Must build houses evenly across color group")]
    MustBuildEvenly,

    #[msg("Must sell houses evenly across color group")]
    MustSellEvenly,

    #[msg("No houses to sell on property")]
    NoHousesToSell,

    #[msg("No hotel to sell on property")]
    NoHotelToSell,

    #[msg("Not enough houses available in bank")]
    NotEnoughHousesInBank,

    #[msg("Not enough hotels available in bank")]
    NotEnoughHotelsInBank,

    // Movement and Dice Errors
    #[msg("Invalid dice roll")]
    InvalidDiceRoll,

    #[msg("Invalid board position")]
    InvalidBoardPosition,

    #[msg("Invalid property position")]
    InvalidPropertyPosition,

    #[msg("Player rolled doubles too many times")]
    TooManyDoubles,

    // Trade Errors
    #[msg("Trade not found")]
    TradeNotFound,

    #[msg("Trade already exists")]
    TradeAlreadyExists,

    #[msg("Cannot trade with yourself")]
    CannotTradeWithSelf,

    #[msg("Trade has expired")]
    TradeExpired,

    #[msg("Trade already accepted")]
    TradeAlreadyAccepted,

    #[msg("Trade already rejected")]
    TradeAlreadyRejected,

    #[msg("Not authorized to accept/reject trade")]
    NotAuthorizedForTrade,

    #[msg("Cannot trade mortgaged properties")]
    CannotTradeMortgagedProperties,

    #[msg("Invalid trade proposal")]
    InvalidTradeProposal,

    // Auction Errors
    #[msg("Auction not found")]
    AuctionNotFound,

    #[msg("Auction already exists")]
    AuctionAlreadyExists,

    #[msg("Auction has expired")]
    AuctionExpired,

    #[msg("Auction has already ended")]
    AuctionAlreadyEnded,

    #[msg("Bid amount too low")]
    BidTooLow,

    #[msg("Cannot bid on own auction")]
    CannotBidOnOwnAuction,

    #[msg("Player already highest bidder")]
    AlreadyHighestBidder,

    // Rent Errors
    #[msg("No rent owed")]
    NoRentOwed,

    #[msg("Rent already paid")]
    RentAlreadyPaid,

    #[msg("Cannot collect rent from own property")]
    CannotCollectRentFromOwnProperty,

    #[msg("Cannot collect rent on mortgaged property")]
    CannotCollectRentOnMortgagedProperty,

    // Jail Errors
    #[msg("Cannot pay jail fine when not in jail")]
    CannotPayJailFineWhenNotInJail,

    #[msg("Maximum jail turns exceeded")]
    MaxJailTurnsExceeded,

    #[msg("Must roll doubles or pay fine to leave jail")]
    MustRollDoublesOrPayFine,

    #[msg("Player has no Get Out of Jail cards")]
    NoGetOutOfJailCards,

    // Special Space Errors
    #[msg("Invalid special space action")]
    InvalidSpecialSpaceAction,

    #[msg("Chance card not implemented")]
    ChanceCardNotImplemented,

    #[msg("Community chest card not implemented")]
    CommunityChestCardNotImplemented,

    // Tax Errors
    #[msg("Tax amount calculation error")]
    TaxCalculationError,

    #[msg("Cannot pay tax with insufficient funds")]
    CannotPayTax,

    // Bankruptcy Errors
    #[msg("Player must declare bankruptcy")]
    MustDeclareBankruptcy,

    #[msg("Cannot declare bankruptcy with sufficient assets")]
    CannotDeclareBankruptcyWithAssets,

    #[msg("Bankruptcy process already started")]
    BankruptcyAlreadyStarted,

    #[msg("Bankruptcy check not required")]
    BankruptcyNotRequired,

    // Account and Authorization Errors
    #[msg("Unauthorized action")]
    Unauthorized,

    #[msg("Invalid account provided")]
    InvalidAccount,

    #[msg("Account already initialized")]
    AccountAlreadyInitialized,

    #[msg("Account not initialized")]
    AccountNotInitialized,

    #[msg("Invalid signer")]
    InvalidSigner,

    // Math Errors
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,

    #[msg("Arithmetic underflow")]
    ArithmeticUnderflow,

    #[msg("Division by zero")]
    DivisionByZero,

    #[msg("Invalid parameter")]
    InvalidParameter,

    #[msg("Invalid game configuration")]
    InvalidGameConfiguration,

    // Randomness Errors
    #[msg("Failed to generate random number")]
    RandomnessGenerationFailed,

    #[msg("Invalid randomness source")]
    InvalidRandomnessSource,

    #[msg("Randomness unavailable")]
    RandomnessUnavailable,

    // Time Errors
    #[msg("Invalid timestamp")]
    InvalidTimestamp,

    #[msg("Clock not available")]
    ClockNotAvailable,

    #[msg("Action timeout exceeded")]
    ActionTimeoutExceeded,

    // General Errors
    #[msg("Operation not allowed in current game state")]
    OperationNotAllowed,

    #[msg("Feature not implemented")]
    FeatureNotImplemented,

    #[msg("Internal error occurred")]
    InternalError,

    #[msg("Invalid input data")]
    InvalidInputData,

    #[msg("Resource not available")]
    ResourceNotAvailable,

    #[msg("Property not owned")]
    PropertyNotOwned,

    #[msg("Invalid property owner")]
    InvalidPropertyOwner,

    #[msg("Invalid house count")]
    InvalidHouseCount,

    #[msg("Property already mortgaged")]
    PropertyAlreadyMortgaged,

    #[msg("Dice roll error")]
    DiceRollError,

    #[msg("Trade is not pending")]
    TradeNotPending,

    #[msg("Not the trade target")]
    NotTradeTarget,

    #[msg("Not the trade proposer")]
    NotTradeProposer,

    #[msg("Invalid trade type")]
    InvalidTradeType,

    #[msg("Auction is not active")]
    AuctionNotActive,

    #[msg("Auction has ended")]
    AuctionEnded,

    #[msg("Auction is still active")]
    AuctionStillActive,

    #[msg("Too many active trades")]
    TooManyActiveTrades,

    // Token and Fee Errors
    #[msg("Missing required token accounts for entry fee")]
    MissingTokenAccounts,

    #[msg("Invalid game authority PDA")]
    InvalidGameAuthority,

    #[msg("Invalid token vault PDA")]
    InvalidTokenVault,

    #[msg("Invalid token account")]
    InvalidTokenAccount,

    #[msg("Entry fee transfer failed")]
    EntryFeeTransferFailed,

    #[msg("Token accounts provided for free game")]
    UnexpectedTokenAccounts,

    #[msg("Game is already ending")]
    GameAlreadyEnding,

    #[msg("Game is not finished yet")]
    GameNotFinished,

    #[msg("Prize has already been claimed")]
    PrizeAlreadyClaimed,

    #[msg("No winner has been declared")]
    NoWinnerDeclared,

    #[msg("You are not the winner")]
    NotWinner,

    #[msg("No prize to claim")]
    NoPrizeToClaim,

    #[msg("No active players found")]
    NoActivePlayers,

    // Timeout errors
    #[msg("Turn timeout has not been reached yet")]
    TimeoutNotReached,

    #[msg("Grace period has not expired yet")]
    GracePeriodNotExpired,

    #[msg("Player has not reached maximum timeout penalties")]
    InsufficientTimeoutPenalties,

    #[msg("Timeout enforcement is disabled for this game")]
    TimeoutEnforcementDisabled,

    #[msg("Cannot force end turn - player has taken action recently")]
    PlayerHasRecentActivity,

    #[msg("Insufficient lamports for timeout bounty")]
    InsufficientBountyFunds,

    #[msg("Player is already bankrupt")]
    PlayerAlreadyBankrupt,

    #[msg("No active players remaining")]
    NoActivePlayersRemaining,
}
