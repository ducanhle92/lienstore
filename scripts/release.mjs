#!/usr/bin/env node
/**
 * One-command release:  npm run release -- patch | minor | major | 1.7.0  [--dry-run] [--no-push]
 *
 * 1. Refuses to run with a dirty tree, off `main`, or behind origin.
 * 2. Bumps package.json (+ package-lock.json) version.
 * 3. Moves everything under "## [Unreleased]" in CHANGELOG.md to "## [X.Y.Z] - YYYY-MM-DD".
 * 4. Commits "release: vX.Y.Z", tags vX.Y.Z, pushes main + tag (→ .github/workflows/release.yml promotes the
 *    already-built CI image to :latest; TrueNAS cron redeploys prod).
 */
import { execSync } from "node:child_process";
import fs from "node:fs";

const args = process.argv.slice(2);
const dry = args.includes("--dry-run");
const noPush = args.includes("--no-push");
const bump = args.find((a) => !a.startsWith("--"));
if (!bump) {
  console.error("usage: npm run release -- patch|minor|major|X.Y.Z [--dry-run] [--no-push]");
  process.exit(1);
}

const sh = (cmd, opts = {}) => execSync(cmd, { stdio: ["ignore", "pipe", "inherit"], encoding: "utf8", ...opts }).trim();
const run = (cmd) => {
  console.log(`$ ${cmd}`);
  if (!dry) execSync(cmd, { stdio: "inherit" });
};

// --- preflight -------------------------------------------------------------------------------------------------
const branch = sh("git rev-parse --abbrev-ref HEAD");
if (branch !== "main") fail(`Bạn đang ở nhánh "${branch}". Release chỉ chạy từ main.`);
if (sh("git status --porcelain")) fail("Cây làm việc chưa sạch — commit hoặc stash thay đổi trước khi release.");
try {
  sh("git fetch origin main --quiet");
} catch {
  console.warn("! không fetch được origin (offline?) — tiếp tục với trạng thái local");
}
const behind = Number(sh("git rev-list --count HEAD..origin/main") || 0);
if (behind > 0) fail(`main local đang chậm hơn origin/main ${behind} commit. Chạy git pull trước.`);

const pkgPath = "package.json";
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const next = /^\d+\.\d+\.\d+$/.test(bump) ? bump : bumpVersion(pkg.version, bump);
if (sh(`git tag -l v${next}`)) fail(`Tag v${next} đã tồn tại.`);
console.log(`\nRelease ${pkg.version} → ${next}${dry ? "  (dry-run: không ghi file, không commit)" : ""}\n`);

// --- package.json / package-lock.json -----------------------------------------------------------------------
writeJson(pkgPath, { ...pkg, version: next });
if (fs.existsSync("package-lock.json")) {
  const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
  lock.version = next;
  if (lock.packages?.[""]) lock.packages[""].version = next;
  writeJson("package-lock.json", lock);
}

// --- CHANGELOG -------------------------------------------------------------------------------------------------
const clPath = "CHANGELOG.md";
let cl = fs.readFileSync(clPath, "utf8");
const today = new Date().toISOString().slice(0, 10);
const m = cl.match(/## \[Unreleased\]\s*\n([\s\S]*?)(?=\n## \[|\s*$)/);
const notes = (m?.[1] ?? "").trim();
if (!notes) {
  console.warn("! CHANGELOG: mục [Unreleased] trống — tạo mục phiên bản với ghi chú tối thiểu.");
}
const section = `## [${next}] - ${today}\n\n${notes || "### Changed\n- Phát hành lại (không có ghi chú)."}\n`;
cl = m ? cl.replace(m[0], `## [Unreleased]\n\n${section}`) : cl.replace(/\n(## \[)/, `\n## [Unreleased]\n\n${section}\n$1`);
if (!dry) fs.writeFileSync(clPath, cl);
console.log(`CHANGELOG.md: [Unreleased] → [${next}] - ${today} (${notes.split("\n").filter((l) => l.startsWith("- ")).length} dòng)`);

// --- commit, tag, push ---------------------------------------------------------------------------------------
run(`git add package.json package-lock.json CHANGELOG.md`);
run(`git commit -q -m "release: v${next}"`);
run(`git tag -a v${next} -m "LienStore ${next}"`);
if (noPush) {
  console.log(`\nĐã tạo commit + tag v${next}. Push bằng:  git push origin main && git push origin v${next}`);
} else {
  run("git push origin main");
  run(`git push origin v${next}`);
  console.log(`
Xong. Theo dõi:
  • GitHub Actions → Release (promote image, ~1 phút): https://github.com/anhld-rikkei/shop_ban_hang/actions
  • Prod tự cập nhật qua cron TrueNAS (≤ 5 phút):     curl https://linconnn.io.vn/api/health/   → "version":"${next}"
  • Nếu cần quay lại bản cũ: sudo sh /mnt/apps-pool/lienstore-prod/truenas-rollback.sh lienstore-prod ghcr.io/anhld-rikkei/lienstore ${pkg.version}
`);
}

function bumpVersion(v, kind) {
  const [a, b, c] = v.split(".").map(Number);
  if (kind === "major") return `${a + 1}.0.0`;
  if (kind === "minor") return `${a}.${b + 1}.0`;
  if (kind === "patch") return `${a}.${b}.${c + 1}`;
  fail(`Không hiểu "${kind}" — dùng patch|minor|major hoặc X.Y.Z`);
}
function writeJson(p, obj) {
  if (dry) return;
  fs.writeFileSync(p, `${JSON.stringify(obj, null, 2)}\n`);
}
function fail(msg) {
  console.error(`✖ ${msg}`);
  process.exit(1);
}
