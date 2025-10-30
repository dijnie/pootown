use crate::constants::GAME_AUTHORITY_SEED;
use crate::error::GameError;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
};

#[derive(Accounts)]
pub struct ClaimReward<'info> {
    #[account(
        mut,
        seeds = [b"game", game.config_id.as_ref(), &game.game_id.to_le_bytes()],
        bump = game.bump,
        constraint = game.game_status == GameStatus::Finished @ GameError::GameNotFinished,
        constraint = !game.prize_claimed @ GameError::PrizeAlreadyClaimed,
        constraint = game.winner.is_some() @ GameError::NoWinnerDeclared,
        constraint = game.winner.unwrap() == winner.key() @ GameError::NotWinner,
    )]
    pub game: Box<Account<'info, GameState>>,

    /// CHECK: game authority PDA for token transfers
    #[account(
        seeds = [GAME_AUTHORITY_SEED.as_ref()],
        bump,
    )]
    pub game_authority: UncheckedAccount<'info>,

    #[account(
        mint::token_program = token_program,
        constraint = token_mint.key() == game.token_mint.unwrap() @ GameError::InvalidTokenAccount,
    )]
    pub token_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        token::mint = token_mint,
        token::authority = game_authority,
        token::token_program = token_program,
        constraint = token_vault.key() == game.token_vault.unwrap() @ GameError::InvalidTokenAccount,
    )]
    pub token_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        token::mint = token_mint,
        token::authority = winner,
        token::token_program = token_program,
    )]
    pub winner_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut)]
    pub winner: Signer<'info>,

    pub token_program: Interface<'info, TokenInterface>,

    pub clock: Sysvar<'info, Clock>,
}

pub fn claim_reward_handler(ctx: Context<ClaimReward>) -> Result<()> {
    let game = &mut ctx.accounts.game;
    let clock = &ctx.accounts.clock;

    require!(
        game.entry_fee > 0 && game.total_prize_pool > 0,
        GameError::NoPrizeToClaim
    );

    let prize_amount = game.total_prize_pool;
    let winner_pubkey = ctx.accounts.winner.key();

    let token_mint = &ctx.accounts.token_mint;
    let token_vault = &ctx.accounts.token_vault;
    let winner_token_account = &ctx.accounts.winner_token_account;
    let game_authority = &ctx.accounts.game_authority;

    let (expected_game_authority, game_authority_bump) =
        Pubkey::find_program_address(&[GAME_AUTHORITY_SEED], ctx.program_id);

    require!(
        game_authority.key() == expected_game_authority,
        GameError::InvalidGameAuthority
    );

    require!(
        winner_token_account.mint == token_mint.key(),
        GameError::InvalidTokenAccount
    );

    require!(
        winner_token_account.owner == winner_pubkey,
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

    let game_authority_seeds = &[GAME_AUTHORITY_SEED, &[game_authority_bump]];
    let signer_seeds = &[&game_authority_seeds[..]];

    let transfer_accounts = TransferChecked {
        from: token_vault.to_account_info(),
        mint: token_mint.to_account_info(),
        to: winner_token_account.to_account_info(),
        authority: game_authority.to_account_info(),
    };

    let transfer_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        transfer_accounts,
        signer_seeds,
    );

    transfer_checked(transfer_ctx, prize_amount, token_mint.decimals)?;

    game.prize_claimed = true;
    game.total_prize_pool = 0;

    msg!(
        "🎉 Prize of ${} claimed by winner: {}",
        prize_amount,
        winner_pubkey
    );

    emit!(PrizeClaimed {
        game: game.key(),
        winner: winner_pubkey,
        prize_amount,
        claimed_at: clock.unix_timestamp,
    });

    Ok(())
}
