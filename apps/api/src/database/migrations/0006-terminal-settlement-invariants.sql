ALTER TABLE economy.game_settlements
  ADD COLUMN abort_reason varchar(32),
  DROP CONSTRAINT settlement_proof_matches_kind,
  ADD CONSTRAINT settlement_proof_matches_kind CHECK (
    (kind = 'completed' AND terminal_state_version IS NOT NULL AND checkpoint_checksum IS NOT NULL
      AND winner_user_id IS NOT NULL AND abort_reason IS NULL) OR
    (kind = 'aborted' AND terminal_state_version IS NULL AND checkpoint_checksum IS NULL
      AND winner_user_id IS NULL AND abort_reason IN ('reconnectWindowExpired', 'operatorDecision'))
  );

CREATE UNIQUE INDEX game_settlements_one_terminal_outcome
  ON economy.game_settlements (game_session_id);

CREATE OR REPLACE FUNCTION economy.assert_balanced_operation() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  checked_operation_id varchar(128);
  operation_status varchar(16);
  operation_scope varchar(80);
  operation_balance numeric;
  operation_entry_count bigint;
  zero_ledger_allowed boolean;
BEGIN
  IF TG_TABLE_NAME = 'coin_operations' THEN
    checked_operation_id := NEW.id;
  ELSE
    checked_operation_id := NEW.operation_id;
  END IF;
  SELECT status, coin_operations.operation_scope
  INTO operation_status, operation_scope
  FROM economy.coin_operations
  WHERE id = checked_operation_id;
  IF operation_status = 'committed' THEN
    SELECT COALESCE(sum(amount), 0), count(*) INTO operation_balance, operation_entry_count
    FROM economy.coin_ledger_entries
    WHERE operation_id = checked_operation_id;
    SELECT
      (operation_scope IN ('createSession', 'joinIntent') AND EXISTS (
        SELECT 1 FROM economy.coin_reservations
        WHERE operation_id = checked_operation_id AND amount = 0
      )) OR (operation_scope IN ('releaseJoinIntent', 'cancelSession') AND EXISTS (
        SELECT 1 FROM economy.coin_reservations
        WHERE terminal_operation_id = checked_operation_id AND amount = 0
      ) AND NOT EXISTS (
        SELECT 1 FROM economy.coin_reservations
        WHERE terminal_operation_id = checked_operation_id AND amount <> 0
      )) OR (operation_scope IN ('settleSession', 'abortSession') AND EXISTS (
        SELECT 1 FROM economy.game_settlements
        WHERE operation_id = checked_operation_id
      ) AND EXISTS (
        SELECT 1 FROM economy.coin_reservations
        WHERE terminal_operation_id = checked_operation_id AND amount = 0
      ) AND NOT EXISTS (
        SELECT 1 FROM economy.coin_reservations
        WHERE terminal_operation_id = checked_operation_id AND amount <> 0
      ))
    INTO zero_ledger_allowed;
    IF operation_balance <> 0 OR (operation_entry_count < 2 AND NOT zero_ledger_allowed) THEN
      RAISE EXCEPTION 'coin operation % is not balanced', checked_operation_id USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NULL;
END
$$;

CREATE FUNCTION economy.assert_terminal_settlement_complete() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  session_lifecycle varchar(32);
  session_creator varchar(128);
  operation_status varchar(16);
  operation_scope varchar(80);
  expected_operation_scope varchar(80);
  operation_actor varchar(128);
  proof_matches boolean;
  active_players bigint;
  nonzero_reservations bigint;
  expected_total numeric;
  actual_entries bigint;
BEGIN
  expected_operation_scope := CASE WHEN NEW.kind = 'completed' THEN 'settleSession' ELSE 'abortSession' END;
  SELECT session.lifecycle, session.creator_user_id,
         operation.status, operation.operation_scope, operation.actor_user_id
  INTO session_lifecycle, session_creator, operation_status, operation_scope, operation_actor
  FROM game.game_sessions session
  JOIN economy.coin_operations operation ON operation.id = NEW.operation_id
  WHERE session.id = NEW.game_session_id;
  IF session_lifecycle IS DISTINCT FROM 'settled'
    OR operation_status IS DISTINCT FROM 'committed'
    OR operation_actor IS DISTINCT FROM session_creator
    OR operation_scope IS DISTINCT FROM expected_operation_scope THEN
    RAISE EXCEPTION 'terminal settlement operation is not committed authority' USING ERRCODE = '23514';
  END IF;

  SELECT count(*), count(*) FILTER (WHERE reservation.amount <> 0), COALESCE(sum(reservation.amount), 0)
  INTO active_players, nonzero_reservations, expected_total
  FROM game.session_players player
  JOIN economy.coin_reservations reservation ON reservation.id = player.reservation_id
  WHERE player.game_session_id = NEW.game_session_id AND player.active = true;
  SELECT count(*) INTO actual_entries
  FROM economy.coin_ledger_entries entry
  WHERE entry.operation_id = NEW.operation_id;

  IF active_players < 2 OR EXISTS (
    SELECT 1
    FROM economy.coin_account_reconciliation reconciliation
    JOIN game.session_players player ON player.user_id = reconciliation.user_id
    WHERE player.game_session_id = NEW.game_session_id
      AND player.active = true
      AND (reconciliation.available_coin <> reconciliation.ledger_available_coin
        OR reconciliation.reserved_coin <> reconciliation.ledger_reserved_coin)
  ) THEN
    RAISE EXCEPTION 'terminal settlement account reconciliation failed' USING ERRCODE = '23514';
  END IF;

  IF NEW.kind = 'completed' THEN
    SELECT EXISTS (
      SELECT 1 FROM realtime.api_settlement_proofs proof
      JOIN game.session_players player
        ON player.game_session_id = proof.game_session_id
       AND player.player_id = proof.winner_player_id
      WHERE proof.game_session_id = NEW.game_session_id
        AND proof.state_version = NEW.terminal_state_version
        AND proof.checkpoint_checksum = NEW.checkpoint_checksum
        AND player.user_id = NEW.winner_user_id
    ) INTO proof_matches;
    IF NOT proof_matches OR EXISTS (
      SELECT 1 FROM economy.coin_reservations
      WHERE game_session_id = NEW.game_session_id AND status = 'reserved'
    ) OR EXISTS (
      SELECT 1
      FROM game.session_players player
      JOIN economy.coin_reservations reservation ON reservation.id = player.reservation_id
      WHERE player.game_session_id = NEW.game_session_id
        AND player.active = true
        AND (reservation.status <> 'captured' OR reservation.terminal_operation_id <> NEW.operation_id)
    ) OR actual_entries <> nonzero_reservations + (CASE WHEN expected_total > 0 THEN 1 ELSE 0 END) OR EXISTS (
      SELECT 1
      FROM game.session_players player
      JOIN economy.coin_reservations reservation ON reservation.id = player.reservation_id
      WHERE player.game_session_id = NEW.game_session_id
        AND player.active = true
        AND reservation.amount <> 0
        AND 1 <> (
          SELECT count(*)
          FROM economy.coin_ledger_entries entry
          JOIN economy.ledger_accounts ledger ON ledger.id = entry.ledger_account_id
          WHERE entry.operation_id = NEW.operation_id
            AND ledger.owner_user_id = reservation.user_id
            AND ledger.kind = 'user_reserved'
            AND entry.amount = -reservation.amount
        )
    ) OR (CASE WHEN expected_total > 0 THEN 1 ELSE 0 END) <> (
      SELECT count(*)
      FROM economy.coin_ledger_entries entry
      JOIN economy.ledger_accounts ledger ON ledger.id = entry.ledger_account_id
      WHERE entry.operation_id = NEW.operation_id
        AND ledger.owner_user_id = NEW.winner_user_id
        AND ledger.kind = 'user_available'
        AND entry.amount = expected_total
    ) OR EXISTS (
      SELECT 1
      FROM game.session_players player
      JOIN economy.coin_reservations reservation ON reservation.id = player.reservation_id
      WHERE player.game_session_id = NEW.game_session_id
        AND player.active = true
        AND NOT EXISTS (
          SELECT 1 FROM readmodel.session_history history
          WHERE history.game_session_id = NEW.game_session_id
            AND history.user_id = player.user_id
            AND history.player_id = player.player_id
            AND history.result = CASE WHEN player.user_id = NEW.winner_user_id THEN 'won' ELSE 'lost' END
            AND history.account_coin_delta = CASE
              WHEN player.user_id = NEW.winner_user_id THEN expected_total - reservation.amount
              ELSE -reservation.amount
            END
        )
    ) THEN
      RAISE EXCEPTION 'completed settlement does not match terminal authority' USING ERRCODE = '23514';
    END IF;
  ELSIF EXISTS (
      SELECT 1 FROM economy.coin_reservations
      WHERE game_session_id = NEW.game_session_id AND status <> 'released'
    ) OR EXISTS (
      SELECT 1
      FROM game.session_players player
      JOIN economy.coin_reservations reservation ON reservation.id = player.reservation_id
      WHERE player.game_session_id = NEW.game_session_id
        AND player.active = true
        AND (reservation.status <> 'released' OR reservation.terminal_operation_id <> NEW.operation_id)
    ) OR actual_entries <> nonzero_reservations * 2 OR EXISTS (
      SELECT 1
      FROM game.session_players player
      JOIN economy.coin_reservations reservation ON reservation.id = player.reservation_id
      WHERE player.game_session_id = NEW.game_session_id
        AND player.active = true
        AND reservation.amount <> 0
        AND (
          1 <> (
            SELECT count(*) FROM economy.coin_ledger_entries entry
            JOIN economy.ledger_accounts ledger ON ledger.id = entry.ledger_account_id
            WHERE entry.operation_id = NEW.operation_id
              AND ledger.owner_user_id = reservation.user_id
              AND ledger.kind = 'user_available'
              AND entry.amount = reservation.amount
          ) OR 1 <> (
            SELECT count(*) FROM economy.coin_ledger_entries entry
            JOIN economy.ledger_accounts ledger ON ledger.id = entry.ledger_account_id
            WHERE entry.operation_id = NEW.operation_id
              AND ledger.owner_user_id = reservation.user_id
              AND ledger.kind = 'user_reserved'
              AND entry.amount = -reservation.amount
          )
        )
    ) OR EXISTS (
      SELECT 1
      FROM game.session_players player
      WHERE player.game_session_id = NEW.game_session_id
        AND player.active = true
        AND NOT EXISTS (
          SELECT 1 FROM readmodel.session_history history
          WHERE history.game_session_id = NEW.game_session_id
            AND history.user_id = player.user_id
            AND history.player_id = player.player_id
            AND history.result = 'aborted'
            AND history.account_coin_delta = 0
        )
    ) THEN
      RAISE EXCEPTION 'aborted settlement did not release every reservation' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END
$$;

CREATE CONSTRAINT TRIGGER terminal_settlement_complete
AFTER INSERT ON economy.game_settlements
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION economy.assert_terminal_settlement_complete();

CREATE FUNCTION game.assert_settled_session_has_outcome() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.lifecycle = 'settled' AND NOT EXISTS (
    SELECT 1 FROM economy.game_settlements WHERE game_session_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'settled session has no terminal outcome' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END
$$;

CREATE CONSTRAINT TRIGGER settled_session_has_outcome
AFTER UPDATE OF lifecycle ON game.game_sessions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION game.assert_settled_session_has_outcome();
