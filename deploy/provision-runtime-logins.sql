\set ON_ERROR_STOP on

ALTER ROLE api_runtime
  LOGIN PASSWORD :'api_runtime_password';
ALTER ROLE realtime_runtime
  LOGIN PASSWORD :'realtime_runtime_password';
