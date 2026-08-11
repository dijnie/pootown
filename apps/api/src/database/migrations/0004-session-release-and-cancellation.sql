ALTER TABLE economy.coin_reservations
  DROP CONSTRAINT coin_reservations_game_session_id_user_id_key;

ALTER TABLE economy.coin_reservations
  ADD COLUMN terminal_operation_id varchar(128) REFERENCES economy.coin_operations(id),
  ADD CONSTRAINT reservation_terminal_operation CHECK (
    (status = 'reserved' AND terminal_operation_id IS NULL) OR
    (status IN ('captured', 'released') AND terminal_operation_id IS NOT NULL)
  );

CREATE UNIQUE INDEX coin_reservations_one_active_per_user_session
  ON economy.coin_reservations (game_session_id, user_id)
  WHERE status = 'reserved';

ALTER TABLE game.join_intents
  DROP CONSTRAINT join_intents_game_session_id_user_id_key;

CREATE UNIQUE INDEX join_intents_one_active_per_user_session
  ON game.join_intents (game_session_id, user_id)
  WHERE status IN ('pending', 'admitted');

CREATE OR REPLACE FUNCTION game.validate_join_intent_update() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.id IS DISTINCT FROM NEW.id
    OR OLD.game_session_id IS DISTINCT FROM NEW.game_session_id
    OR OLD.user_id IS DISTINCT FROM NEW.user_id
    OR OLD.reservation_id IS DISTINCT FROM NEW.reservation_id
    OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'join intent binding is immutable' USING ERRCODE = '55000';
  END IF;
  IF NOT (
    (OLD.status = 'pending' AND NEW.status IN ('admitted', 'released', 'expired')) OR
    (OLD.status = 'admitted' AND NEW.status = 'released')
  ) THEN
    RAISE EXCEPTION 'invalid join intent transition' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION economy.validate_reservation_transition() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status <> 'reserved' OR NEW.status NOT IN ('captured', 'released') THEN
    RAISE EXCEPTION 'invalid reservation transition' USING ERRCODE = '23514';
  END IF;
  IF OLD.user_id IS DISTINCT FROM NEW.user_id
    OR OLD.id IS DISTINCT FROM NEW.id
    OR OLD.operation_id IS DISTINCT FROM NEW.operation_id
    OR OLD.game_session_id IS DISTINCT FROM NEW.game_session_id
    OR OLD.amount IS DISTINCT FROM NEW.amount
    OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'reservation identity is immutable' USING ERRCODE = '55000';
  END IF;
  IF OLD.terminal_operation_id IS NOT NULL OR NEW.terminal_operation_id IS NULL THEN
    RAISE EXCEPTION 'reservation terminal operation is invalid' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

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
      ))
    INTO zero_ledger_allowed;
    IF operation_balance <> 0 OR (operation_entry_count < 2 AND NOT zero_ledger_allowed) THEN
      RAISE EXCEPTION 'coin operation % is not balanced', checked_operation_id USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NULL;
END
$$;

CREATE FUNCTION game.assert_cancelled_session_closed() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.lifecycle = 'cancelled' AND (
    EXISTS (
      SELECT 1 FROM economy.coin_reservations
      WHERE game_session_id = NEW.id AND status = 'reserved'
    ) OR EXISTS (
      SELECT 1 FROM game.session_players
      WHERE game_session_id = NEW.id
    ) OR EXISTS (
      SELECT 1 FROM game.join_intents
      WHERE game_session_id = NEW.id AND status IN ('pending', 'admitted')
    )
  ) THEN
    RAISE EXCEPTION 'cancelled session still has active admission state' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END
$$;

CREATE CONSTRAINT TRIGGER cancelled_session_admission_closed
AFTER INSERT OR UPDATE OF lifecycle ON game.game_sessions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION game.assert_cancelled_session_closed();

CREATE FUNCTION game.require_open_session_for_admission() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_lifecycle varchar(32);
BEGIN
  SELECT lifecycle INTO parent_lifecycle
  FROM game.game_sessions
  WHERE id = NEW.game_session_id
  FOR UPDATE;
  IF parent_lifecycle IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION 'session is not open for admission' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER reservation_requires_open_session
BEFORE INSERT ON economy.coin_reservations
FOR EACH ROW EXECUTE FUNCTION game.require_open_session_for_admission();

CREATE TRIGGER player_requires_open_session
BEFORE INSERT ON game.session_players
FOR EACH ROW EXECUTE FUNCTION game.require_open_session_for_admission();

CREATE TRIGGER join_intent_requires_open_session
BEFORE INSERT ON game.join_intents
FOR EACH ROW EXECUTE FUNCTION game.require_open_session_for_admission();

GRANT DELETE ON game.session_players TO api_runtime;
GRANT UPDATE (terminal_operation_id) ON economy.coin_reservations TO api_runtime;
