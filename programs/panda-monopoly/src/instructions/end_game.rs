use crate::error::GameError;
use crate::state::*;
use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::{anchor::commit, ephem::commit_and_undelegate_accounts};

#[commit]
#[derive(Accounts)]
pub struct EndGame<'info> {
    #[account(
        mut,
        seeds = [b"game", game.config_id.as_ref(), &game.game_id.to_le_bytes()],
        bump = game.bump,
    )]
    pub game: Box<Account<'info, GameState>>,

    pub caller: Signer<'info>,

    pub clock: Sysvar<'info, Clock>,
    // remaining_accounts should contain PlayerState accounts for all active players
    // Format: [player_state_1, player_state_2, ...]
}

pub fn end_game_handler<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, EndGame<'info>>,
) -> Result<()> {
    {
        let game = &mut ctx.accounts.game;
        let clock = &ctx.accounts.clock;

        // Prevent double-ending
        require!(
            game.game_status != GameStatus::Finished,
            GameError::GameAlreadyEnded
        );

        require!(game.end_condition_met, GameError::GameAlreadyEnding);

        // game.end_condition_met = true;

        let end_reason: GameEndReason;
        let mut winner_pubkey: Option<Pubkey> = None;
        let mut winner_net_worth: Option<u64> = None;

        if game.check_bankruptcy_end_condition() {
            end_reason = GameEndReason::BankruptcyVictory;

            let active_players = game.get_active_players();
            if let Some(&winner) = active_players.first() {
                winner_pubkey = Some(winner);

                // Try to get winner's complete net worth from remaining accounts
                if let Some(player_state) = find_player_state_in_remaining_accounts(
                    &ctx.remaining_accounts,
                    &game.key(),
                    &winner,
                )? {
                    let property_value = game.calculate_player_net_worth(&winner)?;
                    let total_net_worth = property_value
                        .checked_add(player_state.cash_balance)
                        .ok_or(GameError::ArithmeticOverflow)?;
                    winner_net_worth = Some(total_net_worth);
                    msg!(
                        "Winner total net worth (cash + properties): ${}",
                        total_net_worth
                    );
                }

                msg!("🏆 Game ended: Bankruptcy victory. Winner: {}", winner);
            } else {
                msg!("Game ended: No remaining players");
            }
        } else if game.check_time_end_condition(clock.unix_timestamp) {
            end_reason = GameEndReason::TimeLimit;

            let active_players = game.get_active_players();

            require!(!active_players.is_empty(), GameError::NoActivePlayers);

            let mut best_player: Option<Pubkey> = None;
            let mut best_net_worth: u64 = 0;

            // Calculate complete net worth for each player
            for player in active_players.iter() {
                let property_value = game.calculate_player_net_worth(player)?;

                // Try to find player's cash balance from remaining accounts
                let total_net_worth = if let Some(player_state) =
                    find_player_state_in_remaining_accounts(
                        &ctx.remaining_accounts,
                        &game.key(),
                        player,
                    )? {
                    property_value
                        .checked_add(player_state.cash_balance)
                        .ok_or(GameError::ArithmeticOverflow)?
                } else {
                    // If PlayerState not provided, use property value only
                    property_value
                };

                msg!("Player {} total net worth: ${}", player, total_net_worth);

                if total_net_worth > best_net_worth {
                    best_net_worth = total_net_worth;
                    best_player = Some(*player);
                }
            }

            winner_pubkey = best_player;
            winner_net_worth = Some(best_net_worth);

            msg!(
                "🏆 Game ended: Time limit reached. Winner: {:?} with net worth: ${}",
                winner_pubkey,
                best_net_worth
            );
        } else {
            game.end_condition_met = false;
            return Err(GameError::GameCannotEnd.into());
        }

        // Update game state
        game.game_status = GameStatus::Finished;
        game.winner = winner_pubkey;
        game.end_reason = Some(end_reason);
        game.ended_at = Some(clock.unix_timestamp);

        emit!(GameEnded {
            game: game.key(),
            winner: winner_pubkey,
            reason: end_reason,
            winner_net_worth,
            ended_at: clock.unix_timestamp,
        });

        msg!("✅ Game {} has ended successfully", game.game_id);
    }

    // undelegate players
    {
        let game = &ctx.accounts.game;
        let remaining_accounts_iter = &mut ctx.remaining_accounts.iter();
        let players = &game.players;
        let mut accounts: Vec<&AccountInfo<'info>> = vec![];

        // delegate player accounts
        for _player_pubkey in players.iter() {
            let player_account = remaining_accounts_iter
                .next()
                .ok_or(GameError::InvalidAccount)?;

            accounts.push(player_account);
            player_account.exit(&crate::ID)?;
            // commit_and_undelegate_accounts(
            //     &ctx.accounts.caller,
            //     vec![&player_account.to_account_info()],
            //     &ctx.accounts.magic_context,
            //     &ctx.accounts.magic_program,
            // )?;

            // msg!("Player {} undelegated", player_pubkey);
        }

        let acc = &game.to_account_info();
        accounts.push(acc);

        game.exit(&crate::ID)?;
        commit_and_undelegate_accounts(
            &ctx.accounts.caller,
            accounts,
            &ctx.accounts.magic_context,
            &ctx.accounts.magic_program,
        )?;
    }

    Ok(())
}

fn find_player_state_in_remaining_accounts<'c: 'info, 'info>(
    remaining_accounts: &'c [AccountInfo<'info>],
    game_key: &Pubkey,
    player_key: &Pubkey,
) -> Result<Option<Account<'c, PlayerState>>> {
    for account_info in remaining_accounts {
        if let Ok(player_state) = Account::<PlayerState>::try_from(account_info) {
            // Verify it belongs to the correct game and player
            if player_state.game == *game_key && player_state.wallet == *player_key {
                return Ok(Some(player_state));
            }
        }
    }
    Ok(None)
}
