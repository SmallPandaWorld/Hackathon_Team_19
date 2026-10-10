/**
 * Initials for a player without a picture: first letter of the first and
 * last name ("Andrii Gora" → "AG"). One-word names give one letter, an
 * empty name gives "?".
 */
export function initials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0].charAt(0);
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
  return (first + last).toLocaleUpperCase();
}
