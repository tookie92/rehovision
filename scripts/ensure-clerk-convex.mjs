#!/usr/bin/env node
/**
 * Garantit le JWT template Clerk « convex » (aud: convex) pour ConvexProviderWithClerk.
 * Self-hosted : `convex env set` est souvent 404 — l’issuer vit dans auth.config.ts.
 *
 * Usage: node scripts/ensure-clerk-convex.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvLocal() {
  const envPath = path.join(root, ".env.local");
  if (!existsSync(envPath)) return {};
  /** @type {Record<string, string>} */
  const out = {};
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const fileEnv = loadEnvLocal();
const secret =
  process.env.CLERK_SECRET_KEY ?? fileEnv.CLERK_SECRET_KEY ?? "";
const fapi = (
  process.env.CLERK_FRONTEND_API_URL ??
  fileEnv.CLERK_FRONTEND_API_URL ??
  process.env.CLERK_JWT_ISSUER_DOMAIN ??
  fileEnv.CLERK_JWT_ISSUER_DOMAIN ??
  ""
).replace(/\/$/, "");

if (!secret) {
  console.error("[ensure-clerk-convex] Missing CLERK_SECRET_KEY");
  process.exit(1);
}
if (!fapi) {
  console.error("[ensure-clerk-convex] Missing CLERK_FRONTEND_API_URL");
  process.exit(1);
}

const CLAIMS = {
  aud: "convex",
  name: "{{user.full_name}}",
  email: "{{user.primary_email_address}}",
  picture: "{{user.image_url}}",
  nickname: "{{user.username}}",
  given_name: "{{user.first_name}}",
  family_name: "{{user.last_name}}",
};

async function main() {
  const listRes = await fetch("https://api.clerk.com/v1/jwt_templates", {
    headers: { Authorization: `Bearer ${secret}` },
  });
  if (!listRes.ok) {
    console.error(
      "[ensure-clerk-convex] list JWT templates failed",
      listRes.status,
      await listRes.text(),
    );
    process.exit(1);
  }
  /** @type {Array<{ id: string; name: string; claims?: Record<string, unknown> }>} */
  const templates = await listRes.json();
  const existing = templates.find((t) => t.name === "convex");

  if (existing) {
    const aud = existing.claims?.aud;
    if (aud === "convex") {
      console.log(
        `[ensure-clerk-convex] OK — JWT template "convex" (id=${existing.id}, aud=convex)`,
      );
    } else {
      const patch = await fetch(
        `https://api.clerk.com/v1/jwt_templates/${existing.id}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${secret}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ claims: CLAIMS }),
        },
      );
      if (!patch.ok) {
        console.error(
          "[ensure-clerk-convex] PATCH failed",
          patch.status,
          await patch.text(),
        );
        process.exit(1);
      }
      console.log(
        `[ensure-clerk-convex] PATCHED claims aud=convex on template ${existing.id}`,
      );
    }
  } else {
    const create = await fetch("https://api.clerk.com/v1/jwt_templates", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "convex",
        claims: CLAIMS,
        lifetime: 3600,
        allowed_clock_skew: 5,
        custom_signing_key: false,
      }),
    });
    if (!create.ok) {
      console.error(
        "[ensure-clerk-convex] CREATE failed",
        create.status,
        await create.text(),
      );
      process.exit(1);
    }
    const body = await create.json();
    console.log(
      `[ensure-clerk-convex] CREATED JWT template "convex" (id=${body.id})`,
    );
  }

  // JWKS reachable?
  const jwks = await fetch(`${fapi}/.well-known/jwks.json`);
  console.log(
    `[ensure-clerk-convex] issuer ${fapi} jwks=${jwks.status} (Convex backend must reach this)`,
  );
  console.log(
    "[ensure-clerk-convex] Next: npm run convex:deploy:self-hosted && restart rehovision-web — then sign out/in",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
