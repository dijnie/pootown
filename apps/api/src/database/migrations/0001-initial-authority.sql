CREATE SCHEMA identity AUTHORIZATION migration_owner;
CREATE SCHEMA economy AUTHORIZATION migration_owner;
CREATE SCHEMA game AUTHORIZATION migration_owner;
CREATE SCHEMA readmodel AUTHORIZATION migration_owner;
CREATE SCHEMA realtime AUTHORIZATION migration_owner;

REVOKE ALL ON SCHEMA identity, economy, game, readmodel, realtime FROM PUBLIC;

CREATE TABLE identity.users (
  id varchar(128) PRIMARY KEY,
  email varchar(254) NOT NULL UNIQUE,
  password_hash varchar(60) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT users_timestamps_ordered CHECK (created_at <= updated_at AND created_at <= last_seen_at),
  CONSTRAINT users_email_canonical CHECK (
    email = lower(email)
    AND email !~ '[[:space:]]'
    AND email ~ '^[^@]+@[^@]+\.[^@]+$'
  ),
  CONSTRAINT users_password_hash_bcrypt CHECK (
    password_hash ~ '^\$2[aby]\$12\$[./A-Za-z0-9]{53}$'
  )
);

CREATE TABLE game.game_definitions (
  id varchar(128) NOT NULL,
  policy_version integer NOT NULL CHECK (policy_version > 0),
  display_name varchar(80) NOT NULL,
  maximum_players smallint NOT NULL CHECK (maximum_players BETWEEN 2 AND 4),
  entry_coin numeric(78, 0) NOT NULL CHECK (entry_coin >= 0),
  time_limit_ms integer CHECK (time_limit_ms > 0 AND time_limit_ms <= 86400000),
  policy_snapshot jsonb NOT NULL CHECK (jsonb_typeof(policy_snapshot) = 'object'),
  policy_hash bytea NOT NULL CHECK (octet_length(policy_hash) = 32),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (id, policy_version)
);

CREATE TABLE game.game_sessions (
  id varchar(128) PRIMARY KEY,
  room_id varchar(128) NOT NULL UNIQUE,
  game_definition_id varchar(128) NOT NULL,
  game_definition_version integer NOT NULL,
  creator_user_id varchar(128) NOT NULL REFERENCES identity.users(id),
  lifecycle varchar(32) NOT NULL CHECK (
    lifecycle IN ('open', 'cancelling', 'cancelled', 'active', 'settling', 'settled', 'recovery_required')
  ),
  policy_snapshot jsonb NOT NULL CHECK (jsonb_typeof(policy_snapshot) = 'object'),
  policy_hash bytea NOT NULL CHECK (octet_length(policy_hash) = 32),
  maximum_players smallint NOT NULL CHECK (maximum_players BETWEEN 2 AND 4),
  entry_coin numeric(78, 0) NOT NULL CHECK (entry_coin >= 0),
  time_limit_ms integer CHECK (time_limit_ms > 0 AND time_limit_ms <= 86400000),
  state_version bigint NOT NULL DEFAULT 0 CHECK (state_version >= 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  started_at timestamptz,
  finished_at timestamptz,
  cancelled_at timestamptz,
  UNIQUE (id, room_id),
  FOREIGN KEY (game_definition_id, game_definition_version)
    REFERENCES game.game_definitions(id, policy_version),
  CONSTRAINT session_timestamps_ordered CHECK (
    (started_at IS NULL OR started_at >= created_at) AND
    (finished_at IS NULL OR finished_at >= created_at) AND
    (cancelled_at IS NULL OR cancelled_at >= created_at)
  )
);

CREATE INDEX game_sessions_lifecycle_created_idx ON game.game_sessions (lifecycle, created_at DESC);

CREATE TABLE economy.coin_accounts (
  user_id varchar(128) PRIMARY KEY REFERENCES identity.users(id),
  available_coin numeric(78, 0) NOT NULL DEFAULT 0 CHECK (available_coin >= 0),
  reserved_coin numeric(78, 0) NOT NULL DEFAULT 0 CHECK (reserved_coin >= 0),
  version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_rescue_grant_at timestamptz,
  CONSTRAINT coin_account_timestamps_ordered CHECK (updated_at >= created_at)
);

CREATE TABLE economy.coin_operations (
  id varchar(128) PRIMARY KEY,
  actor_user_id varchar(128) REFERENCES identity.users(id),
  operation_scope varchar(80) NOT NULL,
  idempotency_key varchar(128) NOT NULL,
  request_hash bytea NOT NULL CHECK (octet_length(request_hash) = 32),
  response_snapshot jsonb,
  status varchar(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'committed')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  committed_at timestamptz,
  UNIQUE NULLS NOT DISTINCT (actor_user_id, operation_scope, idempotency_key),
  CONSTRAINT committed_operation_has_snapshot CHECK (
    (status = 'pending' AND committed_at IS NULL) OR
    (status = 'committed' AND committed_at IS NOT NULL AND response_snapshot IS NOT NULL)
  )
);

CREATE TABLE economy.ledger_accounts (
  id varchar(128) PRIMARY KEY,
  owner_user_id varchar(128) REFERENCES identity.users(id),
  kind varchar(32) NOT NULL CHECK (
    kind IN ('user_available', 'user_reserved', 'system_issuance', 'system_entry', 'system_prize')
  ),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT ledger_account_owner_matches_kind CHECK (
    (kind IN ('user_available', 'user_reserved') AND owner_user_id IS NOT NULL) OR
    (kind IN ('system_issuance', 'system_entry', 'system_prize') AND owner_user_id IS NULL)
  ),
  UNIQUE (owner_user_id, kind)
);

CREATE UNIQUE INDEX ledger_system_account_kind_unique
  ON economy.ledger_accounts (kind)
  WHERE owner_user_id IS NULL;

CREATE TABLE economy.coin_ledger_entries (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  operation_id varchar(128) NOT NULL REFERENCES economy.coin_operations(id),
  ledger_account_id varchar(128) NOT NULL REFERENCES economy.ledger_accounts(id),
  amount numeric(78, 0) NOT NULL CHECK (amount <> 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX coin_ledger_entries_operation_idx ON economy.coin_ledger_entries (operation_id);
CREATE INDEX coin_ledger_entries_account_idx ON economy.coin_ledger_entries (ledger_account_id, id);

CREATE TABLE economy.coin_reservations (
  id varchar(128) PRIMARY KEY,
  operation_id varchar(128) NOT NULL REFERENCES economy.coin_operations(id),
  user_id varchar(128) NOT NULL REFERENCES identity.users(id),
  game_session_id varchar(128) NOT NULL REFERENCES game.game_sessions(id),
  amount numeric(78, 0) NOT NULL CHECK (amount >= 0),
  status varchar(16) NOT NULL CHECK (status IN ('reserved', 'captured', 'released')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  terminal_at timestamptz,
  UNIQUE (game_session_id, user_id),
  UNIQUE (id, user_id, game_session_id),
  CONSTRAINT reservation_terminal_timestamp CHECK (
    (status = 'reserved' AND terminal_at IS NULL) OR
    (status IN ('captured', 'released') AND terminal_at IS NOT NULL AND terminal_at >= created_at)
  )
);

CREATE TABLE game.session_players (
  game_session_id varchar(128) NOT NULL REFERENCES game.game_sessions(id),
  player_id varchar(128) NOT NULL,
  user_id varchar(128) NOT NULL REFERENCES identity.users(id),
  seat_index smallint NOT NULL CHECK (seat_index BETWEEN 0 AND 3),
  reservation_id varchar(128) NOT NULL,
  active boolean NOT NULL DEFAULT true,
  joined_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (game_session_id, player_id),
  UNIQUE (game_session_id, user_id),
  UNIQUE (game_session_id, seat_index),
  UNIQUE (reservation_id),
  UNIQUE (game_session_id, player_id, user_id, reservation_id),
  FOREIGN KEY (reservation_id, user_id, game_session_id)
    REFERENCES economy.coin_reservations(id, user_id, game_session_id)
);

CREATE TABLE game.join_intents (
  id varchar(128) PRIMARY KEY,
  game_session_id varchar(128) NOT NULL REFERENCES game.game_sessions(id),
  user_id varchar(128) NOT NULL REFERENCES identity.users(id),
  reservation_id varchar(128) NOT NULL,
  status varchar(16) NOT NULL CHECK (status IN ('pending', 'admitted', 'released', 'expired')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (game_session_id, user_id),
  UNIQUE (reservation_id),
  FOREIGN KEY (reservation_id, user_id, game_session_id)
    REFERENCES economy.coin_reservations(id, user_id, game_session_id),
  CHECK (updated_at >= created_at)
);

CREATE TABLE game.realtime_tickets (
  id varchar(128) PRIMARY KEY,
  token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  user_id varchar(128) NOT NULL REFERENCES identity.users(id),
  game_session_id varchar(128) NOT NULL,
  room_id varchar(128) NOT NULL,
  reservation_id varchar(128) NOT NULL,
  player_id varchar(128) NOT NULL,
  role varchar(16) NOT NULL CHECK (role = 'player'),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  consumed_by_room_instance varchar(128),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT ticket_consumption_complete CHECK (
    (consumed_at IS NULL AND consumed_by_room_instance IS NULL) OR
    (consumed_at IS NOT NULL AND consumed_by_room_instance IS NOT NULL)
  ),
  CONSTRAINT ticket_expiry_after_creation CHECK (expires_at > created_at)
  ,FOREIGN KEY (game_session_id, room_id)
    REFERENCES game.game_sessions(id, room_id)
  ,FOREIGN KEY (reservation_id, user_id, game_session_id)
    REFERENCES economy.coin_reservations(id, user_id, game_session_id)
);

CREATE INDEX realtime_tickets_cleanup_idx
  ON game.realtime_tickets (expires_at)
  WHERE consumed_at IS NULL;

CREATE TABLE economy.game_settlements (
  id varchar(128) PRIMARY KEY,
  game_session_id varchar(128) NOT NULL REFERENCES game.game_sessions(id),
  kind varchar(16) NOT NULL CHECK (kind IN ('completed', 'aborted')),
  operation_id varchar(128) NOT NULL UNIQUE REFERENCES economy.coin_operations(id),
  terminal_state_version bigint CHECK (terminal_state_version >= 0),
  checkpoint_checksum bytea CHECK (checkpoint_checksum IS NULL OR octet_length(checkpoint_checksum) = 32),
  winner_user_id varchar(128) REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (game_session_id, kind),
  CONSTRAINT settlement_proof_matches_kind CHECK (
    (kind = 'completed' AND terminal_state_version IS NOT NULL AND checkpoint_checksum IS NOT NULL AND winner_user_id IS NOT NULL) OR
    (kind = 'aborted' AND winner_user_id IS NULL)
  )
);

CREATE TABLE readmodel.session_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_session_id varchar(128) NOT NULL REFERENCES game.game_sessions(id),
  user_id varchar(128) NOT NULL REFERENCES identity.users(id),
  player_id varchar(128) NOT NULL,
  result varchar(16) NOT NULL CHECK (result IN ('won', 'lost', 'cancelled', 'aborted')),
  account_coin_delta numeric(78, 0) NOT NULL,
  finished_at timestamptz NOT NULL,
  UNIQUE (game_session_id, user_id)
);

CREATE INDEX session_history_user_finished_idx ON readmodel.session_history (user_id, finished_at DESC, id DESC);

CREATE TABLE readmodel.leaderboard_players (
  user_id varchar(128) PRIMARY KEY REFERENCES identity.users(id),
  player_id varchar(128) NOT NULL UNIQUE,
  display_name varchar(80),
  games_played bigint NOT NULL DEFAULT 0 CHECK (games_played >= 0),
  games_won bigint NOT NULL DEFAULT 0 CHECK (games_won >= 0 AND games_won <= games_played),
  account_coin_won numeric(78, 0) NOT NULL DEFAULT 0 CHECK (account_coin_won >= 0),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE realtime.room_leases (
  room_id varchar(128) PRIMARY KEY,
  game_session_id varchar(128) NOT NULL REFERENCES game.game_sessions(id),
  instance_id varchar(128) NOT NULL,
  lease_until timestamptz NOT NULL,
  fencing_token bigint NOT NULL CHECK (fencing_token > 0),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (room_id, game_session_id),
  UNIQUE (room_id, fencing_token),
  UNIQUE (room_id, fencing_token, game_session_id)
);

CREATE TABLE realtime.room_checkpoints (
  room_id varchar(128) PRIMARY KEY,
  game_session_id varchar(128) NOT NULL,
  schema_version integer NOT NULL CHECK (schema_version > 0),
  state_version bigint NOT NULL CHECK (state_version >= 0),
  fencing_token bigint NOT NULL CHECK (fencing_token > 0),
  checksum bytea NOT NULL CHECK (octet_length(checksum) = 32),
  private_state jsonb NOT NULL CHECK (jsonb_typeof(private_state) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (room_id, fencing_token, game_session_id)
    REFERENCES realtime.room_leases(room_id, fencing_token, game_session_id)
    DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE realtime.room_commands (
  room_id varchar(128) NOT NULL REFERENCES realtime.room_leases(room_id),
  player_id varchar(128) NOT NULL,
  request_id uuid NOT NULL,
  expected_state_version bigint NOT NULL CHECK (expected_state_version >= 0),
  committed_state_version bigint NOT NULL CHECK (committed_state_version > expected_state_version),
  response_snapshot jsonb NOT NULL CHECK (jsonb_typeof(response_snapshot) = 'object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (room_id, player_id, request_id)
);

CREATE TABLE realtime.room_events (
  event_id varchar(128) PRIMARY KEY,
  room_id varchar(128) NOT NULL REFERENCES realtime.room_leases(room_id),
  state_version bigint NOT NULL CHECK (state_version >= 0),
  event_type varchar(80) NOT NULL,
  public_payload jsonb NOT NULL CHECK (jsonb_typeof(public_payload) = 'object'),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (room_id, state_version, event_id)
);

CREATE TABLE realtime.terminal_proofs (
  game_session_id varchar(128) PRIMARY KEY REFERENCES game.game_sessions(id),
  room_id varchar(128) NOT NULL,
  state_version bigint NOT NULL CHECK (state_version >= 0),
  checkpoint_checksum bytea NOT NULL CHECK (octet_length(checkpoint_checksum) = 32),
  winner_player_id varchar(128) NOT NULL,
  end_reason varchar(32) NOT NULL CHECK (end_reason IN ('lastPlayerStanding', 'timeLimit', 'timeoutForfeit')),
  committed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (game_session_id, room_id)
    REFERENCES game.game_sessions(id, room_id),
  FOREIGN KEY (room_id, game_session_id)
    REFERENCES realtime.room_leases(room_id, game_session_id)
);

CREATE VIEW realtime.api_settlement_proofs
WITH (security_barrier = true)
AS
SELECT game_session_id, room_id, state_version, checkpoint_checksum, winner_player_id, end_reason, committed_at
FROM realtime.terminal_proofs;

CREATE FUNCTION economy.reject_mutation() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'append-only relation cannot be changed' USING ERRCODE = '55000';
END
$$;

CREATE TRIGGER coin_ledger_entries_append_only
BEFORE UPDATE OR DELETE ON economy.coin_ledger_entries
FOR EACH ROW EXECUTE FUNCTION economy.reject_mutation();

CREATE TRIGGER game_definitions_immutable
BEFORE UPDATE OR DELETE ON game.game_definitions
FOR EACH ROW EXECUTE FUNCTION economy.reject_mutation();

CREATE TRIGGER terminal_proofs_append_only
BEFORE UPDATE OR DELETE ON realtime.terminal_proofs
FOR EACH ROW EXECUTE FUNCTION economy.reject_mutation();

CREATE TRIGGER game_settlements_append_only
BEFORE UPDATE OR DELETE ON economy.game_settlements
FOR EACH ROW EXECUTE FUNCTION economy.reject_mutation();

CREATE FUNCTION identity.validate_user_update() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.id IS DISTINCT FROM NEW.id
    OR OLD.email IS DISTINCT FROM NEW.email
    OR OLD.password_hash IS DISTINCT FROM NEW.password_hash
    OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'user identity is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER user_identity_immutable
BEFORE UPDATE ON identity.users
FOR EACH ROW EXECUTE FUNCTION identity.validate_user_update();

CREATE FUNCTION game.validate_session_policy_update() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.room_id IS DISTINCT FROM NEW.room_id
    OR OLD.game_definition_id IS DISTINCT FROM NEW.game_definition_id
    OR OLD.game_definition_version IS DISTINCT FROM NEW.game_definition_version
    OR OLD.creator_user_id IS DISTINCT FROM NEW.creator_user_id
    OR OLD.policy_snapshot IS DISTINCT FROM NEW.policy_snapshot
    OR OLD.policy_hash IS DISTINCT FROM NEW.policy_hash
    OR OLD.maximum_players IS DISTINCT FROM NEW.maximum_players
    OR OLD.entry_coin IS DISTINCT FROM NEW.entry_coin
    OR OLD.time_limit_ms IS DISTINCT FROM NEW.time_limit_ms THEN
    RAISE EXCEPTION 'session policy is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER game_session_policy_immutable
BEFORE UPDATE ON game.game_sessions
FOR EACH ROW EXECUTE FUNCTION game.validate_session_policy_update();

CREATE FUNCTION game.validate_player_update() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.game_session_id IS DISTINCT FROM NEW.game_session_id
    OR OLD.player_id IS DISTINCT FROM NEW.player_id
    OR OLD.user_id IS DISTINCT FROM NEW.user_id
    OR OLD.seat_index IS DISTINCT FROM NEW.seat_index
    OR OLD.reservation_id IS DISTINCT FROM NEW.reservation_id
    OR OLD.joined_at IS DISTINCT FROM NEW.joined_at THEN
    RAISE EXCEPTION 'session player binding is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER session_player_binding_immutable
BEFORE UPDATE ON game.session_players
FOR EACH ROW EXECUTE FUNCTION game.validate_player_update();

CREATE FUNCTION game.validate_join_intent_update() RETURNS trigger
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
  IF OLD.status <> 'pending' OR NEW.status NOT IN ('admitted', 'released', 'expired') THEN
    RAISE EXCEPTION 'invalid join intent transition' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER join_intent_transition
BEFORE UPDATE ON game.join_intents
FOR EACH ROW EXECUTE FUNCTION game.validate_join_intent_update();

CREATE FUNCTION game.validate_ticket_update() RETURNS trigger
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
  RETURN NEW;
END
$$;

CREATE TRIGGER realtime_ticket_transition
BEFORE UPDATE ON game.realtime_tickets
FOR EACH ROW EXECUTE FUNCTION game.validate_ticket_update();

CREATE FUNCTION game.assert_session_player_capacity() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  session_capacity smallint;
BEGIN
  SELECT maximum_players INTO session_capacity
  FROM game.game_sessions
  WHERE id = NEW.game_session_id;
  IF NEW.seat_index >= session_capacity THEN
    RAISE EXCEPTION 'seat exceeds session capacity' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END
$$;

CREATE CONSTRAINT TRIGGER session_player_capacity
AFTER INSERT OR UPDATE ON game.session_players
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION game.assert_session_player_capacity();

CREATE FUNCTION economy.reject_committed_operation_change() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'committed' THEN
    RAISE EXCEPTION 'committed coin operation is immutable' USING ERRCODE = '55000';
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

CREATE TRIGGER coin_operations_immutable_identity
BEFORE UPDATE ON economy.coin_operations
FOR EACH ROW EXECUTE FUNCTION economy.reject_committed_operation_change();

CREATE FUNCTION economy.reject_entry_after_commit() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  operation_status varchar(16);
BEGIN
  SELECT status INTO operation_status
  FROM economy.coin_operations
  WHERE id = NEW.operation_id
  FOR UPDATE;
  IF operation_status = 'committed' THEN
    RAISE EXCEPTION 'cannot append to a committed coin operation' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER coin_ledger_entry_pending_operation
BEFORE INSERT ON economy.coin_ledger_entries
FOR EACH ROW EXECUTE FUNCTION economy.reject_entry_after_commit();

CREATE FUNCTION economy.assert_balanced_operation() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  checked_operation_id varchar(128);
  operation_status varchar(16);
  operation_balance numeric;
  operation_entry_count bigint;
BEGIN
  IF TG_TABLE_NAME = 'coin_operations' THEN
    checked_operation_id := NEW.id;
  ELSE
    checked_operation_id := NEW.operation_id;
  END IF;
  SELECT status INTO operation_status FROM economy.coin_operations WHERE id = checked_operation_id;
  IF operation_status = 'committed' THEN
    SELECT COALESCE(sum(amount), 0), count(*) INTO operation_balance, operation_entry_count
    FROM economy.coin_ledger_entries
    WHERE operation_id = checked_operation_id;
    IF operation_balance <> 0 OR operation_entry_count < 2 THEN
      RAISE EXCEPTION 'coin operation % is not balanced', checked_operation_id USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NULL;
END
$$;

CREATE CONSTRAINT TRIGGER coin_operation_balance_from_operation
AFTER INSERT OR UPDATE ON economy.coin_operations
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION economy.assert_balanced_operation();

CREATE CONSTRAINT TRIGGER coin_operation_balance_from_entry
AFTER INSERT ON economy.coin_ledger_entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION economy.assert_balanced_operation();

CREATE FUNCTION economy.validate_reservation_transition() RETURNS trigger
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
  RETURN NEW;
END
$$;

CREATE TRIGGER coin_reservation_terminal_transition
BEFORE UPDATE ON economy.coin_reservations
FOR EACH ROW EXECUTE FUNCTION economy.validate_reservation_transition();

CREATE VIEW economy.coin_account_reconciliation
WITH (security_barrier = true)
AS
SELECT
  account.user_id,
  account.available_coin,
  account.reserved_coin,
  COALESCE(sum(entry.amount) FILTER (WHERE ledger.kind = 'user_available'), 0) AS ledger_available_coin,
  COALESCE(sum(entry.amount) FILTER (WHERE ledger.kind = 'user_reserved'), 0) AS ledger_reserved_coin
FROM economy.coin_accounts account
LEFT JOIN economy.ledger_accounts ledger ON ledger.owner_user_id = account.user_id
LEFT JOIN economy.coin_ledger_entries entry ON entry.ledger_account_id = ledger.id
GROUP BY account.user_id, account.available_coin, account.reserved_coin;

REVOKE ALL ON ALL TABLES IN SCHEMA identity, economy, game, readmodel, realtime FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA identity, economy, game, realtime FROM PUBLIC;

GRANT USAGE ON SCHEMA identity, economy, game, readmodel TO api_runtime;
GRANT SELECT (id, email, password_hash, created_at, updated_at, last_seen_at)
  ON identity.users TO api_runtime;
GRANT INSERT (id, email, password_hash, created_at, updated_at, last_seen_at)
  ON identity.users TO api_runtime;
GRANT UPDATE (updated_at, last_seen_at) ON identity.users TO api_runtime;
GRANT SELECT, INSERT ON economy.coin_accounts, economy.coin_operations, economy.coin_reservations, economy.game_settlements TO api_runtime;
GRANT UPDATE (available_coin, reserved_coin, version, updated_at, last_rescue_grant_at)
  ON economy.coin_accounts TO api_runtime;
GRANT UPDATE (response_snapshot, status, committed_at)
  ON economy.coin_operations TO api_runtime;
GRANT UPDATE (status, terminal_at)
  ON economy.coin_reservations TO api_runtime;
GRANT SELECT, INSERT ON economy.ledger_accounts, economy.coin_ledger_entries TO api_runtime;
GRANT SELECT ON economy.coin_account_reconciliation TO api_runtime;
GRANT SELECT ON game.game_definitions TO api_runtime;
GRANT SELECT, INSERT ON game.game_sessions, game.session_players, game.join_intents, game.realtime_tickets TO api_runtime;
GRANT UPDATE (lifecycle, state_version, started_at, finished_at, cancelled_at)
  ON game.game_sessions TO api_runtime;
GRANT UPDATE (active) ON game.session_players TO api_runtime;
GRANT UPDATE (status, updated_at) ON game.join_intents TO api_runtime;
GRANT UPDATE (token_hash, expires_at, consumed_at, consumed_by_room_instance)
  ON game.realtime_tickets TO api_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON readmodel.session_history, readmodel.leaderboard_players TO api_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA economy, readmodel TO api_runtime;

GRANT USAGE ON SCHEMA realtime TO api_runtime;
GRANT SELECT ON realtime.api_settlement_proofs TO api_runtime;

GRANT USAGE ON SCHEMA realtime TO realtime_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  realtime.room_leases,
  realtime.room_checkpoints,
  realtime.room_commands,
  realtime.room_events
TO realtime_runtime;
GRANT SELECT, INSERT ON realtime.terminal_proofs TO realtime_runtime;

ALTER DEFAULT PRIVILEGES FOR ROLE migration_owner IN SCHEMA identity, economy, game, readmodel, realtime
  REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE migration_owner IN SCHEMA identity, economy, game, readmodel, realtime
  REVOKE ALL ON FUNCTIONS FROM PUBLIC;
