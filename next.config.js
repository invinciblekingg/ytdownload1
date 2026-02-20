/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "img.youtube.com" },
      { protocol: "https", hostname: "i.ytimg.com" },
    ],
  },
  // Next.js 14: use experimental.serverComponentsExternalPackages
  // (serverExternalPackages was renamed/promoted in Next.js 15)
  experimental: {
    serverComponentsExternalPackages: ["@distube/ytdl-core", "openai"],
  },
};

module.exports = nextConfig;
