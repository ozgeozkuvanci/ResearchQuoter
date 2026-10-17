import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  transpilePackages: ["@research/application", "@research/citations", "@research/contracts", "@research/db", "@research/storage"]
};

export default nextConfig;
