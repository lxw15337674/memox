import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

const withSerwist = withSerwistInit({
    // Note: This is only an example. If you use Pages Router,
    // use something else that works, such as "service-worker/index.ts".
    swSrc: "app/sw.ts",
    swDest: "public/sw.js",
});

const baseConfig: NextConfig = {
    reactStrictMode: true,
    logging: {
        fetches: {
            fullUrl: true,
            hmrRefreshes: true,
        },
    },
    experimental: {
        serverActions: {
            bodySizeLimit: '20mb',
        }
    },
    images: {
        remotePatterns: [
            {
                protocol: 'https' as const,
                hostname: 'gallery233.pages.dev',
                port: '',
                pathname: '/**',
            },
        ],
    },
    rewrites: async () => {
        return [
            {
                source: '/upload',
                destination: 'https://gallery233.pages.dev/upload',
            },
            {
                source: '/ai',
                destination: 'https://bhwa-hk-api.zeabur.app',
            }
        ];
    },
};

// 只在生产环境中启用 Serwist
const nextConfig = process.env.NODE_ENV === 'production'
    ? withSerwist(baseConfig)
    : baseConfig;

export default nextConfig;
