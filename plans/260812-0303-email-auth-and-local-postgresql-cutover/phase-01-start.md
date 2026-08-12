---
phase: 1
title: "Docker PostgreSQL and Schema Boundary"
status: complete
priority: P1
effort: "0.5-1 day"
dependencies: []
---

# Phase 1: Docker PostgreSQL and Schema Boundary

## Overview

Provide one deterministic local PostgreSQL target and append the first-party identity/session schema without weakening existing ownership and runtime-role isolation.

## Requirements

- Functional: PostgreSQL 17.6 Alpine, named volume, healthcheck, fixed local port, no committed credential file.
- Security: migration owner retains DDL; API runtime gets only required identity/session DML; PUBLIC and realtime runtime remain denied.

## Related Code Files

- Create: `compose.yml`, `apps/api/src/database/migrations/0010-email-auth.sql`.
- Modify: root scripts/documentation and migration E2E role assertions.

## Implementation Steps

1. Add Compose PostgreSQL with explicit database/user defaults suitable only for local development and overrideable environment interpolation.
2. Add migration that refuses ambiguous non-empty Privy identity, removes `privy_did`, adds canonical email/password fields and refresh-session storage/invariants.
3. Update immutability triggers and column-level grants; add expiry/hash/timestamp/terminal-state checks.
4. Start the container, migrate fresh and repeated, restart it, and prove volume persistence and role denials.

## Success Criteria

- [x] Container healthy on the dedicated local port and named volume persistence survives restart.
- [x] Fresh/repeat migration and missing/drift checks pass on PostgreSQL 17.6.
- [x] API can perform only required auth DML; realtime/PUBLIC cannot read credentials or sessions.
