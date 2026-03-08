import { describe, it, expect } from "vitest";
import { tensor } from "../index";

describe("Tensor — Portfolio Margin Engine", () => {
    describe("computeGreeks", () => {
        it("computes greeks for a call option", async () => {
            const result = await tensor.computeGreeks({
                asset: "ETH",
                spot: 2000,
                strike: 2100,
                expiry: Math.floor(Date.now() / 1000) + 30 * 24 * 3600, // 30 days out
                optionType: "call",
            });

            expect(result.asset).toBe("ETH");
            expect(result.greeks.delta).toBeGreaterThan(0);
            expect(result.greeks.delta).toBeLessThan(1);
            expect(result.greeks.gamma).toBeGreaterThan(0);
            expect(result.greeks.theta).toBeLessThan(0); // time decay is negative
            expect(result.greeks.vega).toBeGreaterThan(0);
            expect(result.theoreticalPrice).toBeGreaterThan(0);
            expect(result.timeToExpiry).toBeGreaterThan(0);
        });

        it("computes greeks for a put option", async () => {
            const result = await tensor.computeGreeks({
                asset: "ETH",
                spot: 2000,
                strike: 1900,
                expiry: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
                optionType: "put",
            });

            expect(result.greeks.delta).toBeLessThan(0);
            expect(result.greeks.delta).toBeGreaterThan(-1);
            expect(result.greeks.gamma).toBeGreaterThan(0);
            expect(result.greeks.theta).toBeLessThan(0);
        });

        it("returns intrinsic value for expired options", async () => {
            const result = await tensor.computeGreeks({
                asset: "ETH",
                spot: 2000,
                strike: 1900,
                expiry: Math.floor(Date.now() / 1000) - 3600, // expired 1h ago
                optionType: "call",
            });

            expect(result.theoreticalPrice).toBe(100); // intrinsic = 2000 - 1900
            expect(result.greeks.gamma).toBe(0);
            expect(result.greeks.vega).toBe(0);
        });

        it("returns zero for expired OTM options", async () => {
            const result = await tensor.computeGreeks({
                asset: "ETH",
                spot: 2000,
                strike: 2100,
                expiry: Math.floor(Date.now() / 1000) - 3600,
                optionType: "call",
            });

            expect(result.theoreticalPrice).toBe(0);
        });

        it("accepts custom IV", async () => {
            const lowVol = await tensor.computeGreeks({
                asset: "ETH", spot: 2000, strike: 2000,
                expiry: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
                optionType: "call", iv: 0.3,
            });
            const highVol = await tensor.computeGreeks({
                asset: "ETH", spot: 2000, strike: 2000,
                expiry: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
                optionType: "call", iv: 1.5,
            });

            expect(highVol.theoreticalPrice).toBeGreaterThan(lowVol.theoreticalPrice);
            expect(highVol.greeks.vega).toBeGreaterThan(0);
            expect(lowVol.greeks.vega).toBeGreaterThan(0);
        });
    });

    describe("calculateMargin", () => {
        it("calculates isolated margin for a single perp", async () => {
            const result = await tensor.calculateMargin({
                positions: [{
                    id: "p1", type: "perp", asset: "ETH",
                    size: 10, entryPrice: 1900, markPrice: 2000,
                }],
            });

            expect(result.initialMargin).toBe(2000); // 10 * 2000 * 0.10
            expect(result.portfolioMargin).toBeGreaterThan(0);
            expect(result.netDelta).toBe(10);
        });

        it("achieves margin savings with delta-netting", async () => {
            const result = await tensor.calculateMargin({
                positions: [
                    { id: "p1", type: "perp", asset: "ETH", size: 10, entryPrice: 1900, markPrice: 2000 },
                    { id: "p2", type: "perp", asset: "ETH", size: -8, entryPrice: 2050, markPrice: 2000 },
                ],
            });

            expect(result.marginSaved).toBeGreaterThan(0);
            expect(result.marginSavedPct).toBeGreaterThan(50);
            expect(result.portfolioMargin).toBeLessThan(result.initialMargin);
            expect(result.netDelta).toBe(2);
        });

        it("handles mixed position types", async () => {
            const result = await tensor.calculateMargin({
                positions: [
                    { id: "p1", type: "perp", asset: "ETH", size: 5, entryPrice: 2000, markPrice: 2000 },
                    { id: "p2", type: "spot", asset: "ETH", size: 3, entryPrice: 2000, markPrice: 2000 },
                ],
            });

            expect(result.positions).toHaveLength(2);
            expect(result.netDelta).toBe(8);
        });
    });

    describe("solveIntent", () => {
        it("sorts orders by urgency and type", async () => {
            const result = await tensor.solveIntent({
                orders: [
                    { id: "o1", type: "option", asset: "ETH", side: "buy", size: 1, urgency: "low" },
                    { id: "o2", type: "spot", asset: "ETH", side: "buy", size: 5, urgency: "high" },
                    { id: "o3", type: "perp", asset: "ETH", side: "sell", size: 3, urgency: "medium" },
                ],
            });

            expect(result.executionSequence[0]).toBe("o2"); // high urgency first
            expect(result.executionSequence).toHaveLength(3);
            expect(result.estimatedGas).toBeGreaterThan(0);
            expect(result.recommendation).toBeTruthy();
        });
    });

    describe("analyzeRisk", () => {
        it("returns safe risk level for small positions", async () => {
            const result = await tensor.analyzeRisk({
                positions: [
                    { id: "p1", type: "perp", asset: "ETH", size: 1, entryPrice: 2000, markPrice: 2000 },
                ],
            });

            expect(result.riskLevel).toBe("safe");
            expect(result.portfolioValue).toBe(2000);
            expect(result.warnings).toHaveLength(0);
        });
    });
});
