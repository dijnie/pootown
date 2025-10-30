use crate::error::GameError;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    close_account, transfer_checked, CloseAccount, Mint, TokenAccount, TokenInterface,
    TransferChecked,
};

#[derive(Accounts)]
pub struct CancelGame<'info> {
    #[account(
        mut,
        seeds = [b"game", game.config_id.as_ref(), &game.game_id.to_le_bytes()],
        bump = game.bump,
        constraint = game.game_status == GameStatus::WaitingForPlayers @ GameError::GameAlreadyStarted,
        constraint = game.creator == creator.key() @ GameError::Unauthorized,
        close = creator
    )]
    pub game: Box<Account<'info, GameState>>,

    #[account(mut)]
    pub creator: Signer<'info>,

    /// CHECK: game authority PDA - validated in handler
    #[account(
        seeds = [crate::constants::GAME_AUTHORITY_SEED.as_ref()],
        bump,
    )]
    pub game_authority: UncheckedAccount<'info>,

    #[account(
        mint::token_program = token_program,
    )]
    pub token_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        token::mint = token_mint,
        token::authority = game_authority,
        token::token_program = token_program,
    )]
    pub token_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    pub token_program: Interface<'info, TokenInterface>,

    pub system_program: Program<'info, System>,
    pub clock: Sysvar<'info, Clock>,
}

pub fn cancel_game_handler<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, CancelGame<'info>>,
) -> Result<()> {
    let game = &ctx.accounts.game;
    let clock = &ctx.accounts.clock;

    msg!(
        "Canceling game {} with {} players",
        game.game_id,
        game.current_players
    );

    if game.entry_fee > 0 {
        let token_mint = &ctx.accounts.token_mint;
        let token_vault = &ctx.accounts.token_vault;
        let game_authority = &ctx.accounts.game_authority;

        let (expected_game_authority, game_authority_bump) =
            Pubkey::find_program_address(&[crate::constants::GAME_AUTHORITY_SEED], ctx.program_id);

        require!(
            game_authority.key() == expected_game_authority,
            GameError::InvalidGameAuthority
        );

        require!(
            Some(token_mint.key()) == game.token_mint,
            GameError::InvalidTokenAccount
        );
        require!(
            Some(token_vault.key()) == game.token_vault,
            GameError::InvalidTokenAccount
        );

        let authority_seeds = &[
            crate::constants::GAME_AUTHORITY_SEED,
            &[game_authority_bump],
        ];
        let signer_seeds = &[&authority_seeds[..]];

        let remaining_accounts_iter = &mut ctx.remaining_accounts.iter();

        for (idx, player_pubkey) in game.players.iter().enumerate() {
            msg!(
                "Processing refund for player {} (index {})",
                player_pubkey,
                idx
            );

            let player_state_account = remaining_accounts_iter
                .next()
                .ok_or(GameError::MissingPlayerAccount)?;

            let expected_player_state_key = Pubkey::find_program_address(
                &[b"player", game.key().as_ref(), player_pubkey.as_ref()],
                ctx.program_id,
            )
            .0;

            require!(
                player_state_account.key() == expected_player_state_key,
                GameError::InvalidPlayerAccount
            );

            let player_token_account_info = remaining_accounts_iter
                .next()
                .ok_or(GameError::MissingPlayerTokenAccount)?;

            let player_token_account =
                InterfaceAccount::<TokenAccount>::try_from(player_token_account_info)?;

            require!(
                player_token_account.mint == token_mint.key(),
                GameError::InvalidTokenAccount
            );
            require!(
                player_token_account.owner == *player_pubkey,
                GameError::InvalidTokenAccount
            );

            let transfer_accounts = TransferChecked {
                from: token_vault.to_account_info(),
                mint: token_mint.to_account_info(),
                to: player_token_account_info.clone(),
                authority: game_authority.to_account_info(),
            };

            let transfer_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                transfer_accounts,
                signer_seeds,
            );

            transfer_checked(transfer_ctx, game.entry_fee, token_mint.decimals)?;

            msg!(
                "Refunded {} tokens to player {}",
                game.entry_fee,
                player_pubkey
            );

            let player_state_lamports = player_state_account.lamports();

            **player_state_account.try_borrow_mut_lamports()? = 0;
            **player_token_account_info.try_borrow_mut_lamports()? = player_token_account_info
                .lamports()
                .checked_add(player_state_lamports)
                .ok_or(GameError::ArithmeticOverflow)?;

            msg!("Closed player state account for {}", player_pubkey);
        }

        let close_vault_accounts = CloseAccount {
            account: token_vault.to_account_info(),
            destination: ctx.accounts.creator.to_account_info(),
            authority: game_authority.to_account_info(),
        };

        let close_vault_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            close_vault_accounts,
            signer_seeds,
        );

        close_account(close_vault_ctx)?;

        msg!("Token vault closed, rent refunded to creator");
    } else {
        let remaining_accounts_iter = &mut ctx.remaining_accounts.iter();

        for (idx, player_pubkey) in game.players.iter().enumerate() {
            msg!(
                "Closing player state for player {} (index {})",
                player_pubkey,
                idx
            );

            let player_state_account = remaining_accounts_iter
                .next()
                .ok_or(GameError::MissingPlayerAccount)?;

            let expected_player_state_key = Pubkey::find_program_address(
                &[b"player", game.key().as_ref(), player_pubkey.as_ref()],
                ctx.program_id,
            )
            .0;

            require!(
                player_state_account.key() == expected_player_state_key,
                GameError::InvalidPlayerAccount
            );

            let recipient_account = remaining_accounts_iter
                .next()
                .ok_or(GameError::MissingPlayerAccount)?;

            require!(
                recipient_account.key() == *player_pubkey,
                GameError::InvalidPlayerAccount
            );

            let player_state_lamports = player_state_account.lamports();

            **player_state_account.try_borrow_mut_lamports()? = 0;
            **recipient_account.try_borrow_mut_lamports()? = recipient_account
                .lamports()
                .checked_add(player_state_lamports)
                .ok_or(GameError::ArithmeticOverflow)?;

            msg!("Closed player state account for {}", player_pubkey);
        }
    }

    emit!(GameCancelled {
        game: game.key(),
        creator: game.creator,
        players_count: game.current_players,
        refund_amount: game.entry_fee,
        timestamp: clock.unix_timestamp,
    });

    msg!("Game {} successfully cancelled", game.game_id);

    Ok(())
}
