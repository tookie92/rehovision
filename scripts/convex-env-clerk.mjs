#!/usr/bin/env node
/**
 * Pousse CLERK_FRONTEND_API_URL sur le déploiement Convex self-hosted.
 * (Le backend Convex ne lit PAS .env.local Next.)
 *
 * Doc : https://clerk.com/docs/guides/development/integrations/databases/convex
 */
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvLocal() {
  const envPath = path.join(root, ".env.local");
  if (!existsSync(envPath)) return {};
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
    const comment = value.indexOf(" #");
    if (comment !== -1) value = value.slice(0, comment).trim();
    out[key] = value;
  }
  return out;
}

const fileEnv = loadEnvLocal();
const url =
  process.env.CONVEX_SELF_HOSTED_URL ??
  fileEnv.CONVEX_SELF_HOSTED_URL ??
  fileEnv.NEXT_PUBLIC_CONVEX_URL;
const adminKey =
  process.env.CONVEX_SELF_HOSTED_ADMIN_KEY ??
  fileEnv.CONVEX_SELF_HOSTED_ADMIN_KEY;
const clerkFapi =
  process.env.CLERK_FRONTEND_API_URL ??
  fileEnv.CLERK_FRONTEND_API_URL ??
  process.env.CLERK_JWT_ISSUER_DOMAIN ??
  fileEnv.CLERK_JWT_ISSUER_DOMAIN;

if (!url || !adminKey) {
  console.error(
    "[convex:env:clerk] Missing CONVEX_SELF_HOSTED_URL and/or CONVEX_SELF_HOSTED_ADMIN_KEY",
  );
  process.exit(1);
}
if (!clerkFapi) {
  console.error(
    "[convex:env:clerk] Missing CLERK_FRONTEND_API_URL (ou CLERK_JWT_ISSUER_DOMAIN) in .env.local",
  );
  process.exit(1);
}

let host = clerkFapi;
try {
  host = new URL(clerkFapi).host;
} catch {
  /* keep raw */
}

console.log(
  `[convex:env:clerk] Setting CLERK_FRONTEND_API_URL on ${url} (host=${host})…`,
);

const env = {
  ...process.env,
  CONVEX_SELF_HOSTED_URL: url,
  CONVEX_SELF_HOSTED_ADMIN_KEY: adminKey,
  CONVEX_DEPLOYMENT: "",
};

const setFrontend = spawnSync(
  "npx",
  ["convex", "env", "set", "CLERK_FRONTEND_API_URL", clerkFapi],
  { cwd: root, stdio: "inherit", shell: true, env },
);

if (setFrontend.status !== 0) {
  console.warn(
    "[convex:env:clerk] `convex env set` a échoué (souvent 404 sur self-hosted).",
  );
  console.warn(
    "[convex:env:clerk] auth.config.ts a un fallback issuer — déploie quand même :",
  );
  console.warn("  npm run convex:deploy:self-hosted");
  console.warn(
    "Sinon : Dashboard Convex self-hosted → Environment Variables → CLERK_FRONTEND_API_URL",
  );
  process.exit(0);
}

// Alias legacy
spawnSync(
  "npx",
  ["convex", "env", "set", "CLERK_JWT_ISSUER_DOMAIN", clerkFapi],
  { cwd: root, stdio: "inherit", shell: true, env },
);

console.log("[convex:env:clerk] OK — redéploie : npm run convex:deploy:self-hosted");
