CREATE TABLE realtime.session_finalizations (
  room_id varchar(128) NOT NULL,
  player_id varchar(128) NOT NULL,
  request_id uuid NOT NULL,
  game_session_id varchar(128) NOT NULL,
  reservation_id varchar(128) NOT NULL,
  action varchar(16) NOT NULL CHECK (action IN ('leave', 'cancel')),
  idempotency_key varchar(128) NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9._:-]{1,128}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (room_id, player_id, request_id),
  FOREIGN KEY (room_id, player_id, request_id)
    REFERENCES realtime.room_commands(room_id, player_id, request_id)
    DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (room_id, game_session_id)
    REFERENCES realtime.room_leases(room_id, game_session_id)
);

CREATE TRIGGER session_finalizations_append_only
BEFORE UPDATE OR DELETE ON realtime.session_finalizations
FOR EACH ROW EXECUTE FUNCTION economy.reject_mutation();

CREATE VIEW realtime.api_session_finalizations
WITH (security_barrier = true)
AS
SELECT
  finalization.game_session_id,
  finalization.room_id,
  finalization.player_id,
  finalization.reservation_id,
  finalization.request_id,
  finalization.action,
  finalization.idempotency_key,
  finalization.created_at
FROM realtime.session_finalizations finalization
JOIN game.game_sessions session ON session.id = finalization.game_session_id
JOIN economy.coin_reservations reservation
  ON reservation.id = finalization.reservation_id
 AND reservation.game_session_id = finalization.game_session_id
WHERE (finalization.action = 'leave' AND reservation.status = 'reserved')
   OR (finalization.action = 'cancel' AND session.lifecycle = 'open');

CREATE VIEW realtime.api_room_materializations
WITH (security_barrier = true)
AS
SELECT game_session_id, room_id FROM realtime.room_leases;

GRANT SELECT, INSERT ON realtime.session_finalizations TO realtime_runtime;
GRANT SELECT ON realtime.api_session_finalizations TO api_runtime;
GRANT SELECT ON realtime.api_room_materializations TO api_runtime;
