use crate::constants::*;
use crate::error::GameError;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked},
};
use ephemeral_rollups_sdk::anchor::delegate;
use ephemeral_rollups_sdk::cpi::DelegateConfig;

#[derive(Accounts)]
pub struct InitializeGame<'info> {
    #[account(
        init,
        payer = creator,
        space = 8 + GameState::INIT_SPACE,
        seeds = [
            b"game",
            config.id.as_ref(),
            &config.next_game_id.to_le_bytes()
            ],
        bump
    )]
    pub game: Box<Account<'info, GameState>>,

    #[account(
        init,
        payer = creator,
        space = 8 + PlayerState::INIT_SPACE + 64,
        seeds = [b"player", game.key().as_ref(), creator.key().as_ref()],
        bump,
    )]
    pub player_state: Box<Account<'info, PlayerState>>,

    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        mut,
        seeds = [b"platform", config.id.as_ref()],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, PlatformConfig>>,

    /// CHECK: game authority PDA
    #[account(
        seeds = [
            GAME_AUTHORITY_SEED.as_ref(),
        ],
        bump,
    )]
    pub game_authority: UncheckedAccount<'info>,

    #[account(
        mint::token_program = token_program,
    )]
    pub token_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = creator,
        associated_token::token_program = token_program
    )]
    // pub creator_token_account: Option<InterfaceAccount<'info, TokenAccount>>,
    pub creator_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        init,
        seeds = [
            TOKEN_VAULT_SEED.as_ref(),
            token_mint.key().as_ref(),
            game.key().as_ref(),
        ],
        token::mint = token_mint,
        token::authority = game_authority,
        token::token_program = token_program,
        payer = creator,
        bump
    )]
    pub token_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    pub token_program: Interface<'info, TokenInterface>,

    pub associated_token_program: Program<'info, AssociatedToken>,

    pub system_program: Program<'info, System>,

    pub clock: Sysvar<'info, Clock>,
}

pub fn initialize_game_handler(
    ctx: Context<InitializeGame>,
    entry_fee: u64,
    time_limit_seconds: Option<i64>,
) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let game = &mut ctx.accounts.game;
    let player_state = &mut ctx.accounts.player_state;
    let clock = &ctx.accounts.clock;

    if entry_fee > 0 {
        // require!(
        //     ctx.accounts.game_authority.is_some()
        //         && ctx.accounts.token_mint.is_some()
        //         && ctx.accounts.creator_token_account.is_some()
        //         && ctx.accounts.token_vault.is_some()
        //         && ctx.accounts.token_program.is_some()
        //         && ctx.accounts.associated_token_program.is_some(),
        //     GameError::MissingTokenAccounts
        // );

        // let token_mint = ctx.accounts.token_mint.as_ref().unwrap();
        let token_mint = &ctx.accounts.token_mint;
        // let creator_token_account = ctx.accounts.creator_token_account.as_ref().unwrap();
        let creator_token_account = &ctx.accounts.creator_token_account;
        // let token_vault = ctx.accounts.token_vault.as_ref().unwrap();
        let token_vault = &ctx.accounts.token_vault;
        // let game_authority = ctx.accounts.game_authority.as_ref().unwrap();
        let game_authority = &ctx.accounts.game_authority;

        // Validate game authority PDA
        let (expected_game_authority, _) =
            Pubkey::find_program_address(&[GAME_AUTHORITY_SEED], ctx.program_id);

        require!(
            game_authority.key() == expected_game_authority,
            GameError::InvalidGameAuthority
        );

        require!(
            creator_token_account.mint == token_mint.key(),
            GameError::InvalidTokenAccount
        );
        require!(
            creator_token_account.owner == ctx.accounts.creator.key(),
            GameError::InvalidTokenAccount
        );

        require!(
            token_vault.mint == token_mint.key(),
            GameError::InvalidTokenAccount
        );
        require!(
            token_vault.owner == game_authority.key(),
            GameError::InvalidTokenAccount
        );

        // Transfer entry fee from creator to vault
        let transfer_accounts = TransferChecked {
            from: creator_token_account.to_account_info(),
            mint: token_mint.to_account_info(),
            to: token_vault.to_account_info(),
            authority: ctx.accounts.creator.to_account_info(),
        };

        let transfer_ctx = CpiContext::new(
            ctx.accounts
                .token_program
                .as_ref()
                // .unwrap()
                .to_account_info(),
            transfer_accounts,
        );

        transfer_checked(transfer_ctx, entry_fee, token_mint.decimals)?;

        game.token_mint = Some(token_mint.key());
        game.token_vault = Some(token_vault.key());
        game.total_prize_pool = entry_fee;
    } else {
        game.token_mint = None;
        game.token_vault = None;
        game.total_prize_pool = 0;
    }

    let game_id = config.next_game_id;
    config.next_game_id += 1;
    config.total_games_created += 1;

    // Initialize game state
    game.game_id = game_id;
    game.config_id = config.id;
    game.creator = ctx.accounts.creator.key();
    game.bump = ctx.bumps.game;
    game.game_status = GameStatus::WaitingForPlayers;
    game.current_turn = 0;
    game.current_players = 0; // Initial player count
    game.max_players = MAX_PLAYERS;
    game.players = vec![];
    game.player_eliminated = vec![];
    game.total_players = 0;
    game.active_players = 0;
    game.houses_remaining = TOTAL_HOUSES;
    game.hotels_remaining = TOTAL_HOTELS;
    game.created_at = clock.unix_timestamp;
    game.bank_balance = 1_000_000; // Initial bank balance
    game.time_limit = time_limit_seconds;
    game.game_end_time = None;
    game.end_condition_met = false;
    game.winner = None;
    game.turn_started_at = clock.unix_timestamp;
    game.active_trades = vec![];
    game.next_trade_id = 0;
    game.entry_fee = entry_fee;
    game.turn_timeout_seconds = DEFAULT_TURN_TIMEOUT_SECONDS;
    game.turn_grace_period_seconds = DEFAULT_GRACE_PERIOD_SECONDS;
    game.timeout_enforcement_enabled = true;

    game.initialize_properties();

    // Initialize player state
    player_state.initialize_player_state(ctx.accounts.creator.key(), game.key(), clock);

    // Add player to game
    game.players.push(player_state.wallet);
    game.player_eliminated.push(false);
    game.current_players = game.players.len() as u8;

    msg!(
        "Game initialized by creator: {}",
        ctx.accounts.creator.key()
    );
    msg!("Game account: {}", game.key());
    msg!("Game created at timestamp: {}", game.created_at);

    Ok(())
}

#[derive(Accounts)]
pub struct JoinGame<'info> {
    #[account(
        mut,
        seeds = [b"game", game.config_id.as_ref(), &game.game_id.to_le_bytes().as_ref()],
        bump = game.bump,
        constraint = game.game_status == GameStatus::WaitingForPlayers @ GameError::GameNotInProgress,
        constraint = game.current_players < MAX_PLAYERS @ GameError::MaxPlayersReached
    )]
    pub game: Box<Account<'info, GameState>>,

    #[account(
        init,
        payer = player,
        space = 8 + PlayerState::INIT_SPACE + 64,
        seeds = [b"player", game.key().as_ref(), player.key().as_ref()],
        bump
    )]
    pub player_state: Box<Account<'info, PlayerState>>,

    #[account(mut)]
    pub player: Signer<'info>,

    // pub game_authority: Option<UncheckedAccount<'info>>,
    /// CHECK: game authority PDA - only required for paid games
    #[account(
        seeds = [
            GAME_AUTHORITY_SEED.as_ref(),
        ],
        bump,
    )]
    pub game_authority: UncheckedAccount<'info>,

    #[account(
        mint::token_program = token_program,
    )]
    // pub token_mint: Option<InterfaceAccount<'info, Mint>>,
    pub token_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = player,
        associated_token::token_program = token_program
    )]
    // pub player_token_account: Option<InterfaceAccount<'info, TokenAccount>>,
    pub player_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        token::mint = token_mint,
        token::authority = game_authority,
        token::token_program = token_program,
    )]
    // pub token_vault: Option<InterfaceAccount<'info, TokenAccount>>,
    pub token_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    // pub token_program: Option<Interface<'info, TokenInterface>>,
    pub token_program: Interface<'info, TokenInterface>,
    // pub associated_token_program: Option<Program<'info, AssociatedToken>>,
    pub associated_token_program: Program<'info, AssociatedToken>,

    pub system_program: Program<'info, System>,
    pub clock: Sysvar<'info, Clock>,
}

pub fn join_game_handler(ctx: Context<JoinGame>) -> Result<()> {
    let game = &mut ctx.accounts.game;
    let player_state = &mut ctx.accounts.player_state;
    let player_pubkey = ctx.accounts.player.key();
    let clock = &ctx.accounts.clock;

    msg!("Join game: {}", game.key());
    msg!("Player: {}", player_pubkey);

    for existing_player in &game.players {
        msg!("Existing player: {}", existing_player);
        if *existing_player == player_pubkey {
            return Err(GameError::PlayerAlreadyExists.into());
        }
    }

    if game.entry_fee > 0 {
        // require!(
        //     ctx.accounts.game_authority.is_some()
        //         && ctx.accounts.token_mint.is_some()
        //         && ctx.accounts.player_token_account.is_some()
        //         && ctx.accounts.token_vault.is_some()
        //         && ctx.accounts.token_program.is_some(),
        //     GameError::MissingTokenAccounts
        // );

        let token_mint = &ctx.accounts.token_mint;
        let player_token_account = &ctx.accounts.player_token_account;
        let token_vault = &ctx.accounts.token_vault;
        let game_authority = &ctx.accounts.game_authority;

        let (expected_game_authority, _) =
            Pubkey::find_program_address(&[GAME_AUTHORITY_SEED], ctx.program_id);

        require!(
            game_authority.key() == expected_game_authority,
            GameError::InvalidGameAuthority
        );

        require!(
            player_token_account.mint == token_mint.key(),
            GameError::InvalidTokenAccount
        );
        require!(
            player_token_account.owner == ctx.accounts.player.key(),
            GameError::InvalidTokenAccount
        );

        require!(
            token_vault.mint == token_mint.key(),
            GameError::InvalidTokenAccount
        );
        require!(
            token_vault.owner == game_authority.key(),
            GameError::InvalidTokenAccount
        );

        require!(
            Some(token_mint.key()) == game.token_mint,
            GameError::InvalidTokenAccount
        );
        require!(
            Some(token_vault.key()) == game.token_vault,
            GameError::InvalidTokenAccount
        );

        let transfer_accounts = TransferChecked {
            from: player_token_account.to_account_info(),
            mint: token_mint.to_account_info(),
            to: token_vault.to_account_info(),
            authority: ctx.accounts.player.to_account_info(),
        };

        let transfer_ctx = CpiContext::new(
            ctx.accounts
                .token_program
                .as_ref()
                // .unwrap()
                .to_account_info(),
            transfer_accounts,
        );

        transfer_checked(transfer_ctx, game.entry_fee, token_mint.decimals)?;

        game.total_prize_pool = game
            .total_prize_pool
            .checked_add(game.entry_fee)
            .ok_or(GameError::ArithmeticOverflow)?;

        msg!(
            "Entry fee {} paid by player {}",
            game.entry_fee,
            player_pubkey
        );
        msg!("Total prize pool: {}", game.total_prize_pool);
    }
    // else {
    //     // For free games, ensure no token accounts are provided
    //     require!(
    //         ctx.accounts.game_authority.is_none()
    //             && ctx.accounts.token_mint.is_none()
    //             && ctx.accounts.player_token_account.is_none()
    //             && ctx.accounts.token_vault.is_none()
    //             && ctx.accounts.token_program.is_none(),
    //         GameError::UnexpectedTokenAccounts
    //     );
    // }

    // Initialize player state
    player_state.initialize_player_state(player_pubkey, game.key(), clock);

    // Add player to game
    game.players.push(player_pubkey);
    game.player_eliminated.push(false);
    game.current_players = game.players.len() as u8;
    game.total_players = game.players.len() as u8;
    game.active_players = game.current_players;

    msg!(
        "Player {} joined game. Total players: {}",
        player_pubkey,
        game.current_players
    );

    // Auto-start game if we have minimum players and all slots filled
    if game.current_players >= MIN_PLAYERS {
        msg!("Minimum players reached. Game can be started.");
    }

    emit!(PlayerJoined {
        game: game.key(),
        player: player_pubkey,
        player_index: game.current_players - 1,
        total_players: game.current_players,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

#[delegate]
#[derive(Accounts)]
pub struct StartGame<'info> {
    #[account(
        mut,
        seeds = [b"game", game.config_id.as_ref(), &game.game_id.to_le_bytes().as_ref()],
        bump,
        constraint = game.game_status == GameStatus::WaitingForPlayers @ GameError::GameNotInProgress,
        constraint = game.current_players >= MIN_PLAYERS @ GameError::MinPlayersNotMet,
        constraint = authority.key() == game.creator @ GameError::Unauthorized,
        del
    )]
    pub game: Box<Account<'info, GameState>>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub clock: Sysvar<'info, Clock>,
}

pub fn start_game_handler<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, StartGame<'info>>,
) -> Result<()> {
    {
        let game = &mut ctx.accounts.game;
        let clock = &ctx.accounts.clock;

        // Change game status to in progress
        game.game_status = GameStatus::InProgress;
        game.current_turn = 0; // First player starts
        game.turn_started_at = clock.unix_timestamp;
        game.started_at = Some(clock.unix_timestamp);

        if let Some(limit) = game.time_limit {
            game.game_end_time = Some(clock.unix_timestamp + limit);
        } else {
            game.game_end_time = None;
        }
    }

    {
        msg!("Start delegate");

        let authority = &ctx.accounts.authority;
        let owner_program = &ctx.accounts.owner_program;
        let delegation_program = &ctx.accounts.delegation_program;
        let game = &ctx.accounts.game;
        let game_key = game.key();
        let players = &game.players;

        game.exit(&crate::ID)?;
        ctx.accounts.delegate_game(
            &ctx.accounts.authority,
            &[
                b"game",
                game.config_id.as_ref(),
                &game.game_id.to_le_bytes(),
            ],
            DelegateConfig {
                commit_frequency_ms: 30_000,
                validator: Some(pubkey!("MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57")),
            },
        )?;

        let remaining_accounts_iter = &mut ctx.remaining_accounts.iter();

        // delegate player accounts
        for player_pubkey in players.iter() {
            let player_account = remaining_accounts_iter
                .next()
                .ok_or(GameError::InvalidAccount)?;
            player_account.exit(&crate::ID)?;

            let player_buffer_account = remaining_accounts_iter
                .next()
                .ok_or(GameError::InvalidAccount)?;

            let player_delegation_record_account = remaining_accounts_iter
                .next()
                .ok_or(GameError::InvalidAccount)?;

            let player_delegation_metadata_account = remaining_accounts_iter
                .next()
                .ok_or(GameError::InvalidAccount)?;

            let del_accounts = ephemeral_rollups_sdk::cpi::DelegateAccounts {
                payer: &authority.to_account_info(),
                pda: &player_account.to_account_info(),
                owner_program: &owner_program.to_account_info(),
                buffer: player_buffer_account,
                delegation_record: player_delegation_record_account,
                delegation_metadata: player_delegation_metadata_account,
                delegation_program: &delegation_program.to_account_info(),
                system_program: &ctx.accounts.system_program.to_account_info(),
            };

            let seeds = &[b"player", game_key.as_ref(), player_pubkey.as_ref()];

            let config = DelegateConfig {
                commit_frequency_ms: 30_000,
                validator: Some(pubkey!("MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57")),
            };

            ephemeral_rollups_sdk::cpi::delegate_account(del_accounts, seeds, config)?;

            msg!("Player {} delegated", player_pubkey);
        }
    }

    msg!("Game started!");

    let game = &ctx.accounts.game;
    let clock = &ctx.accounts.clock;
    emit!(GameStarted {
        game: game.key(),
        total_players: game.current_players,
        first_player: game.players[0],
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
