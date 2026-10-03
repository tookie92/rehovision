#!/usr/bin/env node
/**
 * Push Convex functions to Rehovision self-hosted instance.
 *
 * Prefers local backend http://127.0.0.1:3220 (reliable).
 * Public https://convex-clips.rehovision.com needs cloudflared ingress → :3220.
 *
 * Env (.env.local):
 *   CONVEX_SELF_HOSTED_ADMIN_KEY=<admin key>
 *   CONVEX_SELF_HOSTED_URL=https://convex-clips.rehovision.com  (public / client)
 *   CONVEX_SELF_HOSTED_DEPLOY_URL=http://127.0.0.1:3220       (optional override)
 */
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOCAL_DEFAULT = "http://127.0.0.1:3220";

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

async function probeOk(url) {
  try {
    const res = await fetch(new URL("/version", url), {
      signal: AbortSignal.timeout(4000),
    });
    return res.ok || res.status === 200;
  } catch {
    return false;
  }
}

const fileEnv = loadEnvLocal();
const adminKey =
  process.env.CONVEX_SELF_HOSTED_ADMIN_KEY ??
  fileEnv.CONVEX_SELF_HOSTED_ADMIN_KEY ??
  fileEnv.CONVEX_ADMIN_KEY;

if (!adminKey) {
  console.error(
    "[convex:self-hosted] Missing CONVEX_SELF_HOSTED_ADMIN_KEY.",
  );
  console.error(
    "Generate: cd docker/convex-self-hosted && docker compose -p rehovision-convex exec backend ./generate_admin_key.sh",
  );
  process.exit(1);
}

const candidates = [
  process.env.CONVEX_SELF_HOSTED_DEPLOY_URL,
  fileEnv.CONVEX_SELF_HOSTED_DEPLOY_URL,
  LOCAL_DEFAULT,
  process.env.CONVEX_SELF_HOSTED_URL,
  fileEnv.CONVEX_SELF_HOSTED_URL,
  process.env.NEXT_PUBLIC_CONVEX_URL,
  fileEnv.NEXT_PUBLIC_CONVEX_URL,
].filter(Boolean);

let url = null;
for (const c of candidates) {
  // eslint-disable-next-line no-await-in-loop
  if (await probeOk(c)) {
    url = c;
    break;
  }
  console.warn(`[convex:self-hosted] skip (unreachable): ${c}`);
}

if (!url) {
  console.error(
    "[convex:self-hosted] Aucun backend joignable. Démarre rehovision-convex (:3220).",
  );
  process.exit(1);
}

console.log(`[convex:self-hosted] Deploying functions to ${url} …\n`);

const result = spawnSync(
  "npx",
  ["convex", "deploy", "--typecheck", "disable", "-y"],
  {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      CONVEX_SELF_HOSTED_URL: url,
      CONVEX_SELF_HOSTED_ADMIN_KEY: adminKey,
      CONVEX_DEPLOYMENT: "",
    },
  },
);

process.exit(result.status ?? 1);
