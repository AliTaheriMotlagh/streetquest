import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Allow opening the dev server from a phone via LAN IP or an https tunnel.
  allowedDevOrigins: ["*.trycloudflare.com", "192.168.*.*", "10.*.*.*"],
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
};

export default config;
