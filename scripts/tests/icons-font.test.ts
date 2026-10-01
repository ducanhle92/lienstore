/**
 * The Font Awesome file shipped to browsers is a subset (scripts/fonts/subset-fontawesome.py). Every glyph that
 * shared/icons.tsx can render must be in it, or the icon shows as a blank box:  npm run test:icons
 * Fails → run `npm run fonts:subset` and commit the new woff2 + json.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const root = path.resolve(__dirname, "../..");
const icons = fs.readFileSync(path.join(root, "src/components/sites/lienstore/shared/icons.tsx"), "utf8");
const fontsDir = path.join(root, "public/sites/lienstore/shared/fonts");

const glyphs = (): Map<string, string> => {
  const body = icons.slice(icons.indexOf("const GLYPHS"), icons.indexOf("} as const"));
  const out = new Map<string, string>();
  for (const m of body.matchAll(/"?([a-z0-9-]+)"?:\s*"(.)"/gu)) out.set(m[1], `U+${m[2].codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`);
  return out;
};

describe("FontAwesome subset", () => {
  const map = glyphs();
  const manifest = JSON.parse(fs.readFileSync(path.join(fontsDir, "fontawesome-subset.json"), "utf8")) as { codepoints: string[] };
  const have = new Set(manifest.codepoints);
  it("icons.tsx has glyphs to check", () => assert.ok(map.size >= 50, `only ${map.size} glyphs parsed`));
  it("every icon in icons.tsx is in the shipped subset (else run npm run fonts:subset)", () => {
    const missing = [...map].filter(([, cp]) => !have.has(cp)).map(([name, cp]) => `${name} ${cp}`);
    assert.deepEqual(missing, []);
  });
  it("the subset woff2 exists and is small", () => {
    const size = fs.statSync(path.join(fontsDir, "fontawesome-subset.woff2")).size;
    assert.ok(size > 1000 && size < 40_000, `unexpected size ${size}`);
  });
  it("globals.css points at the subset and declares only the fonts that exist", () => {
    const css = fs.readFileSync(path.join(root, "src/app/globals.css"), "utf8");
    assert.ok(css.includes("fontawesome-subset.woff2"));
    for (const m of css.matchAll(/\/sites\/lienstore\/shared\/fonts\/([^")]+)/g)) assert.ok(fs.existsSync(path.join(fontsDir, m[1])), `missing font file ${m[1]}`);
    assert.ok(!css.includes("latin-ext.woff2"), "latin-ext must not be declared (Ă Đ Ơ Ư overlap makes browsers fetch it for nothing)");
  });
});
