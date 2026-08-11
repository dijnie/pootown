ALTER TABLE game.game_sessions
  ADD CONSTRAINT session_lifecycle_timestamps CHECK (
    (lifecycle IN ('open', 'cancelling') AND started_at IS NULL AND finished_at IS NULL AND cancelled_at IS NULL) OR
    (lifecycle = 'cancelled' AND started_at IS NULL AND finished_at IS NULL AND cancelled_at IS NOT NULL) OR
    (lifecycle IN ('active', 'recovery_required', 'settling') AND started_at IS NOT NULL
      AND state_version > 0 AND finished_at IS NULL AND cancelled_at IS NULL) OR
    (lifecycle = 'settled' AND started_at IS NOT NULL AND state_version > 0
      AND finished_at IS NOT NULL AND cancelled_at IS NULL)
  );

CREATE FUNCTION game.validate_session_lifecycle_transition() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.lifecycle IS DISTINCT FROM NEW.lifecycle AND NOT (
    (OLD.lifecycle = 'open' AND NEW.lifecycle IN ('active', 'cancelling')) OR
    (OLD.lifecycle = 'cancelling' AND NEW.lifecycle = 'cancelled') OR
    (OLD.lifecycle = 'active' AND NEW.lifecycle IN ('settling', 'recovery_required')) OR
    (OLD.lifecycle = 'recovery_required' AND NEW.lifecycle IN ('active', 'settling')) OR
    (OLD.lifecycle = 'settling' AND NEW.lifecycle IN ('settled', 'recovery_required'))
  ) THEN
    RAISE EXCEPTION 'invalid session lifecycle transition' USING ERRCODE = '23514';
  END IF;
  IF NEW.state_version < OLD.state_version THEN
    RAISE EXCEPTION 'session state version cannot decrease' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER game_session_lifecycle_transition
BEFORE UPDATE ON game.game_sessions
FOR EACH ROW EXECUTE FUNCTION game.validate_session_lifecycle_transition();

ALTER TABLE game.realtime_tickets
  ADD CONSTRAINT ticket_consumed_after_creation CHECK (
    consumed_at IS NULL OR (consumed_at >= created_at AND consumed_at < expires_at)
  );

CREATE OR REPLACE FUNCTION game.validate_ticket_update() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.id IS DISTINCT FROM NEW.id
    OR OLD.user_id IS DISTINCT FROM NEW.user_id
    OR OLD.game_session_id IS DISTINCT FROM NEW.game_session_id
    OR OLD.room_id IS DISTINCT FROM NEW.room_id
    OR OLD.reservation_id IS DISTINCT FROM NEW.reservation_id
    OR OLD.player_id IS DISTINCT FROM NEW.player_id
    OR OLD.role IS DISTINCT FROM NEW.role
    OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'realtime ticket binding is immutable' USING ERRCODE = '55000';
  END IF;
  IF OLD.consumed_at IS NOT NULL THEN
    RAISE EXCEPTION 'consumed realtime ticket is immutable' USING ERRCODE = '55000';
  END IF;
  IF NEW.token_hash IS DISTINCT FROM OLD.token_hash AND NEW.consumed_at IS NOT NULL THEN
    RAISE EXCEPTION 'ticket rotation and consumption must be separate' USING ERRCODE = '23514';
  END IF;
  IF NEW.consumed_at IS NOT NULL AND NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    RAISE EXCEPTION 'ticket expiry cannot change during consumption' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;
