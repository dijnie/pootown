CREATE UNIQUE INDEX realtime_tickets_one_unused_per_reservation
  ON game.realtime_tickets (reservation_id)
  WHERE consumed_at IS NULL;

CREATE OR REPLACE FUNCTION economy.assert_balanced_operation() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  checked_operation_id varchar(128);
  operation_status varchar(16);
  operation_scope varchar(80);
  operation_balance numeric;
  operation_entry_count bigint;
  zero_cost_admission boolean;
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
    SELECT operation_scope IN ('createSession', 'joinIntent') AND EXISTS (
      SELECT 1 FROM economy.coin_reservations
      WHERE operation_id = checked_operation_id AND amount = 0
    ) INTO zero_cost_admission;
    IF operation_balance <> 0 OR (operation_entry_count < 2 AND NOT zero_cost_admission) THEN
      RAISE EXCEPTION 'coin operation % is not balanced', checked_operation_id USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NULL;
END
$$;
