import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MAX_MATCH_CASH,
  acceptTrade,
  cancelTrade,
  createPropertyStates,
  createTrade,
  matchCash,
  rejectTrade,
  cleanupExpiredTrades,
  type PendingTrade,
  type PropertyState,
  type TradePlayerState,
  type TradeTerms,
} from "../src";

function players(): readonly (TradePlayerState | null)[] {
  return [
    { seatIndex: 0, cash: matchCash(1_500n) },
    { seatIndex: 1, cash: matchCash(1_500n) },
    null,
    null,
  ];
}

function properties(): readonly PropertyState[] {
  return createPropertyStates().map((property) =>
    property.position === 1
      ? { ...property, ownerSeatIndex: 0 }
      : property.position === 3
        ? { ...property, ownerSeatIndex: 1 }
        : property,
  );
}

function create(terms: TradeTerms, tradeId = "trade_1") {
  return createTrade([], players(), properties(), tradeId, 0, 1, terms, 1_000);
}

describe("trade rules", () => {
  it("creates all four frozen trade shapes including one-sided gifts", () => {
    const shapes: readonly TradeTerms[] = [
      { tradeType: "moneyOnly", offeredCash: matchCash(100n), requestedCash: matchCash(0n) },
      { tradeType: "propertyOnly", offeredPropertyPosition: 1, requestedPropertyPosition: null },
      { tradeType: "moneyForProperty", offeredCash: matchCash(100n), requestedPropertyPosition: 3 },
      { tradeType: "propertyForMoney", offeredPropertyPosition: 1, requestedCash: matchCash(100n) },
    ];
    for (const [index, terms] of shapes.entries()) {
      const result = create(terms, `trade_${index}`);
      assert.equal(result.ok, true, terms.tradeType);
      if (result.ok) assert.equal(result.trade?.expiresAtMs, 3_601_000);
    }
  });

  it("accepts atomically and revalidates cash and property ownership", () => {
    const created = create({ tradeType: "moneyForProperty", offeredCash: matchCash(100n), requestedPropertyPosition: 3 });
    assert.equal(created.ok, true);
    if (!created.ok || created.trade === null) return;
    const accepted = acceptTrade(created.trades, created.players, created.properties, created.trade.tradeId, 1, 2_000);
    assert.equal(accepted.ok, true);
    if (!accepted.ok) return;
    assert.equal(accepted.players[0]?.cash, 1_400n);
    assert.equal(accepted.players[1]?.cash, 1_600n);
    assert.equal(accepted.properties[3]?.ownerSeatIndex, 0);
    assert.equal(accepted.trades.length, 0);

    const moved = properties().map((property) => property.position === 3 ? { ...property, ownerSeatIndex: 0 } : property);
    const stale = acceptTrade(created.trades, created.players, moved, created.trade.tradeId, 1, 2_000);
    assert.deepEqual(stale, { ok: false, code: "PROPERTY_NOT_OWNED" });
  });

  it("rejects insufficient cash, mortgaged property, expiry, and wrong actors without mutation", () => {
    const insufficientPlayers = players().map((player, index) =>
      index === 0 && player !== null ? { ...player, cash: matchCash(99n) } : player,
    );
    const insufficient = createTrade(
      [], insufficientPlayers, properties(), "trade_cash", 0, 1,
      { tradeType: "moneyOnly", offeredCash: matchCash(100n), requestedCash: matchCash(0n) }, 1_000,
    );
    assert.deepEqual(insufficient, { ok: false, code: "INSUFFICIENT_CASH" });

    const mortgaged = properties().map((property) => property.position === 1 ? { ...property, mortgaged: true } : property);
    assert.deepEqual(
      createTrade([], players(), mortgaged, "trade_mortgage", 0, 1,
        { tradeType: "propertyOnly", offeredPropertyPosition: 1, requestedPropertyPosition: null }, 1_000),
      { ok: false, code: "PROPERTY_MORTGAGED" },
    );

    const created = create({ tradeType: "moneyOnly", offeredCash: matchCash(1n), requestedCash: matchCash(0n) });
    assert.equal(created.ok, true);
    if (!created.ok || created.trade === null) return;
    assert.deepEqual(acceptTrade(created.trades, created.players, created.properties, "trade_1", 0, 2_000), {
      ok: false,
      code: "NOT_TRADE_TARGET",
    });
    assert.deepEqual(acceptTrade(created.trades, created.players, created.properties, "trade_1", 1, 3_601_000), {
      ok: false,
      code: "TRADE_EXPIRED",
    });
  });

  it("rejects and cancels only by the frozen participant roles and cleans expiry first", () => {
    const created = create({ tradeType: "moneyOnly", offeredCash: matchCash(1n), requestedCash: matchCash(0n) });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.equal(rejectTrade(created.trades, created.players, created.properties, "trade_1", 1, 2_000).ok, true);
    assert.equal(cancelTrade(created.trades, created.players, created.properties, "trade_1", 0, 2_000).ok, true);
    assert.deepEqual(rejectTrade(created.trades, created.players, created.properties, "trade_1", 0, 2_000), {
      ok: false,
      code: "NOT_TRADE_TARGET",
    });
    assert.deepEqual(cancelTrade(created.trades, created.players, created.properties, "trade_1", 1, 2_000), {
      ok: false,
      code: "NOT_TRADE_PROPOSER",
    });

    const expired: PendingTrade = { ...created.trades[0]!, createdAtMs: 0, expiresAtMs: 3_600_000 };
    const next = createTrade(
      [expired], created.players, created.properties, "trade_2", 0, 1,
      { tradeType: "moneyOnly", offeredCash: matchCash(1n), requestedCash: matchCash(0n) }, 3_600_000,
    );
    assert.equal(next.ok, true);
    if (next.ok) assert.deepEqual(next.removedTradeIds, ["trade_1"]);
  });

  it("fails closed on empty/mixed terms, duplicate IDs, and malformed aggregate state", () => {
    assert.deepEqual(
      create({ tradeType: "moneyOnly", offeredCash: matchCash(0n), requestedCash: matchCash(0n) }),
      { ok: false, code: "INVALID_TRADE" },
    );
    const created = create({ tradeType: "moneyOnly", offeredCash: matchCash(1n), requestedCash: matchCash(0n) });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.deepEqual(
      createTrade(created.trades, created.players, created.properties, "trade_1", 0, 1,
        { tradeType: "moneyOnly", offeredCash: matchCash(1n), requestedCash: matchCash(0n) }, 2_000),
      { ok: false, code: "TRADE_ID_CONFLICT" },
    );
    assert.deepEqual(
      createTrade([], [{ seatIndex: 1, cash: matchCash(1n) }, null, null, null], properties(), "trade_bad", 0, 1,
        { tradeType: "moneyOnly", offeredCash: matchCash(1n), requestedCash: matchCash(0n) }, 2_000),
      { ok: false, code: "INVALID_TRADE_STATE" },
    );

    const malformedStates: readonly [unknown, unknown, unknown][] = [
      [null, players(), properties()],
      [[], null, properties()],
      [[], players(), null],
      [[null], players(), properties()],
      [[], [undefined, null, null, null], properties()],
      [[], players(), properties().map((property, index) => index === 1 ? null : property)],
    ];
    for (const [trades, playerStates, propertyStates] of malformedStates) {
      assert.doesNotThrow(() => {
        const result = createTrade(
          trades as readonly PendingTrade[],
          playerStates as readonly (TradePlayerState | null)[],
          propertyStates as readonly PropertyState[],
          "trade_malformed",
          0,
          1,
          { tradeType: "moneyOnly", offeredCash: matchCash(1n), requestedCash: matchCash(0n) },
          2_000,
        );
        assert.deepEqual(result, { ok: false, code: "INVALID_TRADE_STATE" });
      });
    }

    const malformedTerms: readonly unknown[] = [
      Object.assign([], { tradeType: "moneyOnly", offeredCash: 1n, requestedCash: 0n }),
      { tradeType: "moneyOnly", offeredCash: 1n, requestedCash: 0n, offeredPropertyPosition: 1 },
      { tradeType: "propertyOnly", offeredPropertyPosition: 1, requestedPropertyPosition: null, offeredCash: 1n },
      { tradeType: "moneyForProperty", offeredCash: 1n, requestedPropertyPosition: 3, requestedCash: 1n },
      { tradeType: "propertyForMoney", offeredPropertyPosition: 1, requestedCash: 1n, offeredCash: 1n },
    ];
    for (const terms of malformedTerms) {
      assert.deepEqual(
        createTrade([], players(), properties(), "trade_mixed", 0, 1, terms as TradeTerms, 2_000),
        { ok: false, code: "INVALID_TRADE" },
      );
    }


    assert.deepEqual(
      createTrade([], players(), properties(), "trade_seat", "0" as unknown as number, 1,
        { tradeType: "moneyOnly", offeredCash: matchCash(1n), requestedCash: matchCash(0n) }, 2_000),
      { ok: false, code: "INVALID_TRADE" },
    );
    assert.equal(cleanupExpiredTrades([null] as unknown as readonly PendingTrade[], 2_000), null);
    assert.equal(cleanupExpiredTrades(new Array<PendingTrade>(1), 2_000), null);
    assert.deepEqual(
      createTrade(new Array<PendingTrade>(1), players(), properties(), "trade_sparse", 0, 1,
        { tradeType: "moneyOnly", offeredCash: matchCash(1n), requestedCash: matchCash(0n) }, 2_000),
      { ok: false, code: "INVALID_TRADE_STATE" },
    );
    assert.deepEqual(
      createTrade([], players(), new Array<PropertyState>(40), "trade_sparse_properties", 0, 1,
        { tradeType: "moneyOnly", offeredCash: matchCash(1n), requestedCash: matchCash(0n) }, 2_000),
      { ok: false, code: "INVALID_TRADE_STATE" },
    );

    const wrongExpiry: PendingTrade = { ...created.trades[0]!, expiresAtMs: 9_999_999 };
    assert.deepEqual(
      acceptTrade([wrongExpiry], created.players, created.properties, "trade_1", 1, 2_000),
      { ok: false, code: "INVALID_TRADE_STATE" },
    );

    const expired: PendingTrade = { ...created.trades[0]!, createdAtMs: 0, expiresAtMs: 3_600_000 };
    assert.deepEqual(
      createTrade([expired], created.players, created.properties, "trade_1", 0, 1,
        { tradeType: "moneyOnly", offeredCash: matchCash(1n), requestedCash: matchCash(0n) }, 3_600_000),
      { ok: false, code: "TRADE_ID_CONFLICT" },
    );
  });

  it("enforces the active limit and accept-time cash boundaries atomically", () => {
    const terms: TradeTerms = { tradeType: "moneyOnly", offeredCash: matchCash(1n), requestedCash: matchCash(0n) };
    const activeTrades = Array.from({ length: 20 }, (_, index): PendingTrade => ({
      tradeId: `trade_${index}`,
      proposerSeatIndex: 0,
      receiverSeatIndex: 1,
      terms,
      createdAtMs: 1_000,
      expiresAtMs: 3_601_000,
    }));
    assert.deepEqual(
      createTrade(activeTrades, players(), properties(), "trade_20", 0, 1, terms, 2_000),
      { ok: false, code: "TOO_MANY_ACTIVE_TRADES" },
    );

    const receiverCannotPay = create({
      tradeType: "moneyOnly",
      offeredCash: matchCash(0n),
      requestedCash: matchCash(1_501n),
    }, "trade_receiver_cash");
    assert.equal(receiverCannotPay.ok, true);
    if (!receiverCannotPay.ok || receiverCannotPay.trade === null) return;
    const playersBefore = receiverCannotPay.players;
    const propertiesBefore = receiverCannotPay.properties;
    assert.deepEqual(
      acceptTrade(
        receiverCannotPay.trades,
        playersBefore,
        propertiesBefore,
        receiverCannotPay.trade.tradeId,
        1,
        2_000,
      ),
      { ok: false, code: "INSUFFICIENT_CASH" },
    );
    assert.strictEqual(receiverCannotPay.players, playersBefore);
    assert.strictEqual(receiverCannotPay.properties, propertiesBefore);

    const overflowPlayers: readonly (TradePlayerState | null)[] = [
      { seatIndex: 0, cash: matchCash(MAX_MATCH_CASH) },
      { seatIndex: 1, cash: matchCash(1n) },
      null,
      null,
    ];
    const overflowTrade = createTrade(
      [], overflowPlayers, properties(), "trade_overflow", 0, 1,
      { tradeType: "moneyOnly", offeredCash: matchCash(0n), requestedCash: matchCash(1n) }, 1_000,
    );
    assert.equal(overflowTrade.ok, true);
    if (!overflowTrade.ok || overflowTrade.trade === null) return;
    assert.deepEqual(
      acceptTrade(overflowTrade.trades, overflowTrade.players, overflowTrade.properties, "trade_overflow", 1, 2_000),
      { ok: false, code: "ARITHMETIC_OVERFLOW" },
    );
  });
});
