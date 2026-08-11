/**
 * Avatar utilities for generating consistent avatar paths based on wallet addresses
 */

// List of available panda avatars
const AVATARS = [
  "panda_bluehoodie_wink.png",
  "panda_browncap.png", 
  "panda_cowboy_hat.png",
  "panda_headphones_smile.png",
  "panda_red_cap.png",
  "panda_redbow_wink.png",
  "panda_roundglasses.png",
  "panda_scarf_glasses.png",
  "panda_sunglasses_bluehoodie.png"
] as const;

/**
 * Generate a random avatar path based on wallet address
 * This ensures the same wallet always gets the same avatar
 * @param walletAddress - The wallet address to generate avatar for
 * @returns Full path to the avatar image
 */
export function getRandomAvatarByAddress(walletAddress: string): string {
  if (!walletAddress) {
    return getRandomAvatar();
  }

  // Convert wallet address to a number for consistent selection
  let hash = 0;
  for (let i = 0; i < walletAddress.length; i++) {
    const char = walletAddress.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  // Use absolute value and modulo to get index
  const index = Math.abs(hash) % AVATARS.length;
  
  return `/avatars/${AVATARS[index]}`;
}

/**
 * Get a random avatar path (for cases where you don't have a wallet address)
 * @returns Full path to a randomly selected avatar image
 */
export function getRandomAvatar(): string {
  const randomIndex = Math.floor(Math.random() * AVATARS.length);
  return `/avatars/${AVATARS[randomIndex]}`;
}

/**
 * Get all available avatar paths
 * @returns Array of all avatar paths
 */
export function getAllAvatars(): string[] {
  return AVATARS.map(avatar => `/avatars/${avatar}`);
}

/**
 * Get avatar by index (useful for testing or specific selection)
 * @param index - Index of the avatar (0-based)
 * @returns Full path to the avatar image, or first avatar if index is invalid
 */
export function getAvatarByIndex(index: number): string {
  const validIndex = Math.max(0, Math.min(index, AVATARS.length - 1));
  return `/avatars/${AVATARS[validIndex]}`;
}

/**
 * Get the number of available avatars
 * @returns Number of available avatars
 */
export function getAvatarCount(): number {
  return AVATARS.length;
}

/**
 * Check if an avatar path is valid
 * @param avatarPath - The avatar path to validate
 * @returns True if the avatar path is valid
 */
export function isValidAvatarPath(avatarPath: string): boolean {
  return getAllAvatars().includes(avatarPath);
}
