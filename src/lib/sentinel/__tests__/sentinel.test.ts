import { describe, it, expect } from "vitest";
import { sentinel } from "../index";

describe("Sentinel — Pre-transaction Security", () => {
    describe("analyzeTransaction", () => {
        it("flags known malicious destination", async () => {
            const result = await sentinel.analyzeTransaction({
                from: "0xabc",
                to: "0xd90e2f925DA726b50C4Ed8D0Fb90Ad053324F31b", // Tornado Cash
            });

            expect(result.riskLevel).not.toBe("safe");
            expect(result.threats.length).toBeGreaterThan(0);
            expect(result.threats.some((t) => t.type === "rug_pull")).toBe(true);
        });

        it("detects flash loan calls", async () => {
            const result = await sentinel.analyzeTransaction({
                from: "0xabc",
                to: "0x7d2768de32b0b80b7a3454c06bdac94a69ddc7a9",
                data: "0xab9c4b5d000000000000000000000000", // Aave flashLoan selector
            });

            expect(result.threats.some((t) => t.type === "flash_loan")).toBe(true);
        });

        it("detects unlimited token approval", async () => {
            const result = await sentinel.analyzeTransaction({
                from: "0xabc",
                to: "0xdead",
                data: "0x095ea7b3000000000000000000000000deadbeef" + "f".repeat(40),
            });

            expect(result.threats.some((t) => t.description.includes("Unlimited token approval"))).toBe(true);
        });

        it("detects DEX swap sandwich vulnerability", async () => {
            const result = await sentinel.analyzeTransaction({
                from: "0xabc",
                to: "0x7a250d5630b4cf539739df2c5dacb4c659f2488d",
                data: "0x38ed1739000000000000000000000000",
                value: "5000000000000000000",
            });

            expect(result.threats.some((t) => t.type === "sandwich")).toBe(true);
        });

        it("returns safe for simple ETH transfer", async () => {
            const result = await sentinel.analyzeTransaction({
                from: "0x1111111111111111111111111111111111111111",
                to: "0x2222222222222222222222222222222222222222",
                value: "1000000000000000", // 0.001 ETH
            });

            expect(result.riskLevel).toBe("safe");
            expect(result.threats).toHaveLength(0);
        });

        it("flags high-value transfers", async () => {
            const result = await sentinel.analyzeTransaction({
                from: "0xabc",
                to: "0xdef",
                value: "200000000000000000000", // 200 ETH
            });

            expect(result.threats.some((t) => t.description.includes("high value"))).toBe(true);
        });

        it("includes gas analysis", async () => {
            const result = await sentinel.analyzeTransaction({
                from: "0xabc",
                to: "0xdef",
            });

            expect(result.gasAnalysis).toBeDefined();
            expect(result.gasAnalysis.estimatedGas).toBeGreaterThanOrEqual(21000);
        });
    });

    describe("analyzeContract", () => {
        it("recognizes known verified contracts", async () => {
            const result = await sentinel.analyzeContract({
                address: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", // Uniswap V2 Router
            });

            expect(result.verified).toBe(true);
            expect(result.metadata.name).toBe("Uniswap V2 Router");
            expect(result.riskLevel).toBe("safe");
        });

        it("flags unknown contracts", async () => {
            const result = await sentinel.analyzeContract({
                address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            });

            expect(result.vulnerabilities.length).toBeGreaterThan(0);
            expect(result.riskScore).toBeGreaterThan(0);
        });

        it("flags known malicious contracts", async () => {
            const result = await sentinel.analyzeContract({
                address: "0xd90e2f925DA726b50C4Ed8D0Fb90Ad053324F31b",
            });

            expect(result.riskLevel).toBe("critical");
            expect(result.vulnerabilities.some((v) => v.type === "rug_pull")).toBe(true);
        });

        it("identifies proxy contracts", async () => {
            const result = await sentinel.analyzeContract({
                address: "0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2", // Aave V3
            });

            expect(result.metadata.proxy).toBe(true);
            expect(result.vulnerabilities.some((v) => v.description.includes("proxy"))).toBe(true);
        });
    });

    describe("analyzeMev", () => {
        it("returns recommendation for Ethereum", async () => {
            const result = await sentinel.analyzeMev({ txHash: "0xabc", chain: "ethereum" });
            expect(result.recommendation).toContain("Flashbots");
        });

        it("returns recommendation for Solana", async () => {
            const result = await sentinel.analyzeMev({ txHash: "abc", chain: "solana" });
            expect(result.recommendation).toContain("Jito");
        });
    });
});
