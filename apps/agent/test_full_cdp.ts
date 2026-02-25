/**
 * Test CDP wallet creation with all 3 new credentials.
 * Run with: cd apps/agent && npx ts-node --transpile-only test_full_cdp.ts
 */

import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function testFullCDP() {
    const apiKeyId = process.env["CDP_API_KEY_ID"] ?? "";
    const apiKeySecret = process.env["CDP_API_KEY_SECRET"] ?? "";
    const walletSecret = process.env["CDP_WALLET_SECRET"] ?? "";

    console.log("=== Full CDP v2 Wallet Test ===");
    console.log("apiKeyId:", apiKeyId);
    console.log("apiKeySecret present:", Boolean(apiKeySecret));
    console.log("walletSecret present:", Boolean(walletSecret));
    console.log("walletSecret length:", walletSecret.length);
    console.log("");

    try {
        const { CdpClient } = await import("@coinbase/cdp-sdk");

        const cdp = new CdpClient({ apiKeyId, apiKeySecret, walletSecret });
        console.log("CdpClient created ✅");

        console.log("Creating EVM account on base-sepolia...");
        const account = await cdp.evm.createAccount({
            networkId: "base-sepolia",
        });
        console.log("✅ SUCCESS! Account address:", account.address);
        console.log("Account name:", account.name);

    } catch (err: any) {
        console.error("❌ FAILED");
        console.error("Name:", err?.name);
        console.error("Message:", err?.message ?? String(err));
        const resp = err?.response ?? err?.cause?.response;
        if (resp) {
            console.error("HTTP Status:", resp.status);
            console.error("Response body:", JSON.stringify(resp.data ?? await resp.text?.() ?? "none"));
        }
        console.error("Full error keys:", Object.getOwnPropertyNames(err));
        for (const key of Object.getOwnPropertyNames(err)) {
            if (key !== "stack" && key !== "message") {
                console.error(`  ${key}:`, JSON.stringify((err as any)[key]));
            }
        }
    }
}

testFullCDP().catch(console.error);
