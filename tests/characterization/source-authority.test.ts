import { createHash } from "crypto";
import { execFileSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { expect } from "chai";

type RuleFamily = {
  name: string;
  status: "source-evidenced" | "excluded";
  evidence?: string[];
  reason?: string;
};

type Manifest = {
  sourceAuthority: {
    constantsSha256: string;
    stateSha256: string;
  };
  ruleFamilies: RuleFamily[];
  approvedDivergences: Array<Record<string, unknown>>;
};

type VisualManifest = {
  artifacts: Array<{ file: string; sha256: string }>;
};

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const hash = (contents: string | Buffer) =>
  createHash("sha256").update(contents).digest("hex");

describe("executed legacy rules authority", () => {
  const manifest = JSON.parse(
    read("tests/fixtures/executed-rules/manifest.json")
  ) as Manifest;
  const constants = read("programs/panda-monopoly/src/constants.rs");
  const state = read("programs/panda-monopoly/src/state/mod.rs");

  it("pins the reviewed Rust sources", () => {
    expect(hash(constants)).to.equal(
      manifest.sourceAuthority.constantsSha256
    );
    expect(hash(state)).to.equal(manifest.sourceAuthority.stateSha256);
  });

  it("freezes the core player, cash, board, and card boundaries", () => {
    expect(constants).to.include("pub const MIN_PLAYERS: u8 = 2;");
    expect(constants).to.include("pub const MAX_PLAYERS: u8 = 4;");
    expect(constants).to.include("pub const STARTING_MONEY: u32 = 1500;");
    expect(constants).to.include("pub const BOARD_SIZE: u8 = 40;");
    expect(constants).to.include("pub const CHANCE_CARDS: [ChanceCard; 5]");
    expect(constants).to.include(
      "pub const COMMUNITY_CHEST_CARDS: [CommunityChestCard; 5]"
    );
  });

  it("keeps active unusual card behavior and the approved correction explicit", () => {
    const specialSpaces = read(
      "programs/panda-monopoly/src/instructions/special_spaces.rs"
    );
    expect(specialSpaces).to.include("CardEffectType::MoveToNearest =>");
    expect(specialSpaces).to.include("CardEffectType::CollectFromPlayers =>");
    expect(constants).to.include("amount: 21");
    expect(manifest.approvedDivergences).to.deep.include({
      name: "community-chest-free-parking",
      legacyDestination: 21,
      targetDestination: 20,
      reason: "Approved correction to the board's Free Parking position."
    });
  });

  it("has evidence for every source-evidenced family and a reason for exclusions", () => {
    for (const family of manifest.ruleFamilies) {
      if (family.status === "source-evidenced") {
        expect(family.evidence, family.name).to.not.be.empty;
        for (const evidencePath of family.evidence ?? []) {
          expect(existsSync(resolve(root, evidencePath)), evidencePath).to.equal(
            true
          );
        }
      } else {
        expect(family.reason, family.name).to.be.a("string").and.not.be.empty;
      }
    }
  });

  it("contains no tracked persistent devnet key file", () => {
    expect(existsSync(resolve(root, "tests/utils/devnet-wallets.json"))).to.equal(
      false
    );
  });

  it("rejects tracked secret-bearing files and serialized keypair arrays", () => {
    const trackedFiles = execFileSync("git", ["ls-files", "-z"], {
      cwd: root,
      encoding: "utf8"
    })
      .split("\0")
      .filter(Boolean);

    expect(trackedFiles).to.not.include("tests/utils/devnet-wallets.json");
    expect(
      trackedFiles.filter(
        (path) =>
          /(^|\/)\.env($|\.)/.test(path) &&
          !path.endsWith(".example") &&
          !path.endsWith(".sample")
      )
    ).to.deep.equal([]);
    expect(
      trackedFiles.filter((path) => /\.(key|pem|p12)$/i.test(path))
    ).to.deep.equal([]);

    const artifactFiles = trackedFiles.filter(
      (path) =>
        path.startsWith("tests/fixtures/") ||
        path.startsWith("tests/characterization/") ||
        path === "tests/visual-baseline/manifest.json"
    );
    const serializedKeypair = /\[(?:\s*\d{1,3}\s*,){63}\s*\d{1,3}\s*\]/;
    const privateKeyMarker = ["BEGIN", "PRIVATE", "KEY"].join(" ");
    for (const artifactPath of artifactFiles) {
      const contents = read(artifactPath);
      expect(contents, artifactPath).to.not.match(serializedKeypair);
      expect(contents, artifactPath).to.not.include(privateKeyMarker);
    }
  });
});

describe("visual baseline authority", () => {
  const visualManifest = JSON.parse(
    read("tests/visual-baseline/manifest.json")
  ) as VisualManifest;

  it("pins every captured image", () => {
    expect(visualManifest.artifacts).to.have.length(5);
    for (const artifact of visualManifest.artifacts) {
      const image = readFileSync(
        resolve(root, "tests/visual-baseline", artifact.file)
      );
      expect(hash(image), artifact.file).to.equal(
        artifact.sha256
      );
    }
  });
});
