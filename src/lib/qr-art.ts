import QRCode from "qrcode";

/**
 * A "designed" QR as an SVG string (for the paper invoice): round dots, round finder eyes, one brand colour and an
 * optional logo in the middle. Error correction H (30 %) so the logo square (≤ 22 % of the side) never breaks scanning.
 */
export function qrArtSvg(payload: string, opts: { color?: string; logoHref?: string; logoBg?: string } = {}): string {
  const color = opts.color ?? "#0f4d3a";
  const qr = QRCode.create(payload, { errorCorrectionLevel: "H" });
  const n = qr.modules.size;
  const at = (r: number, c: number) => qr.modules.get(r, c) === 1;
  const finder = (r: number, c: number) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
  // logo hole: an odd number of modules centred, ~22 % of the side
  const hole = opts.logoHref ? Math.max(5, Math.floor(n * 0.22) | 1) : 0;
  const h0 = Math.floor((n - hole) / 2);
  const inHole = (r: number, c: number) => hole > 0 && r >= h0 - 1 && r < h0 + hole + 1 && c >= h0 - 1 && c < h0 + hole + 1;
  const dots: string[] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!at(r, c) || finder(r, c) || inHole(r, c)) continue;
      dots.push(`<circle cx="${c + 0.5}" cy="${r + 0.5}" r="0.43"/>`);
    }
  }
  const eye = (r: number, c: number) =>
    `<circle cx="${c + 3.5}" cy="${r + 3.5}" r="3" fill="none" stroke="${color}" stroke-width="1"/>` + `<circle cx="${c + 3.5}" cy="${r + 3.5}" r="1.55" fill="${color}"/>`;
  const logo = opts.logoHref
    ? `<rect x="${h0 - 0.3}" y="${h0 - 0.3}" width="${hole + 0.6}" height="${hole + 0.6}" rx="1.4" fill="${opts.logoBg ?? "#fff"}"/>` +
      `<image href="${opts.logoHref}" x="${h0 + 0.4}" y="${h0 + 0.4}" width="${hole - 0.8}" height="${hole - 0.8}" preserveAspectRatio="xMidYMid meet"/>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 ${n + 2} ${n + 2}" shape-rendering="geometricPrecision"><rect x="-1" y="-1" width="${n + 2}" height="${n + 2}" fill="#fff"/><g fill="${color}">${dots.join("")}</g>${eye(0, 0)}${eye(0, n - 7)}${eye(n - 7, 0)}${logo}</svg>`;
}
