/**
 * Dump all variant groups: name, labels, level-1 values, member count.
 * Flags groups whose cấp-1 looks like obscure brand codes (not product type).
 */
import puppeteer from "puppeteer";
import fs from "fs";

const BASE = "https://linconnn.io.vn";
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = "/tmp/variant-groups-audit.json";

/** Product-type words customers understand (Vietnamese / common JP loanwords). */
const PRODUCT_TYPE_RE =
  /(sữa|bột|kem|kẹo|chocolate|socola|son|mặt nạ|mask|serum|lotion|toner|gel|dầu|xà phòng|bàn chải|viên|collagen|whey|protein|thanh|lon|nước|trà|cà phê|snack|bánh|gội|xả|tắm|chống nắng|uv|tẩy|rửa|dưỡng|thuốc|miếng|sheet|bỉm|tã|bình|khẩu|thẻ|card)/i;

async function login(page) {
  const creds = fs.readFileSync(new URL("../agent-credentials.txt", import.meta.url), "utf8");
  const m = creds.match(/\[Admin - Linconnn\][\s\S]*?User: (.*?)\nPass: (.*?)\n/);
  await page.goto(`${BASE}/admin/products/`, { waitUntil: "networkidle2" });
  if (page.url().includes("login")) {
    await page.type("input[name=user]", m[1].trim());
    await page.type("input[name=password]", m[2].trim());
    await Promise.all([page.click("button[type=submit]"), page.waitForNavigation({ waitUntil: "networkidle2" })]);
  }
}

const browser = await puppeteer.launch({
  headless: "new",
  userDataDir: "/tmp/puppeteer-vg-audit",
  args: ["--no-sandbox"],
});
const page = await browser.newPage();
page.setDefaultTimeout(60000);
await login(page);

await page.goto(`${BASE}/admin/products/groups/`, { waitUntil: "networkidle2" });
const ids = await page.evaluate(() =>
  [
    ...new Set(
      [...document.querySelectorAll('a[href*="/admin/products/groups/"]')]
        .map((a) => a.getAttribute("href")?.match(/\/groups\/(\d+)/)?.[1])
        .filter(Boolean),
    ),
  ].map(Number),
);
console.log("groups", ids.length, ids.slice(0, 20));

const report = [];
for (const gid of ids) {
  await page.goto(`${BASE}/admin/products/groups/${gid}/`, { waitUntil: "networkidle2" });
  const info = await page.evaluate(() => {
    const byId = {};
    for (const el of document.querySelectorAll('input[name^="attr_"]')) {
      const m = el.name.match(/^attr_(\d+)_(\d+)$/);
      if (!m) continue;
      (byId[m[1]] ||= [])[Number(m[2])] = el.value;
    }
    const members = Object.keys(byId);
    const level1 = [...new Set(members.map((id) => byId[id]?.[0] || "").filter(Boolean))];
    return {
      name: document.querySelector('input[name="name"], #name')?.value || "",
      code: document.querySelector('input[name="code"], #code')?.value || "",
      labels: [...document.querySelectorAll('input[name="attrLabels"]')].map((i) => i.value),
      memberCount: members.length,
      level1,
      byId,
    };
  });
  const obscure = info.level1.filter((v) => v && !PRODUCT_TYPE_RE.test(v));
  const row = { gid, ...info, obscureLevel1: obscure, needsFix: obscure.length > 0 && info.memberCount > 0 };
  report.push(row);
  console.log(
    `#${gid}`,
    info.name,
    `| n=${info.memberCount}`,
    `| L1=${JSON.stringify(info.level1)}`,
    row.needsFix ? "⚠ FIX" : "ok",
  );
  await SLEEP(150);
}

fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
const fixes = report.filter((r) => r.needsFix);
console.log("\nNEED FIX", fixes.length);
for (const r of fixes) console.log(`  #${r.gid} ${r.name}: ${JSON.stringify(r.obscureLevel1)}`);
console.log("DONE", OUT);
await browser.close();
