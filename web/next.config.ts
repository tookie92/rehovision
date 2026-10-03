import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Le dossier convex/ est à la racine du monorepo
  outputFileTracingRoot: path.join(__dirname, ".."),
  turbopack: {
    root: path.join(__dirname, ".."),
  },
};

export default nextConfig;
