/** Short beep / buzz after a scan. Visual feedback is always shown; sound and vibration are extras when allowed. */
let ctx: AudioContext | null = null;

export function unlockAudio(): void {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!ctx && AC) ctx = new AC();
    void ctx?.resume();
  } catch {
    ctx = null;
  }
}

export function signal(kind: "ok" | "warn" | "error", enabled = true): void {
  if (!enabled) return;
  try {
    navigator.vibrate?.(kind === "ok" ? 40 : [80, 60, 80]);
  } catch {
    /* not supported (iOS) */
  }
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = kind === "ok" ? 1320 : kind === "warn" ? 660 : 330;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (kind === "ok" ? 0.08 : 0.25));
  } catch {
    /* ignore */
  }
}
