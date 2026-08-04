import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev/test harness in this environment loads the app via 127.0.0.1
  // rather than localhost; Next.js's dev-resource origin check treats
  // those as distinct hosts unless allow-listed here.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
