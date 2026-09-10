/** Public display name of a reviewer: the first three characters of the account name, the rest hidden. */
export function maskReviewer(name: string): string {
  const s = name.trim();
  if (!s) return "***";
  return `${s.slice(0, 3)}***`;
}
