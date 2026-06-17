/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@bm/contratos", "@bm/tipos"],
};

export default nextConfig;
