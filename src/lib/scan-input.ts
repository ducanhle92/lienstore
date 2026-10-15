/**
 * Input pipeline helpers for the phone scan screen — pure, unit-tested (scripts/tests/scan.test.ts).
 *
 * PresenceGate: a camera sees the same barcode in every frame. A code is emitted when it APPEARS, then ignored while it
 * stays in view; it counts again only after it has been out of view for `goneAfterMs` (or after `forget`, the
 * "Quét lại" button). So holding a product in front of the camera adds it once, never in a loop.
 *
 * WedgeBuffer: Bluetooth / USB scanners act as keyboards and type the code fast, then Enter. Keys typed slowly (a person
 * typing) are not taken as a scan; the buffer is only fed when no input field has focus.
 */
export class PresenceGate {
  private lastSeen = new Map<string, number>();
  constructor(private readonly goneAfterMs = 1200) {}

  /** Codes visible in this frame → the ones that just appeared. */
  observe(codes: string[], now: number): string[] {
    const fresh: string[] = [];
    for (const c of new Set(codes)) {
      const last = this.lastSeen.get(c);
      if (last === undefined || now - last > this.goneAfterMs) fresh.push(c);
      this.lastSeen.set(c, now);
    }
    // drop long-gone entries so the map does not grow
    for (const [c, t] of this.lastSeen) if (now - t > this.goneAfterMs * 10) this.lastSeen.delete(c);
    return fresh;
  }

  /** Accept this code again right away (deliberate re-scan). */
  forget(code?: string): void {
    if (code === undefined) this.lastSeen.clear();
    else this.lastSeen.delete(code);
  }
}

export class WedgeBuffer {
  private chars: string[] = [];
  private times: number[] = [];
  constructor(
    private readonly maxGapMs = 60,
    private readonly minLength = 4,
  ) {}

  /** Feed one key (KeyboardEvent.key) at time `now`; returns the scanned code when Enter ends a fast burst. */
  feed(key: string, now: number): string | null {
    if (key === "Enter" || key === "Tab") {
      const code = this.chars.join("");
      const fast = this.times.every((t, i) => i === 0 || t - this.times[i - 1] <= this.maxGapMs);
      this.reset();
      return code.length >= this.minLength && fast ? code : null;
    }
    if (key.length !== 1) return null;
    if (this.times.length && now - this.times[this.times.length - 1] > this.maxGapMs * 4) this.reset();
    this.chars.push(key);
    this.times.push(now);
    if (this.chars.length > 256) this.reset();
    return null;
  }

  reset(): void {
    this.chars = [];
    this.times = [];
  }
}

/** True when keystrokes belong to a field the user is typing in (the wedge must not steal them). */
export function isTypingTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return (el as HTMLElement).isContentEditable === true;
}
