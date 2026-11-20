import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export", // static site: no server needed
  images: { unoptimized: true }, // required for static export
  trailingSlash: true,
};

export default nextConfig;
