import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    webpack: (config) => {
        // Stub out React Native module that @metamask/sdk tries to import in browser
        config.resolve.alias["@react-native-async-storage/async-storage"] =
            path.resolve(__dirname, "lib/empty-module.js");
        return config;
    },
};

export default nextConfig;
