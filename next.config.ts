import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	images: {
		remotePatterns: [
			{ protocol: "https", hostname: "bookface-images.s3.amazonaws.com" }, // YC logos
			{ protocol: "https", hostname: "favicon.im" }, // favicon fallback
			{ protocol: "https", hostname: "www.google.com" }, // Google favicon fallback
			{ protocol: "https", hostname: "lh3.googleusercontent.com" }, // Google OAuth avatars
		],
	},
};

export default nextConfig;
