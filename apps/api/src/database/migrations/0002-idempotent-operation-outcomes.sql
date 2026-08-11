ALTER TABLE economy.coin_operations
  DROP CONSTRAINT coin_operations_status_check,
  DROP CONSTRAINT committed_operation_has_snapshot;

ALTER TABLE economy.coin_operations
  ADD CONSTRAINT coin_operations_status_check
    CHECK (status IN ('pending', 'committed', 'no_op')),
  ADD CONSTRAINT terminal_operation_has_snapshot CHECK (
    (status = 'pending' AND committed_at IS NULL AND response_snapshot IS NULL) OR
    (status IN ('committed', 'no_op') AND committed_at IS NOT NULL AND response_snapshot IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION economy.reject_committed_operation_change() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status IN ('committed', 'no_op') THEN
    RAISE EXCEPTION 'terminal coin operation is immutable' USING ERRCODE = '55000';
  END IF;
  IF OLD.actor_user_id IS DISTINCT FROM NEW.actor_user_id
    OR OLD.operation_scope IS DISTINCT FROM NEW.operation_scope
    OR OLD.idempotency_key IS DISTINCT FROM NEW.idempotency_key
    OR OLD.request_hash IS DISTINCT FROM NEW.request_hash THEN
    RAISE EXCEPTION 'coin operation identity is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION economy.reject_entry_after_commit() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  operation_status varchar(16);
BEGIN
  SELECT status INTO operation_status
  FROM economy.coin_operations
  WHERE id = NEW.operation_id
  FOR UPDATE;
  IF operation_status IN ('committed', 'no_op') THEN
    RAISE EXCEPTION 'cannot append to a terminal coin operation' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END
$$;
