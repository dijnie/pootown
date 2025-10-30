import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const formatAddress = (addr: string, length: number = 4) =>
  `${addr.slice(0, length)}...${addr.slice(-length)}`;

export function formatPrice(
  price: number,
  options: {
    locale?: string;
    minDecimals?: number;
    maxDecimals?: number;
    compact?: boolean;
  } = {}
): string {
  const {
    locale = "en-US",
    minDecimals = 0,
    maxDecimals = 2,
    compact = false,
  } = options;

  if (price === 0) return "$0.000";
  if (!isFinite(price)) return price > 0 ? "$∞" : "$-∞";
  if (isNaN(price)) return "N/A";

  // Unicode subscript mapping
  const subscriptMap: { [key: string]: string } = {
    "0": "₀",
    "1": "₁",
    "2": "₂",
    "3": "₃",
    "4": "₄",
    "5": "₅",
    "6": "₆",
    "7": "₇",
    "8": "₈",
    "9": "₉",
  };

  // Handle very large numbers with compact notation
  if (compact && Math.abs(price) >= 999) {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: 2,
    }).format(price);
  }

  // Handle regular numbers (>= 0.01)
  if (Math.abs(price) >= 0.01) {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: minDecimals,
      maximumFractionDigits: Math.min(maxDecimals, 6),
    }).format(price);
  }

  // Handle very small numbers (< 0.01)
  const str = Math.abs(price).toFixed(20);
  const afterDecimal = str.split(".")[1];
  const zerosCount = afterDecimal.search(/[1-9]/);

  if (zerosCount > 0 && zerosCount <= 10) {
    const significantDigits = afterDecimal.slice(zerosCount, zerosCount + 3);
    const subscriptZeros = zerosCount
      .toString()
      .split("")
      .map((digit) => subscriptMap[digit])
      .join("");

    const sign = price < 0 ? "-" : "";
    return `${sign}$0.0${subscriptZeros}${significantDigits}`;
  }

  // Fallback to scientific notation for extremely small numbers
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    notation: "scientific",
    maximumFractionDigits: 2,
  }).format(price);
}

export function formatTimeAgo(input: Date | number | string): string {
  let ms: number;

  if (input instanceof Date) {
    ms = input.getTime();
  } else if (typeof input === "number") {
    ms = input < 1e11 ? input * 1000 : input;
  } else if (typeof input === "string") {
    const numeric = Number(input);
    if (!isNaN(numeric)) {
      ms = numeric < 1e11 ? numeric * 1000 : numeric;
    } else {
      const parsed = new Date(input);
      ms = isNaN(parsed.getTime()) ? Date.now() : parsed.getTime();
    }
  } else {
    ms = Date.now();
  }

  const now = Date.now();
  let diff = now - ms;
  const isFuture = diff < 0;
  diff = Math.abs(diff);

  if (diff < 5000) return "just now";

  const SECOND = 1000;
  const MINUTE = 60 * SECOND;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;
  const WEEK = 7 * DAY;
  const MONTH = 30 * DAY;
  const YEAR = 365 * DAY;

  let value: number;
  let unit: string;

  if (diff < MINUTE) {
    value = Math.floor(diff / SECOND);
    unit = "s";
  } else if (diff < HOUR) {
    value = Math.floor(diff / MINUTE);
    unit = "m";
  } else if (diff < DAY) {
    value = Math.floor(diff / HOUR);
    unit = "h";
  } else if (diff < WEEK) {
    value = Math.floor(diff / DAY);
    unit = "d";
  } else if (diff < MONTH) {
    value = Math.floor(diff / WEEK);
    unit = "w";
  } else if (diff < YEAR) {
    value = Math.floor(diff / MONTH);
    unit = "mo";
  } else {
    value = Math.floor(diff / YEAR);
    unit = "y";
  }

  return isFuture ? `in ${value}${unit}` : `${value}${unit} ago`;
}

export function lamportsToSol(lamports: number | bigint): number {
  if (typeof lamports === "bigint") {
    return Math.abs(Number(lamports)) / 1000000000;
  }

  return Math.abs(lamports) / 1000000000;
}

/**
 * Format numbers with appropriate suffixes (K, M, B)
 */
export function formatNumber(
  num: number | string,
  options: {
    locale?: string;
    minDecimals?: number;
    maxDecimals?: number;
    useSuffixes?: boolean;
  } = {}
): string {
  const {
    locale = "en-US",
    minDecimals = 0,
    maxDecimals = 2,
    useSuffixes = false,
  } = options;

  num = Number(num);

  if (!isFinite(num) || isNaN(num)) return "N/A";

  // Apply suffixes only when requested
  if (useSuffixes) {
    if (num >= 1e9) {
      const value = num / 1e9;
      return (
        new Intl.NumberFormat(locale, {
          minimumFractionDigits: minDecimals,
          maximumFractionDigits: maxDecimals,
        }).format(value) + "B"
      );
    }
    if (num >= 1e6) {
      const value = num / 1e6;
      return (
        new Intl.NumberFormat(locale, {
          minimumFractionDigits: minDecimals,
          maximumFractionDigits: maxDecimals,
        }).format(value) + "M"
      );
    }
    if (num >= 1e3) {
      const value = num / 1e3;
      return (
        new Intl.NumberFormat(locale, {
          minimumFractionDigits: minDecimals,
          maximumFractionDigits: maxDecimals,
        }).format(value) + "K"
      );
    }
  }

  // Format without suffixes
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: minDecimals,
    maximumFractionDigits: maxDecimals,
  }).format(num);
}

// type PlayerInfo = {
//   id: number;
//   name: string;
//   color: string;
//   avatar: string;
//   position: number;
//   money: number;
//   properties: string[];
//   inJail: boolean;
//   jailTurns: number;
// };

// export function generatePlayerIcon(address: string): PlayerInfo {
//   // const icons = [
//   //   "🎩",
//   //   "🎯",
//   //   "🎲",
//   //   "🎪",
//   //   "🎨",
//   //   "🎭",
//   //   "🎸",
//   //   "🎺",
//   //   "🚗",
//   //   "🚕",
//   //   "🚙",
//   //   "🚌",
//   //   "🚎",
//   //   "🏎️",
//   //   "🚓",
//   //   "🚑",
//   //   "⭐",
//   //   "🌟",
//   //   "✨",
//   //   "💎",
//   //   "💰",
//   //   "🏆",
//   //   "🎖️",
//   //   "🏅",
//   //   "🦄",
//   //   "🐉",
//   //   "🦅",
//   //   "🦋",
//   //   "🐺",
//   //   "🦊",
//   //   "🐯",
//   //   "🦁",
//   // ];

//   const playerInfos = [
//     {
//       id: 1,
//       name: "Blue Baron",
//       color: "#4444ff",
//       avatar: "/images/blue-figure.png",
//       position: 0,
//       money: 1500,
//       properties: [],
//       inJail: false,
//       jailTurns: 0,
//     },
//     {
//       id: 2,
//       name: "Green Giant",
//       color: "#44ff44",
//       avatar: "/images/green-figure.png",
//       position: 0,
//       money: 1500,
//       properties: [],
//       inJail: false,
//       jailTurns: 0,
//     },
//     {
//       id: 3,
//       name: "Red Tycoon",
//       color: "#ff4444",
//       avatar: "/images/red-figure.png",
//       position: 0,
//       money: 1500,
//       properties: [],
//       inJail: false,
//       jailTurns: 0,
//     },
//     {
//       id: 4,
//       name: "Yellow Mogul",
//       color: "#ffdd44",
//       avatar: "/images/yellow-figure.png",
//       position: 0,
//       money: 1500,
//       properties: [],
//       inJail: false,
//       jailTurns: 0,
//     },
//   ];

//   let saved = {} as { [key: string]: PlayerInfo };

//   try {
//     saved = JSON.parse(localStorage.getItem("assignedPlayers") || "{}");
//   } catch (error) {
//     saved = {};
//   }

//   if (saved[address]) {
//     return saved[address];
//   }

//   const selectedIds = Object.values(saved).map((item) => item.id);

//   const availableItem = playerInfos.find(
//     (item) => !selectedIds.includes(item.id)
//   );
//   if (!availableItem) return {} as PlayerInfo;

//   saved[address] = availableItem;
//   localStorage.setItem("assignedPlayers", JSON.stringify(saved));

//   return availableItem;
// }
