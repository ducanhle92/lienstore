/**
 * Fill member attrs on an existing group (labels already set).
 * Usage: node tools/fix-group-attrs.mjs <gid> <jobs.json>
 * jobs.json: [{ "id": 123, "attrs": ["A","B","C"] }, ...]
 * Optional 3rd arg: group name to set.
 */
import puppeteer from "puppeteer";
import fs from "fs";

const BASE = "https://linconnn.io.vn";
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));
const gid = Number(process.argv[2]);
const jobs = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
const groupName = process.argv[4] || null;
if (!gid || !Array.isArray(jobs)) {
  console.error("usage: node tools/fix-group-attrs.mjs <gid> <jobs.json> [groupName]");
  process.exit(1);
}

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

async function setVal(page, sel, val) {
  return page.evaluate(
    (sel, val) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      let proto = Object.getPrototypeOf(el);
      while (proto && !Object.getOwnPropertyDescriptor(proto, "value")) proto = Object.getPrototypeOf(proto);
      Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, val);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    },
    sel,
    String(val ?? ""),
  );
}

const browser = await puppeteer.launch({
  headless: "new",
  userDataDir: `/tmp/puppeteer-fix-group-${gid}`,
  args: ["--no-sandbox"],
});
const page = await browser.newPage();
page.setDefaultTimeout(60000);
await login(page);

await page.goto(`${BASE}/admin/products/groups/${gid}/`, { waitUntil: "networkidle2" });
if (groupName) {
  await setVal(page, 'input[name="name"], #name', groupName);
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => /Lưu nhóm/i.test(b.innerText))?.click();
  });
  await SLEEP(2000);
  await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => null);
  await page.goto(`${BASE}/admin/products/groups/${gid}/`, { waitUntil: "networkidle2" });
}

const fill = await page.evaluate((jobs) => {
  const results = [];
  for (const job of jobs) {
    for (let i = 0; i < 4; i++) {
      const el = document.querySelector(`input[name="attr_${job.id}_${i}"]`);
      if (!el) {
        results.push({ id: job.id, i, ok: false });
        continue;
      }
      const val = i < job.attrs.length ? job.attrs[i] : "";
      let proto = Object.getPrototypeOf(el);
      while (proto && !Object.getOwnPropertyDescriptor(proto, "value")) proto = Object.getPrototypeOf(proto);
      Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, val);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      results.push({ id: job.id, i, ok: true, val });
    }
  }
  return results;
}, jobs);
console.log(
  "filled",
  fill.filter((r) => r.ok).length,
  "miss",
  fill.filter((r) => !r.ok).length,
);

await page.evaluate(() => {
  (
    document.querySelector('button[form="bulk-variants"]') ||
    [...document.querySelectorAll("button")].find((b) => /Lưu tất cả/i.test(b.innerText))
  )?.click();
});
await SLEEP(4000);
await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => null);

await page.goto(`${BASE}/admin/products/groups/${gid}/`, { waitUntil: "networkidle2" });
const final = await page.evaluate(() => {
  const byId = {};
  for (const el of document.querySelectorAll('input[name^="attr_"]')) {
    const m = el.name.match(/^attr_(\d+)_(\d+)$/);
    if (!m) continue;
    (byId[m[1]] ||= [])[Number(m[2])] = el.value;
  }
  return {
    labels: [...document.querySelectorAll('input[name="attrLabels"]')].map((i) => i.value),
    byId,
    tree: document.body.innerText.match(/Cây phân nhánh[\s\S]{0,2000}/)?.[0]?.slice(0, 2000),
  };
});
console.log("TREE\n", final.tree);
console.log(JSON.stringify(final.byId, null, 2));
fs.writeFileSync(`/tmp/fix-group-${gid}.json`, JSON.stringify(final, null, 2));
await browser.close();
