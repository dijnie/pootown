export const lifecycleContractFixture = {
  create: {
    requestId: "00000000-0000-4000-8000-000000000001",
    expectedStateVersion: 0,
    type: "createGame",
    payload: {
      gameId: "game_fixture_1",
      maximumPlayers: 4,
      timeLimitMs: null,
    },
  },
  join: {
    requestId: "00000000-0000-4000-8000-000000000002",
    expectedStateVersion: 1,
    type: "joinGame",
    payload: {},
  },
  leave: {
    requestId: "00000000-0000-4000-8000-000000000003",
    expectedStateVersion: 2,
    type: "leaveGame",
    payload: {},
  },
  start: {
    requestId: "00000000-0000-4000-8000-000000000004",
    expectedStateVersion: 2,
    type: "startGame",
    payload: {},
  },
  cancel: {
    requestId: "00000000-0000-4000-8000-000000000005",
    expectedStateVersion: 2,
    type: "cancelGame",
    payload: {},
  },
} as const;
