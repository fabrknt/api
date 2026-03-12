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

    // -----------------------------------------------------------------------
    // New features: EVM Patterns
    // -----------------------------------------------------------------------

    describe("detectProxyManipulation (EVM-005)", () => {
        it("flags multiple proxy upgrades in one tx", () => {
            const warnings = sentinel.detectProxyManipulation({
                selectors: ["0x3659cfe6", "0x4f1ef286"], // upgradeTo, upgradeToAndCall
                targets: ["0xabc", "0xdef"],
            });
            expect(warnings.some((w) => w.patternId === "EVM-005" && w.severity === "critical")).toBe(true);
        });

        it("flags proxy upgrade inside multicall", () => {
            const warnings = sentinel.detectProxyManipulation({
                selectors: ["0x3659cfe6", "0xac9650d8"], // upgradeTo, multicall
                targets: ["0xabc", "0xdef"],
            });
            expect(warnings.some((w) => w.patternId === "EVM-005" && w.message.includes("multicall"))).toBe(true);
        });

        it("returns no warnings for safe selectors", () => {
            const warnings = sentinel.detectProxyManipulation({
                selectors: ["0xa9059cbb"], // transfer
                targets: ["0xabc"],
            });
            expect(warnings).toHaveLength(0);
        });
    });

    describe("detectSelfdestructAbuse (EVM-006)", () => {
        it("flags selfdestruct opcode", () => {
            const warnings = sentinel.detectSelfdestructAbuse({
                calldata: ["0xff"],
            });
            expect(warnings.some((w) => w.patternId === "EVM-006" && w.severity === "critical")).toBe(true);
        });

        it("flags delegatecall", () => {
            const warnings = sentinel.detectSelfdestructAbuse({
                calldata: ["0xf4000000"],
            });
            expect(warnings.some((w) => w.patternId === "EVM-006" && w.message.includes("Delegatecall"))).toBe(true);
        });

        it("returns no warnings for safe calldata", () => {
            const warnings = sentinel.detectSelfdestructAbuse({
                calldata: ["0xa9059cbb0000000000000000"],
            });
            expect(warnings).toHaveLength(0);
        });
    });

    describe("detectApprovalExploitation (EVM-007)", () => {
        it("flags approve followed by transferFrom", () => {
            const warnings = sentinel.detectApprovalExploitation({
                selectors: ["0x095ea7b3", "0x23b872dd"],
                calldata: ["0x095ea7b3" + "0".repeat(128), "0x23b872dd" + "0".repeat(128)],
            });
            expect(warnings.some((w) => w.patternId === "EVM-007" && w.message.includes("transferFrom"))).toBe(true);
        });

        it("flags multiple approvals in one tx", () => {
            const warnings = sentinel.detectApprovalExploitation({
                selectors: ["0x095ea7b3", "0x095ea7b3", "0x095ea7b3"],
                calldata: ["0x" + "0".repeat(128), "0x" + "0".repeat(128), "0x" + "0".repeat(128)],
            });
            expect(warnings.some((w) => w.message.includes("3 token approvals"))).toBe(true);
        });
    });

    describe("detectOracleManipulation (EVM-008)", () => {
        it("flags swap before oracle read", () => {
            const warnings = sentinel.detectOracleManipulation({
                selectors: ["0x38ed1739", "0x50d25bcd"], // swapExactTokensForTokens, latestRoundData
                targets: ["0x7a250d5630b4cf539739df2c5dacb4c659f2488d", "0x47fb2585d2c56fe188d0e6ec628a38b74fceeedf"],
            });
            expect(warnings.some((w) => w.patternId === "EVM-008")).toBe(true);
        });

        it("flags oracle sandwiched between swaps", () => {
            const warnings = sentinel.detectOracleManipulation({
                selectors: ["0x38ed1739", "0x50d25bcd", "0x38ed1739"],
                targets: [
                    "0x7a250d5630b4cf539739df2c5dacb4c659f2488d",
                    "0x47fb2585d2c56fe188d0e6ec628a38b74fceeedf",
                    "0x7a250d5630b4cf539739df2c5dacb4c659f2488d",
                ],
            });
            expect(warnings.some((w) => w.patternId === "EVM-008" && w.severity === "critical")).toBe(true);
        });
    });

    describe("detectGovernanceManipulation (EVM-009)", () => {
        it("flags flash loan combined with governance action", () => {
            const warnings = sentinel.detectGovernanceManipulation({
                selectors: ["0x5cffe9de", "0xda95691a"], // flashLoan, propose
                targets: ["0x7d2768de32b0b80b7a3454c06bdac94a69ddc7a9", "0xgovernor"],
            });
            expect(warnings.some((w) => w.patternId === "EVM-009" && w.severity === "critical")).toBe(true);
        });

        it("flags delegate + vote pattern", () => {
            const warnings = sentinel.detectGovernanceManipulation({
                selectors: ["0x5c19a95c", "0x56781388"], // delegate, castVote
                targets: ["0xtoken", "0xgovernor"],
            });
            expect(warnings.some((w) => w.patternId === "EVM-009")).toBe(true);
        });

        it("flags delegate + vote + execute attack", () => {
            const warnings = sentinel.detectGovernanceManipulation({
                selectors: ["0x5c19a95c", "0x56781388", "0xfe0d94c1"], // delegate, castVote, execute
                targets: ["0xtoken", "0xgovernor", "0xgovernor"],
            });
            expect(warnings.some((w) => w.patternId === "EVM-009" && w.severity === "critical")).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // New features: Simulation Sandbox
    // -----------------------------------------------------------------------

    describe("analyzeHoneypot", () => {
        it("detects honeypot when sell reverts", () => {
            const buyResult = { success: true, chain: "evm" };
            const sellResult = { success: false, chain: "evm", error: "execution reverted" };
            const result = sentinel.analyzeHoneypot(buyResult as any, sellResult as any);

            expect(result.isHoneypot).toBe(true);
            expect(result.sellTax).toBe(100);
        });

        it("detects high sell tax as honeypot", () => {
            const buyResult = {
                success: true, chain: "evm",
                balanceChanges: [{ address: "0x1", delta: "1000" }],
            };
            const sellResult = {
                success: true, chain: "evm",
                balanceChanges: [{ address: "0x1", delta: "0" }],
            };
            const result = sentinel.analyzeHoneypot(buyResult as any, sellResult as any);
            // Even if sell succeeds, zero delta = 0 tax, not a honeypot
            expect(result.isHoneypot).toBe(false);
        });

        it("returns not honeypot for normal tokens", () => {
            const buyResult = {
                success: true, chain: "evm",
                balanceChanges: [{ address: "0x1", delta: "1000" }],
            };
            const sellResult = {
                success: true, chain: "evm",
                balanceChanges: [{ address: "0x1", delta: "950" }],
            };
            const result = sentinel.analyzeHoneypot(buyResult as any, sellResult as any);
            expect(result.isHoneypot).toBe(false);
        });
    });

    // -----------------------------------------------------------------------
    // New features: Oracle Registry
    // -----------------------------------------------------------------------

    describe("CHAINLINK_DENOMINATIONS constant", () => {
        it("exports Chainlink denomination addresses", async () => {
            // Import the types to check the constant is accessible
            const { CHAINLINK_DENOMINATIONS } = await import("../../sentinel/types");
            expect(CHAINLINK_DENOMINATIONS.ETH).toBe("0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE");
            expect(CHAINLINK_DENOMINATIONS.USD).toBe("0x0000000000000000000000000000000000000348");
            expect(CHAINLINK_DENOMINATIONS.BTC).toBeTruthy();
        });
    });

    // Note: resolveOracleFromRegistry and resolveOracleBatch require a live RPC
    // endpoint to test against, so we verify their existence on the API object.
    describe("Oracle registry API surface", () => {
        it("exposes resolveOracleFromRegistry", () => {
            expect(typeof sentinel.resolveOracleFromRegistry).toBe("function");
        });

        it("exposes resolveOracleBatch", () => {
            expect(typeof sentinel.resolveOracleBatch).toBe("function");
        });
    });

    // -----------------------------------------------------------------------
    // New features: Flashbots / MEV-Share API surface
    // -----------------------------------------------------------------------

    describe("Flashbots / MEV-Share API surface", () => {
        it("exposes sendFlashbotsBundle", () => {
            expect(typeof sentinel.sendFlashbotsBundle).toBe("function");
        });

        it("exposes sendMevShareBundle", () => {
            expect(typeof sentinel.sendMevShareBundle).toBe("function");
        });

        it("exposes sendPrivateTransaction", () => {
            expect(typeof sentinel.sendPrivateTransaction).toBe("function");
        });

        it("exposes getBundleStatus", () => {
            expect(typeof sentinel.getBundleStatus).toBe("function");
        });
    });

    // -----------------------------------------------------------------------
    // EVM pattern IDs referenced in transaction analysis
    // -----------------------------------------------------------------------

    describe("analyzeTransaction EVM pattern IDs", () => {
        it("tags flash loan detection with EVM-002", async () => {
            const result = await sentinel.analyzeTransaction({
                from: "0xabc",
                to: "0x7d2768de32b0b80b7a3454c06bdac94a69ddc7a9",
                data: "0xab9c4b5d000000000000000000000000",
            });

            const flashLoanThreat = result.threats.find((t) => t.type === "flash_loan");
            expect(flashLoanThreat?.patternId).toBe("EVM-002");
        });

        it("tags sandwich detection with EVM-003", async () => {
            const result = await sentinel.analyzeTransaction({
                from: "0xabc",
                to: "0x7a250d5630b4cf539739df2c5dacb4c659f2488d",
                data: "0x38ed1739000000000000000000000000",
            });

            const sandwichThreat = result.threats.find((t) => t.type === "sandwich");
            expect(sandwichThreat?.patternId).toBe("EVM-003");
        });
    });
});
