import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'bookface-images.s3.amazonaws.com' }, // YC logos
      { protocol: 'https', hostname: 'favicon.im' },                        // favicon fallback
    ],
  },
};

export default nextConfig;
