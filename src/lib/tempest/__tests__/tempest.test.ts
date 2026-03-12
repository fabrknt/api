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

    // -----------------------------------------------------------------------
    // New features: Keeper Fail-Safe
    // -----------------------------------------------------------------------

    describe("keeperHeartbeat / getKeeperStatus", () => {
        it("records heartbeat and marks keeper responsive", () => {
            const status = tempest.keeperHeartbeat("pool-keeper-1");
            expect(status.isResponsive).toBe(true);
            expect(status.currentMultiplier).toBe(1.0);
            expect(status.lastHeartbeat).toBeGreaterThan(0);
        });

        it("marks keeper unresponsive when no heartbeat exists", () => {
            const status = tempest.getKeeperStatus("pool-no-heartbeat");
            expect(status.isResponsive).toBe(false);
            expect(status.currentMultiplier).toBe(2.0); // default failSafeMultiplier
        });

        it("applies fail-safe multiplier for unresponsive keeper", () => {
            const status = tempest.getKeeperStatus("pool-never-pinged", {
                failSafeMultiplier: 3.0,
                heartbeatTimeout: 120,
                dustThreshold: 1,
                maxMomentumBoost: 1.5,
                baseKeeperRewardBps: 5,
            });
            expect(status.isResponsive).toBe(false);
            expect(status.currentMultiplier).toBe(3.0);
        });

        it("responsive keeper has multiplier of 1.0", () => {
            tempest.keeperHeartbeat("pool-responsive-test");
            const status = tempest.getKeeperStatus("pool-responsive-test");
            expect(status.isResponsive).toBe(true);
            expect(status.currentMultiplier).toBe(1.0);
        });
    });

    // -----------------------------------------------------------------------
    // New features: Dust Filter
    // -----------------------------------------------------------------------

    describe("applyDustFilter", () => {
        it("returns fee when above threshold", () => {
            expect(tempest.applyDustFilter(10, 1)).toBe(10);
        });

        it("returns threshold when fee is below", () => {
            expect(tempest.applyDustFilter(0.5, 1)).toBe(1);
        });

        it("returns threshold when fee is zero", () => {
            expect(tempest.applyDustFilter(0, 1)).toBe(1);
        });

        it("uses default threshold of 1 bps", () => {
            expect(tempest.applyDustFilter(0.5)).toBe(1);
        });
    });

    // -----------------------------------------------------------------------
    // New features: Momentum Boost
    // -----------------------------------------------------------------------

    describe("applyMomentumBoost", () => {
        it("boosts fee when vol is increasing", () => {
            const boosted = tempest.applyMomentumBoost(30, 1000, 500);
            expect(boosted).toBeGreaterThan(30);
        });

        it("does not boost when vol is decreasing", () => {
            const result = tempest.applyMomentumBoost(30, 500, 1000);
            expect(result).toBe(30);
        });

        it("does not boost when vol is unchanged", () => {
            const result = tempest.applyMomentumBoost(30, 500, 500);
            expect(result).toBe(30);
        });

        it("respects max boost multiplier", () => {
            // Very large vol spike: currentVol is 10x previousVol
            const boosted = tempest.applyMomentumBoost(30, 5000, 500, 1.5);
            expect(boosted).toBeLessThanOrEqual(30 * 1.5);
        });

        it("returns unchanged fee when previous vol is zero", () => {
            expect(tempest.applyMomentumBoost(30, 1000, 0)).toBe(30);
        });
    });

    // -----------------------------------------------------------------------
    // New features: Dynamic Rewards
    // -----------------------------------------------------------------------

    describe("calculateKeeperReward", () => {
        it("returns lower reward for very_low regime", () => {
            const reward = tempest.calculateKeeperReward("very_low");
            expect(reward).toBe(2.5); // 5 * 0.5
        });

        it("returns base reward for medium regime", () => {
            const reward = tempest.calculateKeeperReward("medium");
            expect(reward).toBe(5); // 5 * 1.0
        });

        it("returns higher reward for extreme regime", () => {
            const reward = tempest.calculateKeeperReward("extreme");
            expect(reward).toBe(10); // 5 * 2.0
        });

        it("scales monotonically with regime severity", () => {
            const regimes = ["very_low", "low", "medium", "high", "extreme"] as const;
            const rewards = regimes.map((r) => tempest.calculateKeeperReward(r));
            for (let i = 1; i < rewards.length; i++) {
                expect(rewards[i]).toBeGreaterThan(rewards[i - 1]);
            }
        });

        it("accepts custom base bps", () => {
            expect(tempest.calculateKeeperReward("medium", 10)).toBe(10);
            expect(tempest.calculateKeeperReward("extreme", 10)).toBe(20);
        });
    });

    describe("recordKeeperReward", () => {
        it("accumulates rewards for a pool", () => {
            tempest.keeperHeartbeat("pool-reward-test");
            tempest.recordKeeperReward("pool-reward-test", 5);
            tempest.recordKeeperReward("pool-reward-test", 10);

            const status = tempest.getKeeperStatus("pool-reward-test");
            expect(status.rewardAccumulated).toBe(15);
        });
    });

    // -----------------------------------------------------------------------
    // New features: Full dynamic fee computation
    // -----------------------------------------------------------------------

    describe("computeDynamicFee", () => {
        it("computes base fee from piecewise interpolation", () => {
            const result = tempest.computeDynamicFee({ volBps: 500 });
            expect(result.feeBps).toBe(30); // At 500 bps vol, fee is 30 bps per config
            expect(result.keeperMultiplier).toBe(1.0);
            expect(result.momentumBoost).toBe(1.0);
        });

        it("applies keeper fail-safe when pool has no heartbeat", () => {
            const result = tempest.computeDynamicFee({
                volBps: 500,
                poolId: "pool-no-heartbeat-dyn",
            });
            expect(result.keeperMultiplier).toBeGreaterThan(1.0);
            expect(result.feeBps).toBeGreaterThan(30);
        });

        it("applies momentum boost for rising vol", () => {
            tempest.keeperHeartbeat("pool-momentum-test");
            const result = tempest.computeDynamicFee({
                volBps: 1000,
                previousVolBps: 500,
                poolId: "pool-momentum-test",
            });
            expect(result.momentumBoost).toBeGreaterThan(1.0);
        });

        it("applies dust filter for very low vol", () => {
            tempest.keeperHeartbeat("pool-dust-test");
            const result = tempest.computeDynamicFee({
                volBps: 0,
                poolId: "pool-dust-test",
            });
            expect(result.feeBps).toBeGreaterThanOrEqual(1); // dust threshold
        });
    });

    // -----------------------------------------------------------------------
    // New features: On-chain fee interpolation
    // -----------------------------------------------------------------------

    describe("interpolateFeeBps", () => {
        it("returns min fee at zero vol", () => {
            expect(tempest.interpolateFeeBps(0)).toBe(1);
        });

        it("returns max fee at extreme vol", () => {
            expect(tempest.interpolateFeeBps(10000)).toBe(100);
        });

        it("interpolates linearly between breakpoints", () => {
            const fee = tempest.interpolateFeeBps(350); // between 200(5bps) and 500(30bps)
            expect(fee).toBeGreaterThan(5);
            expect(fee).toBeLessThan(30);
        });

        it("monotonically increases", () => {
            const vols = [0, 100, 200, 350, 500, 1000, 1500, 2000, 3000, 10000];
            const fees = vols.map((v) => tempest.interpolateFeeBps(v));
            for (let i = 1; i < fees.length; i++) {
                expect(fees[i]).toBeGreaterThanOrEqual(fees[i - 1]);
            }
        });
    });

    describe("classifyRegimeBps", () => {
        it("classifies vol regimes in bps", () => {
            expect(tempest.classifyRegimeBps(100)).toBe(0);  // VeryLow
            expect(tempest.classifyRegimeBps(300)).toBe(1);  // Low
            expect(tempest.classifyRegimeBps(1000)).toBe(2); // Normal
            expect(tempest.classifyRegimeBps(2000)).toBe(3); // High
            expect(tempest.classifyRegimeBps(5000)).toBe(4); // Extreme
        });
    });

    describe("estimateConcentratedIL", () => {
        it("returns IL for concentrated position", () => {
            const il = tempest.estimateConcentratedIL(500, 9000, 11000, 30);
            expect(il).toBeGreaterThan(0);
            expect(il).toBeLessThanOrEqual(100);
        });

        it("returns 0 for zero range width", () => {
            const il = tempest.estimateConcentratedIL(500, 10000, 10000, 30);
            expect(il).toBe(0);
        });

        it("higher vol produces higher IL", () => {
            const lowVol = tempest.estimateConcentratedIL(200, 9000, 11000, 30);
            const highVol = tempest.estimateConcentratedIL(2000, 9000, 11000, 30);
            expect(highVol).toBeGreaterThan(lowVol);
        });
    });
});
