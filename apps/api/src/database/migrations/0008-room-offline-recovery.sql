CREATE TABLE realtime.room_presence (
  room_id varchar(128) PRIMARY KEY,
  game_session_id varchar(128) NOT NULL,
  fencing_token bigint NOT NULL CHECK (fencing_token > 0),
  all_offline_at timestamptz,
  abort_deadline_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (
    (all_offline_at IS NULL AND abort_deadline_at IS NULL)
    OR (all_offline_at IS NOT NULL AND abort_deadline_at = all_offline_at + interval '120 seconds')
  ),
  FOREIGN KEY (room_id, fencing_token, game_session_id)
    REFERENCES realtime.room_leases(room_id, fencing_token, game_session_id)
    DEFERRABLE INITIALLY DEFERRED
);

CREATE VIEW realtime.api_offline_abort_candidates
WITH (security_barrier = true)
AS
SELECT
  lease.game_session_id,
  lease.room_id,
  COALESCE(presence.abort_deadline_at, lease.lease_until + interval '120 seconds') AS abort_deadline_at
FROM realtime.room_leases lease
LEFT JOIN realtime.room_presence presence
  ON presence.room_id = lease.room_id
 AND presence.game_session_id = lease.game_session_id
 AND presence.fencing_token = lease.fencing_token;

GRANT SELECT, INSERT, UPDATE, DELETE ON realtime.room_presence TO realtime_runtime;
GRANT SELECT ON realtime.api_offline_abort_candidates TO api_runtime;
