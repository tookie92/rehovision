import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Évite que Turbopack prenne C:\Users\asus\package-lock.json comme root
  // (sinon /dashboard peut rester en AuthLoading / skeleton sans fin).
  turbopack: {
    root: rootDir,
  },
};

export default nextConfig;
