/**
 * Avatar utilities for generating stable avatar paths from opaque player IDs.
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
  "panda_sunglasses_bluehoodie.png",
] as const;

/**
 * Generate a stable avatar path for an opaque player ID.
 * @param playerId - The player ID to generate an avatar for
 * @returns Full path to the avatar image
 */
export function getAvatarForPlayer(playerId: string): string {
  if (!playerId) {
    return getRandomAvatar();
  }

  // Convert the opaque ID to a number for consistent selection.
  let hash = 0;
  for (let i = 0; i < playerId.length; i++) {
    const char = playerId.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  // Use absolute value and modulo to get index
  const index = Math.abs(hash) % AVATARS.length;

  return `/avatars/${AVATARS[index]}`;
}

/**
 * Get a random avatar path when no player ID is available.
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
  return AVATARS.map((avatar) => `/avatars/${avatar}`);
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
