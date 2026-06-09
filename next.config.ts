import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow loading the dev server from other devices on the LAN (e.g. testing
  // on your phone at http://192.168.x.x:3000). Next 16 blocks cross-origin
  // dev requests by default, which breaks HMR and hydration over the LAN.
  allowedDevOrigins: ["192.168.1.108", "192.168.1.*"],
};

export default nextConfig;
