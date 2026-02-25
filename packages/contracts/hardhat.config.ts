import path from "path";
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const config: HardhatUserConfig = {
    solidity: {
        version: "0.8.24",
        settings: {
            optimizer: {
                enabled: true,
                runs: 200,
            },
        },
    },
    networks: {
        hardhat: {},
        baseSepolia: {
            url: process.env["BASE_SEPOLIA_RPC_URL"] ?? "",
            accounts:
                process.env["PRIVATE_KEY"] !== undefined
                    ? [process.env["PRIVATE_KEY"]]
                    : [],
            chainId: 84532,
        },
    },
    paths: {
        sources: "./contracts",
        tests: "./test",
        cache: "./cache",
        artifacts: "./artifacts",
    },
};

export default config;
