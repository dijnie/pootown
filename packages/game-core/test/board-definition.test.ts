import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

import {
  BOARD_RULESET_AUTHORITY,
  BOARD_SPACES,
  COLOR_GROUP_POSITIONS,
  LEGACY_CONSTANTS_SHA256,
  RULESET_VERSION,
} from "../src/rules/board-definition";

const expectedBoard = [
  [0, 0, [0, 0, 0, 0, 0, 0], 0, 0, "special", "corner"],
  [1, 60, [2, 10, 30, 90, 160, 250], 50, 30, "brown", "street"],
  [2, 0, [0, 0, 0, 0, 0, 0], 0, 0, "special", "communityChest"],
  [3, 60, [4, 20, 60, 180, 320, 450], 50, 30, "brown", "street"],
  [4, 0, [0, 0, 0, 0, 0, 0], 0, 0, "special", "tax"],
  [5, 200, [25, 50, 100, 200, 0, 0], 0, 100, "railroad", "railroad"],
  [6, 100, [6, 30, 90, 270, 400, 550], 50, 50, "lightBlue", "street"],
  [7, 0, [0, 0, 0, 0, 0, 0], 0, 0, "special", "chance"],
  [8, 100, [6, 30, 90, 270, 400, 550], 50, 50, "lightBlue", "street"],
  [9, 120, [8, 40, 100, 300, 450, 600], 50, 60, "lightBlue", "street"],
  [10, 0, [0, 0, 0, 0, 0, 0], 0, 0, "special", "corner"],
  [11, 140, [10, 50, 150, 450, 625, 750], 50, 70, "pink", "street"],
  [12, 150, [4, 10, 0, 0, 0, 0], 0, 75, "utility", "utility"],
  [13, 140, [10, 50, 150, 450, 625, 750], 100, 70, "pink", "street"],
  [14, 160, [12, 60, 180, 500, 700, 900], 100, 80, "pink", "street"],
  [15, 200, [25, 50, 100, 200, 0, 0], 0, 100, "railroad", "railroad"],
  [16, 180, [14, 70, 200, 550, 750, 950], 100, 90, "orange", "street"],
  [17, 0, [0, 0, 0, 0, 0, 0], 0, 0, "special", "communityChest"],
  [18, 180, [14, 70, 200, 550, 750, 950], 100, 90, "orange", "street"],
  [19, 200, [16, 80, 240, 600, 800, 1000], 100, 100, "orange", "street"],
  [20, 0, [0, 0, 0, 0, 0, 0], 0, 0, "special", "corner"],
  [21, 220, [18, 90, 270, 650, 850, 1050], 150, 110, "red", "street"],
  [22, 0, [0, 0, 0, 0, 0, 0], 0, 0, "special", "chance"],
  [23, 220, [18, 90, 270, 650, 850, 1050], 150, 110, "red", "street"],
  [24, 240, [20, 100, 300, 750, 950, 1100], 150, 120, "red", "street"],
  [25, 200, [25, 50, 100, 200, 0, 0], 0, 100, "railroad", "railroad"],
  [26, 260, [22, 110, 330, 850, 1050, 1200], 150, 120, "yellow", "street"],
  [27, 260, [22, 110, 330, 850, 1050, 1200], 150, 130, "yellow", "street"],
  [28, 150, [4, 10, 0, 0, 0, 0], 0, 75, "utility", "utility"],
  [29, 280, [24, 120, 360, 900, 1100, 1300], 150, 140, "yellow", "street"],
  [30, 0, [0, 0, 0, 0, 0, 0], 0, 0, "special", "corner"],
  [31, 300, [26, 130, 390, 900, 1100, 1300], 200, 150, "green", "street"],
  [32, 300, [26, 130, 390, 900, 1100, 1300], 200, 150, "green", "street"],
  [33, 0, [0, 0, 0, 0, 0, 0], 0, 0, "special", "communityChest"],
  [34, 320, [28, 150, 450, 1000, 1200, 1400], 200, 160, "green", "street"],
  [35, 200, [25, 50, 100, 200, 0, 0], 0, 100, "railroad", "railroad"],
  [36, 0, [0, 0, 0, 0, 0, 0], 0, 0, "special", "chance"],
  [37, 350, [35, 175, 500, 1100, 1400, 1500], 200, 175, "darkBlue", "street"],
  [38, 0, [0, 0, 0, 0, 0, 0], 0, 0, "special", "tax"],
  [39, 400, [50, 200, 600, 1200, 1600, 2000], 200, 200, "darkBlue", "street"],
] as const;

describe("immutable board definition", () => {
  it("matches every frozen Rust board row and position", () => {
    assert.equal(BOARD_SPACES.length, 40);
    assert.deepEqual(
      BOARD_SPACES.map((space) => [
        space.position,
        space.price,
        space.rent,
        space.houseCost,
        space.mortgageValue,
        space.colorGroup,
        space.propertyType,
      ]),
      expectedBoard,
    );
    assert.deepEqual(BOARD_SPACES.map(({ position }) => position), Array.from({ length: 40 }, (_, index) => index));
  });

  it("matches the frozen source groups", () => {
    assert.deepEqual(COLOR_GROUP_POSITIONS, {
      brown: [1, 3],
      lightBlue: [6, 8, 9],
      pink: [11, 13, 14],
      orange: [16, 18, 19],
      red: [21, 23, 24],
      yellow: [26, 27, 29],
      green: [31, 32, 34],
      darkBlue: [37, 39],
      railroad: [5, 15, 25, 35],
      utility: [12, 28],
    });
  });

  it("is versioned and deeply frozen", () => {
    assert.equal(RULESET_VERSION, 1);
    assert.equal(BOARD_RULESET_AUTHORITY.rulesetVersion, RULESET_VERSION);
    assert.equal(BOARD_RULESET_AUTHORITY.boardSize, BOARD_SPACES.length);
    assert.ok(Object.isFrozen(BOARD_SPACES));
    assert.ok(BOARD_SPACES.every((space) => Object.isFrozen(space) && Object.isFrozen(space.rent)));
    assert.ok(Object.isFrozen(COLOR_GROUP_POSITIONS));
    assert.ok(Object.values(COLOR_GROUP_POSITIONS).every(Object.isFrozen));
    assert.ok(Object.isFrozen(BOARD_RULESET_AUTHORITY));
  });

  it("matches the self-contained frozen fixture authority", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(process.cwd(), "../../tests/fixtures/executed-rules/manifest.json"), "utf8"),
    ) as { sourceAuthority: { constantsSha256: string }; frozenDecisions: { boardSize: number } };
    assert.equal(LEGACY_CONSTANTS_SHA256, manifest.sourceAuthority.constantsSha256);
    assert.equal(manifest.frozenDecisions.boardSize, BOARD_SPACES.length);
    assert.equal(BOARD_RULESET_AUTHORITY.evidence, "frozen-rust-source");
  });
});
