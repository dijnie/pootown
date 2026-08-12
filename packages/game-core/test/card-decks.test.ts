import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

import {
  CARD_RULESET_AUTHORITY,
  CHANCE_CARDS,
  COMMUNITY_CHEST_CARDS,
  COMMUNITY_FREE_PARKING_DIVERGENCE,
  EXCLUDED_RULES,
} from "../src/rules/card-decks";
import { LEGACY_CONSTANTS_SHA256, RULESET_VERSION } from "../src/rules/board-definition";

describe("immutable card decks", () => {
  it("matches the five frozen Chance cards", () => {
    assert.deepEqual(
      CHANCE_CARDS.map(({ id, title, effect, amount }) => [id, title, effect, amount]),
      [
        [1, "Memecoin Pump!", "moveToNearest", 1],
        [2, "Rug Pull Alert!", "money", -50],
        [3, "Flash Loan Win", "money", 100],
        [4, "Congestion Jam", "move", -3],
        [5, "Dev Unlock", "getOutOfJailFree", 0],
      ],
    );
  });

  it("matches the five frozen Community Chest cards except the approved destination correction", () => {
    assert.deepEqual(
      COMMUNITY_CHEST_CARDS.map(({ id, title, effect, amount }) => [id, title, effect, amount]),
      [
        [1, "Retroactive Airdrop!", "collectFromPlayers", 50],
        [2, "Staking Rewards", "money", 100],
        [3, "NFT Floor Sweep", "move", 20],
        [4, "DAO Vote Win", "repairFree", 0],
        [5, "Wallet Drain Fee", "money", -50],
      ],
    );
    assert.match(COMMUNITY_CHEST_CARDS[2]?.copy ?? "", /Free Airdrop Parking.*20/);
    assert.deepEqual(COMMUNITY_FREE_PARKING_DIVERGENCE, {
      name: "community-chest-free-parking",
      cardId: 3,
      legacyDestination: 21,
      targetDestination: 20,
      reason: "Approved correction to the board's Free Parking position.",
    });
  });

  it("marks unsupported rules and unreachable effects as excluded rather than behavior", () => {
    assert.deepEqual(EXCLUDED_RULES.map(({ name, targetDisposition }) => [name, targetDisposition]), [
      ["auction", "excluded"],
      ["unreachable-chance-effects", "excluded"],
      ["unreachable-community-effects", "excluded"],
    ]);
    assert.deepEqual(EXCLUDED_RULES[1]?.effects, ["goToJail", "payPerProperty", "collectFromPlayers", "repairFree"]);
    assert.deepEqual(EXCLUDED_RULES[2]?.effects, ["moveToNearest", "goToJail", "getOutOfJailFree", "payPerProperty"]);
    assert.equal(CHANCE_CARDS.some(({ effect }) => EXCLUDED_RULES[1]?.effects?.includes(effect)), false);
    assert.equal(COMMUNITY_CHEST_CARDS.some(({ effect }) => EXCLUDED_RULES[2]?.effects?.includes(effect)), false);
  });

  it("is versioned and deeply frozen", () => {
    assert.equal(CARD_RULESET_AUTHORITY.rulesetVersion, RULESET_VERSION);
    assert.equal(CARD_RULESET_AUTHORITY.sourceSha256, LEGACY_CONSTANTS_SHA256);
    assert.ok(Object.isFrozen(CHANCE_CARDS));
    assert.ok(CHANCE_CARDS.every(Object.isFrozen));
    assert.ok(Object.isFrozen(COMMUNITY_CHEST_CARDS));
    assert.ok(COMMUNITY_CHEST_CARDS.every(Object.isFrozen));
    assert.ok(Object.isFrozen(COMMUNITY_FREE_PARKING_DIVERGENCE));
    assert.ok(Object.isFrozen(EXCLUDED_RULES));
    assert.ok(EXCLUDED_RULES.every((rule) => Object.isFrozen(rule) && (rule.effects === undefined || Object.isFrozen(rule.effects))));
  });

  it("stays scoped to the source-evidenced fixture authority", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(process.cwd(), "../../tests/fixtures/executed-rules/manifest.json"), "utf8"),
    ) as {
      sourceAuthority: { constantsSha256: string };
      frozenDecisions: { chanceCardCount: number; communityChestCardCount: number };
      approvedDivergences: Array<{ name: string; legacyDestination: number; targetDestination: number }>;
      ruleFamilies: Array<{ name: string; status: string }>;
    };

    assert.equal(manifest.sourceAuthority.constantsSha256, CARD_RULESET_AUTHORITY.sourceSha256);
    assert.equal(manifest.frozenDecisions.chanceCardCount, CHANCE_CARDS.length);
    assert.equal(manifest.frozenDecisions.communityChestCardCount, COMMUNITY_CHEST_CARDS.length);
    assert.deepEqual(manifest.approvedDivergences[0], {
      name: COMMUNITY_FREE_PARKING_DIVERGENCE.name,
      legacyDestination: COMMUNITY_FREE_PARKING_DIVERGENCE.legacyDestination,
      targetDestination: COMMUNITY_FREE_PARKING_DIVERGENCE.targetDestination,
      reason: "Approved correction to the board's Free Parking position.",
    });
    assert.deepEqual(
      manifest.ruleFamilies.find(({ name }) => name === "chance-and-community-cards"),
      {
        name: "chance-and-community-cards",
        status: "source-evidenced",
        evidence: ["packages/game-core/test/card-decks.test.ts"],
      },
    );
  });
});
