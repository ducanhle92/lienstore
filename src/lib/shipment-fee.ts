/**
 * ⑤ "Phí ship ĐVVC → shop VN" (pure, unit-tested): one transfer pays the carrier's Vietnam warehouse → shop leg of a
 * whole run; it is shared over the run's parts (an order's units, or the units with no order) by billable weight.
 */

export interface FeePart {
  key: string;
  grams: number;
}

/**
 * Splits `total` đồng over the parts in proportion to their grams, in whole đồng that add up exactly to `total`
 * (largest remainder). Parts with no weight share equally when nothing has a weight.
 */
export function splitByWeight(total: number, parts: FeePart[]): Map<string, number> {
  const out = new Map<string, number>();
  const amount = Math.max(0, Math.round(total));
  if (!parts.length) return out;
  const weights = parts.map((p) => Math.max(0, p.grams));
  const sum = weights.reduce((a, b) => a + b, 0);
  const w = sum > 0 ? weights : parts.map(() => 1);
  const W = sum > 0 ? sum : parts.length;
  const exact = w.map((x) => (amount * x) / W);
  const floor = exact.map(Math.floor);
  let left = amount - floor.reduce((a, b) => a + b, 0);
  // the biggest fractional parts take the leftover đồng (ties: the earlier part)
  const order = exact.map((x, i) => ({ i, frac: x - floor[i] })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    floor[i]++;
    left--;
  }
  parts.forEach((p, i) => out.set(p.key, (out.get(p.key) ?? 0) + floor[i]));
  return out;
}

/** "244.000" / "244,000" / "244000đ" → 244000; anything else → null. VND has no decimals. */
export function parseVnd(raw: string): number | null {
  const digits = String(raw ?? "").replace(/[\s.,đ₫dD]|VND|vnd/g, "");
  if (!/^\d{1,12}$/.test(digits)) return null;
  return Number(digits);
}
