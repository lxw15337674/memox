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
    webpack: (config, { isServer }) => {
        if (!isServer) {
            // Don't resolve 'fs' module on the client to prevent this error on build --> Error: Can't resolve 'fs'
            config.resolve.fallback = {
                fs: false,
                child_process: false,
                crypto: false,
                events: false,
                path: false,
                stream: false,
                http: false,
                https: false,
                zlib: false,
                net: false,
                tls: false,
            };
        }
        return config;
    },
})

export default nextConfig;
