import { describe, it, expect } from "vitest";
import { tempest } from "../index";

describe("Tempest — Dynamic AMM Fee Engine", () => {
    describe("classifyVolRegime", () => {
        it("classifies very_low volatility", async () => {
            const result = await tempest.classifyVolRegime({ pair: "USDC/USDT", volatility: 0.05 });
            expect(result.regime).toBe("very_low");
            expect(result.pair).toBe("USDC/USDT");
        });

        it("classifies medium volatility", async () => {
            const result = await tempest.classifyVolRegime({ pair: "ETH/USDC", volatility: 0.55 });
            expect(result.regime).toBe("medium");
        });

        it("classifies extreme volatility", async () => {
            const result = await tempest.classifyVolRegime({ pair: "MEME/SOL", volatility: 2.0 });
            expect(result.regime).toBe("extreme");
        });

        it("returns percentile ranking", async () => {
            const result = await tempest.classifyVolRegime({ pair: "ETH/USDC", volatility: 0.60 });
            expect(result.percentile).toBeGreaterThanOrEqual(0);
            expect(result.percentile).toBeLessThanOrEqual(100);
        });

        it("includes regime thresholds", async () => {
            const result = await tempest.classifyVolRegime({ pair: "ETH/USDC", volatility: 0.50 });
            expect(result.regimeThresholds.very_low.min).toBe(0);
            expect(result.regimeThresholds.extreme.min).toBe(1.2);
        });
    });

    describe("estimateFee", () => {
        it("returns low fee for low volatility", async () => {
            const result = await tempest.estimateFee({ pair: "USDC/USDT", volatility: 0.05 });
            expect(result.totalFee).toBeLessThan(20);
            expect(result.regime).toBe("very_low");
        });

        it("returns higher fee for high volatility", async () => {
            const low = await tempest.estimateFee({ pair: "ETH/USDC", volatility: 0.10 });
            const high = await tempest.estimateFee({ pair: "ETH/USDC", volatility: 0.90 });
            expect(high.totalFee).toBeGreaterThan(low.totalFee);
        });

        it("fee scales monotonically with vol", async () => {
            const fees = [];
            for (const vol of [0.1, 0.3, 0.5, 0.7, 1.0]) {
                const result = await tempest.estimateFee({ pair: "ETH/USDC", volatility: vol });
                fees.push(result.totalFee);
            }
            for (let i = 1; i < fees.length; i++) {
                expect(fees[i]).toBeGreaterThanOrEqual(fees[i - 1]);
            }
        });
    });

    describe("getFeeCurve", () => {
        it("returns curve points", async () => {
            const result = await tempest.getFeeCurve({ pair: "ETH/USDC" });
            expect(result.points.length).toBeGreaterThan(5);
            expect(result.interpolation).toBe("linear");
            expect(result.minFee).toBeGreaterThan(0);
        });

        it("curve points are monotonically increasing", async () => {
            const result = await tempest.getFeeCurve({ pair: "ETH/USDC" });
            for (let i = 1; i < result.points.length; i++) {
                expect(result.points[i].fee).toBeGreaterThanOrEqual(result.points[i - 1].fee);
            }
        });
    });

    describe("estimateIL", () => {
        it("returns zero IL for no price change", async () => {
            const result = await tempest.estimateIL({ pair: "ETH/USDC", priceChangeRatio: 1.0 });
            expect(result.ilPercent).toBe(0);
        });

        it("returns positive IL for price increase", async () => {
            const result = await tempest.estimateIL({ pair: "ETH/USDC", priceChangeRatio: 1.5 });
            expect(result.ilPercent).toBeGreaterThan(0);
            expect(result.ilAbsolute).toBeGreaterThan(0);
        });

        it("returns positive IL for price decrease", async () => {
            const result = await tempest.estimateIL({ pair: "ETH/USDC", priceChangeRatio: 0.5 });
            expect(result.ilPercent).toBeGreaterThan(0);
        });

        it("estimates break-even days", async () => {
            const result = await tempest.estimateIL({
                pair: "ETH/USDC",
                priceChangeRatio: 1.5,
                liquidity: 10000,
                dailyVolume: 1000000,
                feeBps: 30,
            });
            expect(result.breakEvenDays).toBeGreaterThan(0);
            expect(result.feesEarned).toBeGreaterThan(0);
        });
    });

    describe("optimizeLPRange", () => {
        it("returns a range around current price", async () => {
            const result = await tempest.optimizeLPRange({
                pair: "ETH/USDC",
                currentPrice: 2000,
                volatility: 0.65,
            });

            expect(result.recommendedLower).toBeLessThan(2000);
            expect(result.recommendedUpper).toBeGreaterThan(2000);
            expect(result.capitalEfficiency).toBeGreaterThan(1);
        });

        it("wider range for higher volatility", async () => {
            const lowVol = await tempest.optimizeLPRange({
                pair: "ETH/USDC", currentPrice: 2000, volatility: 0.30,
            });
            const highVol = await tempest.optimizeLPRange({
                pair: "ETH/USDC", currentPrice: 2000, volatility: 1.20,
            });

            expect(highVol.rangeWidth).toBeGreaterThan(lowVol.rangeWidth);
        });

        it("wider range for higher risk tolerance", async () => {
            const conservative = await tempest.optimizeLPRange({
                pair: "ETH/USDC", currentPrice: 2000, volatility: 0.65, riskTolerance: 0.1,
            });
            const aggressive = await tempest.optimizeLPRange({
                pair: "ETH/USDC", currentPrice: 2000, volatility: 0.65, riskTolerance: 0.9,
            });

            expect(aggressive.rangeWidth).toBeGreaterThan(conservative.rangeWidth);
        });
    });
});
