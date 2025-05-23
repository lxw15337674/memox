import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
    // Note: This is only an example. If you use Pages Router,
    // use something else that works, such as "service-worker/index.ts".
    swSrc: "app/sw.ts",
    swDest: "public/sw.js",
});

const nextConfig = withSerwist({
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
                protocol: 'https',
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
})

export default nextConfig;
