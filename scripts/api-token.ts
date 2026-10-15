/**
 * Issue / list / revoke Admin API v1 tokens straight in a LOCAL database (dev machine, or a shell on the server that
 * holds the DB file). In production prefer the admin page /admin/api-tokens/ (owner/admin login).
 *
 *   npm run api-token -- create --name "T3 Code agent" --scopes products:read,products:write,media:write \
 *        [--owner owner] [--days 90] [--write-env .env.lienstore.local]
 *   npm run api-token -- list
 *   npm run api-token -- revoke <id>
 *
 * The database is LIEN_DB_PATH (default data/lienstore.db). With --write-env the raw token is written into that file
 * (LIENSTORE_API_TOKEN=…, mode 600) and NOT printed, so it never lands in a terminal log or chat transcript.
 */
import fs from "node:fs";
import path from "node:path";
import { expiryFromDays, sanitizeScopes } from "../src/lib/api-token-format";
import { createApiToken, findTokenOwner, listApiTokens, revokeApiToken } from "../src/lib/api-tokens";
import { DB_PATH } from "../src/lib/sqlite";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

function fail(msg: string): never {
  console.error(`api-token: ${msg}`);
  process.exit(1);
}

/** Set KEY=value in a dotenv file, keeping the other lines. */
function upsertEnv(file: string, key: string, value: string): void {
  const lines = fs.existsSync(file) ? fs.readFileSync(file, "utf8").split(/\r?\n/) : [];
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  const i = lines.findIndex((l) => l.startsWith(`${key}=`));
  if (i >= 0) lines[i] = `${key}=${value}`;
  else lines.push(`${key}=${value}`);
  fs.writeFileSync(file, `${lines.join("\n")}\n`, { mode: 0o600 });
  fs.chmodSync(file, 0o600);
}

async function main() {
  const cmd = process.argv[2];
  console.error(`[api-token] database: ${DB_PATH}`);
  if (cmd === "create") {
    const name = arg("name") ?? fail("thiếu --name");
    const scopes = sanitizeScopes((arg("scopes") ?? "products:read").split(","));
    if (!scopes.length) fail("--scopes: products:read,products:write,media:write");
    const login = arg("owner") ?? "owner";
    const owner = await findTokenOwner(login);
    if (!owner) fail(`không thấy tài khoản quản trị đang hoạt động "${login}" (--owner <ID đăng nhập | email>)`);
    const days = arg("days") === undefined ? 90 : Number(arg("days"));
    const { token, info } = await createApiToken({ name, scopes, ownerId: owner.id, createdBy: `cli:${process.env.USER ?? "local"}`, expiresAt: expiryFromDays(days) });
    const envFile = arg("write-env");
    const out = { id: info.id, name: info.name, prefix: info.prefix, scopes: info.scopes, owner: info.ownerLabel, expiresAt: info.expiresAt };
    if (envFile) {
      upsertEnv(path.resolve(envFile), "LIENSTORE_API_TOKEN", token);
      console.log(JSON.stringify({ ...out, writtenTo: path.resolve(envFile) }, null, 2));
    } else {
      console.log(JSON.stringify({ ...out, token, note: "Token chỉ hiện một lần — lưu vào .env.lienstore.local (LIENSTORE_API_TOKEN=…)." }, null, 2));
    }
    return;
  }
  if (cmd === "list") {
    console.log(JSON.stringify(await listApiTokens(), null, 2));
    return;
  }
  if (cmd === "revoke") {
    const id = Number.parseInt(process.argv[3] ?? "", 10);
    if (!Number.isInteger(id)) fail("revoke <id>");
    const ok = await revokeApiToken(id, `cli:${process.env.USER ?? "local"}`);
    console.log(JSON.stringify({ id, revoked: ok }));
    if (!ok) process.exit(1);
    return;
  }
  fail("lệnh: create | list | revoke <id>");
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
