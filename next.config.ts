import type { NextConfig } from "next";
const config: NextConfig = {
  transpilePackages: ["three"],
  serverExternalPackages: ["ioredis"],
  devIndicators: false,
};
export default config;
