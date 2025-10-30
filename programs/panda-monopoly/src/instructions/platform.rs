use anchor_lang::prelude::*;

use crate::PlatformConfig;

#[derive(Accounts)]
#[instruction(platform_id: Pubkey)]
pub struct CreatePlatformConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init_if_needed,
        seeds = [b"platform", platform_id.as_ref()],
        bump,
        payer = admin,
        space = 8 + PlatformConfig::INIT_SPACE
    )]
    pub config: Account<'info, PlatformConfig>,

    pub system_program: Program<'info, System>,
}

pub fn create_platform_config_handler(
    ctx: Context<CreatePlatformConfig>,
    platform_id: Pubkey,
    fee_basis_points: u16,
    fee_vault: Pubkey,
) -> Result<()> {
    let config = &mut ctx.accounts.config;

    config.id = platform_id;
    config.fee_basis_points = fee_basis_points;
    config.fee_vault = fee_vault;
    config.bump = ctx.bumps.config;
    config.authority = ctx.accounts.admin.key();
    config.total_games_created = 0;
    config.next_game_id = 1;

    Ok(())
}

#[derive(Accounts)]
pub struct UpdatePlatformConfig<'info> {
    #[account(mut, constraint = config.authority == admin.key())]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [b"platform", config.id.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, PlatformConfig>,
}

pub fn update_platform_config_handler(
    ctx: Context<UpdatePlatformConfig>,
    fee_basis_points: Option<u16>,
    fee_vault: Option<Pubkey>,
) -> Result<()> {
    let config = &mut ctx.accounts.config;

    if let Some(fee) = fee_basis_points {
        config.fee_basis_points = fee;
    }

    if let Some(fee_vault) = fee_vault {
        config.fee_vault = fee_vault;
    }

    Ok(())
}
