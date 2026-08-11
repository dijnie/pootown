ALTER TABLE game.game_sessions
  ADD COLUMN recovery_required_at timestamptz,
  ADD CONSTRAINT recovery_timestamp_valid CHECK (
    (lifecycle <> 'recovery_required' OR recovery_required_at IS NOT NULL)
    AND (recovery_required_at IS NULL OR (started_at IS NOT NULL AND recovery_required_at >= started_at))
  );

CREATE VIEW realtime.api_room_recovery_status
WITH (security_barrier = true)
AS
SELECT
  lease.game_session_id,
  lease.room_id,
  lease.lease_until,
  checkpoint.state_version AS checkpoint_state_version,
  GREATEST(lease.lease_until, lease.updated_at, checkpoint.updated_at) AS runtime_evidence_at
FROM realtime.room_leases lease
JOIN realtime.room_checkpoints checkpoint
  ON checkpoint.room_id = lease.room_id
 AND checkpoint.game_session_id = lease.game_session_id
 AND checkpoint.fencing_token = lease.fencing_token;

GRANT SELECT ON realtime.api_room_recovery_status TO api_runtime;
GRANT UPDATE (recovery_required_at) ON game.game_sessions TO api_runtime;
