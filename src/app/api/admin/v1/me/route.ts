import { apiRoute } from "@/lib/api-http";
import { getApiToken } from "@/lib/api-tokens";
import { getDb, getSchemaInfo } from "@/lib/sqlite";
import { siteUrl } from "@/lib/site-url";
import pkg from "../../../../../../package.json";

export const dynamic = "force-dynamic";

/** GET /api/admin/v1/me/ — who am I (token / account, scopes, expiry) and which server answered. */
export const GET = apiRoute({ scope: null }, async ({ principal }) => {
  const token = principal.tokenId ? await getApiToken(principal.tokenId) : null;
  const schema = getSchemaInfo(getDb());
  return {
    data: {
      kind: principal.kind,
      actor: principal.actor,
      user: { id: principal.userId, label: principal.userLabel },
      scopes: principal.scopes,
      token: token ? { id: token.id, name: token.name, prefix: token.prefix, expiresAt: token.expiresAt, createdAt: token.createdAt } : null,
      server: { siteUrl: await siteUrl(), environment: process.env.LIEN_ENV_LABEL || (process.env.NODE_ENV === "production" ? "production" : "development"), schemaVersion: schema.schemaVersion, appVersion: pkg.version },
    },
  };
});
