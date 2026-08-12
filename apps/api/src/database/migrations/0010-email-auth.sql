CREATE TABLE identity.auth_sessions (
  id varchar(128) PRIMARY KEY,
  user_id varchar(128) NOT NULL REFERENCES identity.users(id),
  refresh_token_hash bytea NOT NULL CHECK (octet_length(refresh_token_hash) = 32),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  revoked_at timestamptz,
  CONSTRAINT auth_session_timestamps_ordered CHECK (
    created_at <= updated_at
    AND expires_at > created_at
    AND (revoked_at IS NULL OR revoked_at >= created_at)
  )
);

CREATE INDEX auth_sessions_user_active_idx
  ON identity.auth_sessions (user_id, expires_at DESC)
  WHERE revoked_at IS NULL;

CREATE FUNCTION identity.validate_auth_session_update() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.id IS DISTINCT FROM NEW.id
    OR OLD.user_id IS DISTINCT FROM NEW.user_id
    OR OLD.expires_at IS DISTINCT FROM NEW.expires_at
    OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'auth session binding is immutable' USING ERRCODE = '55000';
  END IF;
  IF OLD.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'revoked auth session is immutable' USING ERRCODE = '55000';
  END IF;
  IF NEW.updated_at < OLD.updated_at THEN
    RAISE EXCEPTION 'auth session clock cannot move backwards' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER auth_session_transition
BEFORE UPDATE ON identity.auth_sessions
FOR EACH ROW EXECUTE FUNCTION identity.validate_auth_session_update();

GRANT SELECT, INSERT ON identity.auth_sessions TO api_runtime;
GRANT UPDATE (refresh_token_hash, updated_at, revoked_at)
  ON identity.auth_sessions TO api_runtime;

REVOKE ALL ON identity.auth_sessions FROM PUBLIC, realtime_runtime;
