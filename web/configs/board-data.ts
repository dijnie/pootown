export type ColorGroup =
  | "brown"
  | "lightBlue"
  | "pink"
  | "orange"
  | "red"
  | "yellow"
  | "green"
  | "darkBlue";

export const colorMap: Record<ColorGroup, string> = {
  brown: "#955235",
  lightBlue: "#AAE0FA",
  pink: "#D93A96",
  orange: "#F7941D",
  red: "#F11C26",
  yellow: "#FEF200",
  green: "#1FB25A",
  darkBlue: "#0072BB",
};

export const playerColors: Record<number, string> = {
  0: "#ffbf00",
  1: "#04e17a",
  2: "#0099ff",
  3: "#e96bff",
};

// Color group mappings for Solana-themed properties
export const colorGroups: Record<ColorGroup, number[]> = {
  brown: [1, 3], // BONK Avenue, WIF Lane
  lightBlue: [6, 8, 9], // JUP Street, RAY Boulevard, ORCA Way
  pink: [11, 13, 14], // SAGA Place, TENSOR Avenue, MAGIC EDEN Street
  orange: [16, 18, 19], // HELIO Place, KAMINO Avenue, DRIFT Street
  red: [21, 23, 24], // MANGO Markets, HUBBLE Avenue, MARINADE Street
  yellow: [26, 27, 29], // BACKPACK Avenue, PHANTOM Street, SOLFLARE Gardens
  green: [31, 32, 34], // ANATOLY Avenue, RAJ Street, FIREDANCER Avenue
  darkBlue: [37, 39], // SVM Place, SAGA Boardwalk
};

// Base interface for common properties
interface BaseBoardSpace {
  position: number;
  name: string;
  rotate?: "left" | "top" | "right";
  logo?: string;
}

// Property space (buyable properties with color groups)
export interface PropertySpace extends BaseBoardSpace {
  type: "property";
  price: number;
  colorGroup: ColorGroup;
  baseRent: number;
  rentWithColorGroup: number;
  rentWith1House: number;
  rentWith2Houses: number;
  rentWith3Houses: number;
  rentWith4Houses: number;
  rentWithHotel: number;
  houseCost: number;
  hotelCost: number;
  mortgageValue: number;
}

// Railroad space
export interface RailroadSpace extends BaseBoardSpace {
  type: "railroad";
  price: number;
  railroadRent: [number, number, number, number]; // Rent for owning 1, 2, 3, 4 railroads
  mortgageValue: number;
}

// Utility space
export interface UtilitySpace extends BaseBoardSpace {
  type: "utility";
  price: number;
  utilityMultiplier: [number, number]; // Multiplier for owning 1, 2 utilities
  mortgageValue: number;
}

// Corner spaces (GO, Jail, Free Parking, Go To Jail)
export interface CornerSpace extends BaseBoardSpace {
  type: "corner";
}

// Chance card space
export interface ChanceSpace extends BaseBoardSpace {
  type: "chance";
}

// Community Chest space
export interface CommunityChestSpace extends BaseBoardSpace {
  type: "community-chest";
}

// Tax space
export interface TaxSpace extends BaseBoardSpace {
  type: "tax";
  taxAmount: number;
  instructions?: string;
}

// Union type for all board spaces
export type BoardSpace =
  | PropertySpace
  | RailroadSpace
  | UtilitySpace
  | CornerSpace
  | ChanceSpace
  | CommunityChestSpace
  | TaxSpace;

// Unified property data with Solana-themed board spaces
export const boardData: BoardSpace[] = [
  // Position 0 - Solana Genesis (GO)
  {
    position: 0,
    name: "Solana Genesis",
    type: "corner",
  },

  // Position 1 - BONK Avenue (Brown Property)
  {
    position: 1,
    name: "BONK Avenue",
    type: "property",
    price: 60,
    colorGroup: "brown",
    baseRent: 2,
    rentWithColorGroup: 4,
    rentWith1House: 10,
    rentWith2Houses: 30,
    rentWith3Houses: 90,
    rentWith4Houses: 160,
    rentWithHotel: 250,
    houseCost: 50,
    hotelCost: 50,
    mortgageValue: 30,
    logo: "/images/bonk.png",
  },

  // Position 2 - Airdrop Chest
  {
    position: 2,
    name: "Airdrop",
    type: "community-chest",
    logo: "/images/airdrop.png",
  },

  // Position 3 - WIF Lane (Brown Property)
  {
    position: 3,
    name: "WIF Lane",
    type: "property",
    price: 60,
    colorGroup: "brown",
    baseRent: 4,
    rentWithColorGroup: 8,
    rentWith1House: 20,
    rentWith2Houses: 60,
    rentWith3Houses: 180,
    rentWith4Houses: 320,
    rentWithHotel: 450,
    houseCost: 50,
    hotelCost: 50,
    mortgageValue: 30,
    logo: "/images/wif.png",
  },

  // Position 4 - MEV Tax
  {
    position: 4,
    name: "Rent Fee",
    type: "tax",
    taxAmount: 200,
    instructions: "Pay $200",
    logo: "/images/sol.png",
  },

  // Position 5 - Wormhole Bridge (Railroad)
  {
    position: 5,
    name: "Wormhole Bridge",
    type: "railroad",
    price: 200,
    railroadRent: [25, 50, 100, 200],
    mortgageValue: 100,
    logo: "/images/wormhole.png",
  },

  // Position 6 - JUP Street (Light Blue Property)
  {
    position: 6,
    name: "JUP Street",
    type: "property",
    price: 100,
    colorGroup: "lightBlue",
    baseRent: 6,
    rentWithColorGroup: 12,
    rentWith1House: 30,
    rentWith2Houses: 90,
    rentWith3Houses: 270,
    rentWith4Houses: 400,
    rentWithHotel: 550,
    houseCost: 50,
    hotelCost: 50,
    mortgageValue: 50,
    logo: "/images/jup.png",
  },

  // Position 7 - Pump.fun Surprise
  {
    position: 7,
    name: "Pump.fun Surprise",
    type: "chance",
    logo: "/images/pump.png",
  },

  // Position 8 - RAY Boulevard (Light Blue Property)
  {
    position: 8,
    name: "RAY Boulevard",
    type: "property",
    price: 100,
    colorGroup: "lightBlue",
    baseRent: 6,
    rentWithColorGroup: 12,
    rentWith1House: 30,
    rentWith2Houses: 90,
    rentWith3Houses: 270,
    rentWith4Houses: 400,
    rentWithHotel: 550,
    houseCost: 50,
    hotelCost: 50,
    mortgageValue: 50,
    logo: "/images/raydium.png",
  },

  // Position 9 - ORCA Way (Light Blue Property)
  {
    position: 9,
    name: "ORCA Way",
    type: "property",
    price: 120,
    colorGroup: "lightBlue",
    baseRent: 8,
    rentWithColorGroup: 16,
    rentWith1House: 40,
    rentWith2Houses: 100,
    rentWith3Houses: 300,
    rentWith4Houses: 450,
    rentWithHotel: 600,
    houseCost: 50,
    hotelCost: 50,
    mortgageValue: 60,
    logo: "/images/orca.png",
  },

  // Position 10 - Validator Jail
  {
    position: 10,
    name: "Validator Jail",
    type: "corner",
    logo: "/images/sol.png",
  },

  // Position 11 - SAGA Place (Pink Property)
  {
    position: 11,
    name: "Solanart Place",
    type: "property",
    price: 140,
    colorGroup: "pink",
    baseRent: 10,
    rentWithColorGroup: 20,
    rentWith1House: 50,
    rentWith2Houses: 150,
    rentWith3Houses: 450,
    rentWith4Houses: 625,
    rentWithHotel: 750,
    houseCost: 50,
    hotelCost: 50,
    mortgageValue: 70,
    rotate: "left",
    logo: "/images/solanart.png",
  },

  // Position 12 - Pyth Oracle (Utility)
  {
    position: 12,
    name: "Pyth",
    type: "utility",
    price: 150,
    utilityMultiplier: [4, 10],
    mortgageValue: 75,
    rotate: "left",
    logo: "/images/pyth.png",
  },

  // Position 13 - TENSOR Avenue (Pink Property)
  {
    position: 13,
    name: "TENSOR Avenue",
    type: "property",
    price: 140,
    colorGroup: "pink",
    baseRent: 10,
    rentWithColorGroup: 20,
    rentWith1House: 50,
    rentWith2Houses: 150,
    rentWith3Houses: 450,
    rentWith4Houses: 625,
    rentWithHotel: 750,
    houseCost: 100,
    hotelCost: 100,
    mortgageValue: 70,
    rotate: "left",
    logo: "/images/tensor.png",
  },

  // Position 14 - MAGIC EDEN Street (Pink Property)
  {
    position: 14,
    name: "MAGIC EDEN Street",
    type: "property",
    price: 160,
    colorGroup: "pink",
    baseRent: 12,
    rentWithColorGroup: 24,
    rentWith1House: 60,
    rentWith2Houses: 180,
    rentWith3Houses: 500,
    rentWith4Houses: 700,
    rentWithHotel: 900,
    houseCost: 100,
    hotelCost: 100,
    mortgageValue: 80,
    rotate: "left",
    logo: "/images/magic-eden.png",
  },

  // Position 15 - Allbridge (Railroad)
  {
    position: 15,
    name: "Allbridge",
    type: "railroad",
    price: 200,
    railroadRent: [25, 50, 100, 200],
    mortgageValue: 100,
    rotate: "left",
    logo: "/images/allbridge.png",
  },

  // Position 16 - HELIO Place (Orange Property)
  {
    position: 16,
    name: "Meteora Place",
    type: "property",
    price: 180,
    colorGroup: "orange",
    baseRent: 14,
    rentWithColorGroup: 28,
    rentWith1House: 70,
    rentWith2Houses: 200,
    rentWith3Houses: 550,
    rentWith4Houses: 750,
    rentWithHotel: 950,
    houseCost: 100,
    hotelCost: 100,
    mortgageValue: 90,
    rotate: "left",
    logo: "/images/meteora.png",
  },

  // Position 17 - Airdrop Chest
  {
    position: 17,
    name: "Airdrop",
    type: "community-chest",
    rotate: "left",
    logo: "/images/airdrop.png",
  },

  // Position 18 - KAMINO Avenue (Orange Property)
  {
    position: 18,
    name: "KAMINO Avenue",
    type: "property",
    price: 180,
    colorGroup: "orange",
    baseRent: 14,
    rentWithColorGroup: 28,
    rentWith1House: 70,
    rentWith2Houses: 200,
    rentWith3Houses: 550,
    rentWith4Houses: 750,
    rentWithHotel: 950,
    houseCost: 100,
    hotelCost: 100,
    mortgageValue: 90,
    rotate: "left",
    logo: "/images/kamino.png",
  },

  // Position 19 - DRIFT Street (Orange Property)
  {
    position: 19,
    name: "DRIFT Street",
    type: "property",
    price: 200,
    colorGroup: "orange",
    baseRent: 16,
    rentWithColorGroup: 32,
    rentWith1House: 80,
    rentWith2Houses: 240,
    rentWith3Houses: 600,
    rentWith4Houses: 800,
    rentWithHotel: 1000,
    houseCost: 100,
    hotelCost: 100,
    mortgageValue: 100,
    rotate: "left",
    logo: "/images/drift.png",
  },

  // Position 20 - Free Airdrop Parking
  {
    position: 20,
    name: "Free Airdrop Parking",
    type: "corner",
    logo: "/images/free-airdrop.png",
  },

  // Position 21 - MANGO Markets (Red Property)
  {
    position: 21,
    name: "Jito Markets",
    type: "property",
    price: 220,
    colorGroup: "red",
    baseRent: 18,
    rentWithColorGroup: 36,
    rentWith1House: 90,
    rentWith2Houses: 270,
    rentWith3Houses: 650,
    rentWith4Houses: 850,
    rentWithHotel: 1050,
    houseCost: 150,
    hotelCost: 150,
    mortgageValue: 110,
    rotate: "top",
    logo: "/images/jito.png",
  },

  // Position 22 - Pump.fun Surprise
  {
    position: 22,
    name: "Pump.fun Surprise",
    type: "chance",
    rotate: "top",
    logo: "/images/pump.png",
  },

  // Position 23 - HUBBLE Avenue (Red Property)
  {
    position: 23,
    name: "Sanctum Avenue",
    type: "property",
    price: 220,
    colorGroup: "red",
    baseRent: 18,
    rentWithColorGroup: 36,
    rentWith1House: 90,
    rentWith2Houses: 270,
    rentWith3Houses: 650,
    rentWith4Houses: 850,
    rentWithHotel: 1050,
    houseCost: 150,
    hotelCost: 150,
    mortgageValue: 110,
    rotate: "top",
    logo: "/images/sanctum.png",
  },

  // Position 24 - MARINADE Street (Red Property)
  {
    position: 24,
    name: "MARINADE Street",
    type: "property",
    price: 240,
    colorGroup: "red",
    baseRent: 20,
    rentWithColorGroup: 40,
    rentWith1House: 100,
    rentWith2Houses: 300,
    rentWith3Houses: 750,
    rentWith4Houses: 950,
    rentWithHotel: 1100,
    houseCost: 150,
    hotelCost: 150,
    mortgageValue: 120,
    rotate: "top",
    logo: "/images/marinade.png",
  },

  // Position 25 - LayerZero Bridge (Railroad)
  {
    position: 25,
    name: "LayerZero Bridge",
    type: "railroad",
    price: 200,
    railroadRent: [25, 50, 100, 200],
    mortgageValue: 100,
    rotate: "top",
    logo: "/images/layer-zero.png",
  },

  // Position 26 - BACKPACK Avenue (Yellow Property)
  {
    position: 26,
    name: "BACKPACK Avenue",
    type: "property",
    price: 260,
    colorGroup: "yellow",
    baseRent: 22,
    rentWithColorGroup: 40,
    rentWith1House: 110,
    rentWith2Houses: 330,
    rentWith3Houses: 850,
    rentWith4Houses: 1050,
    rentWithHotel: 1200,
    houseCost: 150,
    hotelCost: 150,
    mortgageValue: 120,
    rotate: "top",
    logo: "/images/backpack.jpeg",
  },

  // Position 27 - PHANTOM Street (Yellow Property)
  {
    position: 27,
    name: "PHANTOM Street",
    type: "property",
    price: 260,
    colorGroup: "yellow",
    baseRent: 22,
    rentWithColorGroup: 44,
    rentWith1House: 110,
    rentWith2Houses: 330,
    rentWith3Houses: 850,
    rentWith4Houses: 1050,
    rentWithHotel: 1200,
    houseCost: 150,
    hotelCost: 150,
    mortgageValue: 130,
    rotate: "top",
    logo: "/images/phantom.png",
  },

  // Position 28 - Switchboard Oracle (Utility)
  {
    position: 28,
    name: "Switchboard",
    type: "utility",
    price: 150,
    utilityMultiplier: [4, 10],
    mortgageValue: 75,
    rotate: "top",
    logo: "/images/switchboard.png",
  },

  // Position 29 - SOLFLARE Gardens (Yellow Property)
  {
    position: 29,
    name: "SOLFLARE Gardens",
    type: "property",
    price: 280,
    colorGroup: "yellow",
    baseRent: 24,
    rentWithColorGroup: 48,
    rentWith1House: 120,
    rentWith2Houses: 360,
    rentWith3Houses: 900,
    rentWith4Houses: 1100,
    rentWithHotel: 1300,
    houseCost: 150,
    hotelCost: 150,
    mortgageValue: 140,
    rotate: "top",
    logo: "/images/solfare.png",
  },

  // Position 30 - Go To Validator Jail
  {
    position: 30,
    name: "Go To Validator Jail",
    type: "corner",
    logo: "/images/sol.png",
  },

  // Position 31 - ANATOLY Avenue (Green Property)
  {
    position: 31,
    name: "Helium Avenue",
    type: "property",
    price: 300,
    colorGroup: "green",
    baseRent: 26,
    rentWithColorGroup: 52,
    rentWith1House: 130,
    rentWith2Houses: 390,
    rentWith3Houses: 900,
    rentWith4Houses: 1100,
    rentWithHotel: 1300,
    houseCost: 200,
    hotelCost: 200,
    mortgageValue: 150,
    rotate: "right",
    logo: "/images/helium.png",
  },

  // Position 32 - RAJ Street (Green Property)
  {
    position: 32,
    name: "Render Street",
    type: "property",
    price: 300,
    colorGroup: "green",
    baseRent: 26,
    rentWithColorGroup: 52,
    rentWith1House: 130,
    rentWith2Houses: 390,
    rentWith3Houses: 900,
    rentWith4Houses: 1100,
    rentWithHotel: 1300,
    houseCost: 200,
    hotelCost: 200,
    mortgageValue: 150,
    rotate: "right",
    logo: "/images/render.png",
  },

  // Position 33 - Airdrop Chest
  {
    position: 33,
    name: "Airdrop Chest",
    type: "community-chest",
    rotate: "right",
    logo: "/images/airdrop.png",
  },

  // Position 34 - FIREDANCER Avenue (Green Property)
  {
    position: 34,
    name: "Hivemapper Avenue",
    type: "property",
    price: 320,
    colorGroup: "green",
    baseRent: 28,
    rentWithColorGroup: 56,
    rentWith1House: 150,
    rentWith2Houses: 450,
    rentWith3Houses: 1000,
    rentWith4Houses: 1200,
    rentWithHotel: 1400,
    houseCost: 200,
    hotelCost: 200,
    mortgageValue: 160,
    rotate: "right",
    logo: "/images/hivemapper.png",
  },

  // Position 35 - deBridge (Railroad)
  {
    position: 35,
    name: "deBridge",
    type: "railroad",
    price: 200,
    railroadRent: [25, 50, 100, 200],
    mortgageValue: 100,
    rotate: "right",
    logo: "/images/debridge.png",
  },

  // Position 36 - Pump.fun Surprise
  {
    position: 36,
    name: "Pump.fun Surprise",
    type: "chance",
    rotate: "right",
    logo: "/images/pump.png",
  },

  // Position 37 - SVM Place (Dark Blue Property)
  {
    position: 37,
    name: "Triton One Place",
    type: "property",
    price: 350,
    colorGroup: "darkBlue",
    baseRent: 35,
    rentWithColorGroup: 70,
    rentWith1House: 175,
    rentWith2Houses: 500,
    rentWith3Houses: 1100,
    rentWith4Houses: 1400,
    rentWithHotel: 1500,
    houseCost: 200,
    hotelCost: 200,
    mortgageValue: 175,
    rotate: "right",
    logo: "/images/triton-one.png",
  },

  // Position 38 - Priority Fee Tax
  {
    position: 38,
    name: "Priority Fee",
    type: "tax",
    taxAmount: 75,
    rotate: "right",
    logo: "/images/sol.png",
  },

  // Position 39 - SAGA Boardwalk (Dark Blue Property)
  {
    position: 39,
    name: "Helius Boardwalk",
    type: "property",
    price: 400,
    colorGroup: "darkBlue",
    baseRent: 50,
    rentWithColorGroup: 100,
    rentWith1House: 200,
    rentWith2Houses: 600,
    rentWith3Houses: 1200,
    rentWith4Houses: 1600,
    rentWithHotel: 2000,
    houseCost: 200,
    hotelCost: 200,
    mortgageValue: 200,
    rotate: "right",
    logo: "/images/helius.png",
  },
];

// #955235 brow
// #AAE0FA ligt blue
// #D93A96 pink
// #F7941D orange
// #F11C26 red
// #FEF200 yellow
// #1FB25A green
// #0072BB blue

// Surprise Cards (Pump.fun Surprise Deck)
export const surpriseCards = [
  {
    id: 1,
    title: "Memecoin Pump! 🚀",
    description:
      "Advance to the nearest memecoin property (BONK or WIF). If unowned, you may buy it. If owned, pay double rent – the pump is real!",
    action: "advance-to-nearest-memecoin",
    value: 0,
  },
  {
    id: 2,
    title: "Rug Pull Alert! 💸",
    description:
      "Your latest trade gets rugged. Pay $50 to the bank for exit liquidity.",
    action: "pay-money",
    value: 50,
  },
  {
    id: 3,
    title: "Flash Loan Win ⚡",
    description:
      "Borrow big, repay fast. Collect 100 SOL from the bank – degen arbitrage pays off.",
    action: "collect-money",
    value: 100,
  },
  {
    id: 4,
    title: "Congestion Jam 🚧",
    description:
      "Network overload! Go back 3 spaces - too many bots in the mempool.",
    action: "move-back",
    value: -3,
  },
  {
    id: 5,
    title: "Dev Unlock 🔓",
    description:
      "Team tokens vest early. Get out of Validator Jail free – keep this card or sell it to another player.",
    action: "get-out-of-jail",
    value: 0,
  },
];

// Treasure Cards (Airdrop Chest Deck)
export const treasureCards = [
  {
    id: 1,
    title: "Retroactive Airdrop! 🪂",
    description:
      "You farmed early. Collect $50 from every player – points paid off.",
    action: "collect-from-players",
    value: 50,
  },
  {
    id: 2,
    title: "Staking Rewards 💰",
    description:
      "Your validator performs. Collect $100 from the bank – compounded yields.",
    action: "collect-money",
    value: 100,
  },
  {
    id: 3,
    title: "NFT Floor Sweep 🖼️",
    description:
      "Community bids up your jpegs. Advance to Free Airdrop Parking and collect the pot.",
    action: "advance-to-free-parking",
    value: 0,
  },
  {
    id: 4,
    title: "DAO Vote Win 🗳️",
    description:
      "Proposal passes in your favor. Repair all your properties for free – grants approved.",
    action: "repair-free",
    value: 0,
  },
  {
    id: 5,
    title: "Wallet Drain Fee 🔒",
    description:
      "Phishing attempt succeeds. Pay $50 to the bank – always check your seeds!",
    action: "pay-money",
    value: 50,
  },
];
