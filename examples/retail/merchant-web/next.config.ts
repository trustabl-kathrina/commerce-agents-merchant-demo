// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["web-shared"],
  // The container image builds with NEXT_STANDALONE=1 so `next build` emits a
  // self-contained server; local `npm run dev` / `run_demo.py` are unaffected.
  ...(process.env.NEXT_STANDALONE === "1" ? { output: "standalone" as const } : {}),
};

export default nextConfig;
