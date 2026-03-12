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

    // -----------------------------------------------------------------------
    // New features: Vol Surface
    // -----------------------------------------------------------------------

    describe("buildVolSurface / interpolateVolSurface", () => {
        it("builds a vol surface from ATM vol", () => {
            const surface = tensor.buildVolSurface(0.80);
            expect(surface.surface).toHaveLength(4); // 4 expiry buckets
            expect(surface.surface[0]).toHaveLength(9); // 9 moneyness nodes
            expect(surface.moneyness_nodes).toEqual(tensor.DEFAULT_MONEYNESS_NODES);
            expect(surface.expiry_days).toEqual(tensor.DEFAULT_EXPIRY_DAYS);
        });

        it("ATM vol at 30d expiry equals input ATM vol", () => {
            const surface = tensor.buildVolSurface(0.80);
            // moneyness 1.0 is index 5, expiry 30d is index 1
            // term multiplier for 30d is 1.0, skew for 1.0 is 1.0
            expect(surface.surface[1][5]).toBeCloseTo(0.80, 4);
        });

        it("OTM puts have higher vol (smile)", () => {
            const surface = tensor.buildVolSurface(0.80);
            // moneyness 0.7 (index 0) should have higher vol than 1.0 (index 5)
            const otmPutVol = surface.surface[1][0];
            const atmVol = surface.surface[1][5];
            expect(otmPutVol).toBeGreaterThan(atmVol);
        });

        it("short-dated vol is elevated", () => {
            const surface = tensor.buildVolSurface(0.80);
            // 7d (index 0) ATM should be higher than 30d (index 1) ATM
            const vol7d = surface.surface[0][5];
            const vol30d = surface.surface[1][5];
            expect(vol7d).toBeGreaterThan(vol30d);
        });

        it("interpolates vol for arbitrary moneyness/expiry", () => {
            const surface = tensor.buildVolSurface(0.80);
            const iv = tensor.interpolateVolSurface(surface, 0.95, 60);
            expect(iv).toBeGreaterThan(0);
            expect(iv).toBeLessThan(2.0);
        });

        it("interpolation at exact node returns node value", () => {
            const surface = tensor.buildVolSurface(0.80);
            const iv = tensor.interpolateVolSurface(surface, 1.0, 30);
            expect(iv).toBeCloseTo(0.80, 4);
        });
    });

    describe("volSurfaceToOnChain / fitVolSurfaceFromOracle", () => {
        it("converts to on-chain format (bps)", () => {
            const surface = tensor.buildVolSurface(0.80);
            const onChain = tensor.volSurfaceToOnChain(surface);

            expect(onChain.node_count).toBe(9);
            expect(onChain.expiry_count).toBe(4);
            expect(onChain.vol_surface).toHaveLength(4);
            expect(onChain.vol_surface[0]).toHaveLength(9);
            // ATM 30d should be ~8000 bps
            expect(onChain.vol_surface[1][5]).toBeCloseTo(8000, -1);
        });

        it("fits surface from oracle variance", () => {
            const onChain = tensor.fitVolSurfaceFromOracle(6400_0000); // variance bps
            expect(onChain.node_count).toBe(9);
            expect(onChain.expiry_count).toBe(4);
        });
    });

    // -----------------------------------------------------------------------
    // New features: Solver Auctions
    // -----------------------------------------------------------------------

    describe("registerSolver / listSolvers", () => {
        it("registers and lists solvers", () => {
            tensor.registerSolver({
                solver: "solver-1",
                stake: 1000,
                total_fills: 50,
                total_volume: 100000,
                slash_count: 0,
                is_active: true,
                registered_at: new Date().toISOString(),
            });

            const solvers = tensor.listSolvers();
            expect(solvers.some((s) => s.solver === "solver-1")).toBe(true);
        });
    });

    describe("rankBids / evaluateAuction / processAuction", () => {
        const bids = [
            { solver: "s1", bid_price: 100, bid_timestamp: "2024-01-01", is_active: true },
            { solver: "s2", bid_price: 105, bid_timestamp: "2024-01-01", is_active: true },
            { solver: "s3", bid_price: 98, bid_timestamp: "2024-01-01", is_active: false },
            { solver: "s4", bid_price: 102, bid_timestamp: "2024-01-01", is_active: true },
        ];

        it("ranks buy bids by highest price first", () => {
            const ranked = tensor.rankBids(bids, "buy");
            expect(ranked[0].solver).toBe("s2");
            expect(ranked[0].bid_price).toBe(105);
        });

        it("ranks sell bids by lowest price first", () => {
            const ranked = tensor.rankBids(bids, "sell");
            expect(ranked[0].solver).not.toBe("s2"); // s2 has highest price
            expect(ranked[0].bid_price).toBeLessThanOrEqual(ranked[1].bid_price);
        });

        it("excludes inactive bids", () => {
            const ranked = tensor.rankBids(bids, "buy");
            expect(ranked.every((b) => b.is_active)).toBe(true);
            expect(ranked.some((b) => b.solver === "s3")).toBe(false);
        });

        it("evaluateAuction selects winning bid", () => {
            const winner = tensor.evaluateAuction(bids, "buy");
            expect(winner).not.toBeNull();
            expect(winner!.solver).toBe("s2");
        });

        it("evaluateAuction returns null for empty bids", () => {
            const winner = tensor.evaluateAuction([], "buy");
            expect(winner).toBeNull();
        });

        it("processAuction checks profitability", () => {
            const result = tensor.processAuction(bids, "buy", 2, 100);
            expect(result.winner).not.toBeNull();
            expect(typeof result.isProfitable).toBe("boolean");
            expect(result.ranked.length).toBeGreaterThan(0);
        });
    });

    describe("evaluateBidOpportunity", () => {
        it("recommends bidding when profitable", () => {
            const result = tensor.evaluateBidOpportunity({
                asset: "ETH",
                side: "buy",
                size: 10,
                limitPrice: 2050,
                marketPrice: 2000,
                gasCostPerStep: 5,
                minProfitBps: 5,
            });

            expect(result.shouldBid).toBe(true);
            expect(result.bidPrice).toBeGreaterThan(2000);
            expect(result.bidPrice).toBeLessThan(2050);
            expect(result.expectedProfit).toBeGreaterThan(0);
        });

        it("rejects unprofitable bids", () => {
            const result = tensor.evaluateBidOpportunity({
                asset: "ETH",
                side: "buy",
                size: 1,
                limitPrice: 2001,
                marketPrice: 2000,
                gasCostPerStep: 100,
                minProfitBps: 50,
            });

            expect(result.shouldBid).toBe(false);
            expect(result.reason).toContain("below minimum");
        });
    });

    describe("findSettleableAuctions", () => {
        it("finds auctions past their end time", () => {
            const now = Date.now();
            const auctionEnds: Record<string, number> = {
                "intent-1": now - 1000,  // ended
                "intent-2": now + 1000,  // still active
                "intent-3": now - 5000,  // ended
                "intent-4": 0,           // no auction
            };

            const settleable = tensor.findSettleableAuctions(now, auctionEnds);
            expect(settleable).toContain("intent-1");
            expect(settleable).toContain("intent-3");
            expect(settleable).not.toContain("intent-2");
            expect(settleable).not.toContain("intent-4");
        });
    });

    // -----------------------------------------------------------------------
    // New features: Gamma Scaling & Concentration Limits
    // -----------------------------------------------------------------------

    describe("calculateGammaMarginScale", () => {
        it("returns 1.0 when below 50% of limit", () => {
            expect(tensor.calculateGammaMarginScale(40, 100)).toBe(1.0);
        });

        it("returns 5.0 at 100% of limit", () => {
            expect(tensor.calculateGammaMarginScale(100, 100)).toBe(5.0);
        });

        it("scales linearly between 50% and 100%", () => {
            const scale75 = tensor.calculateGammaMarginScale(75, 100);
            expect(scale75).toBeGreaterThan(1.0);
            expect(scale75).toBeLessThan(5.0);
        });

        it("returns 1.0 for unlimited (limit=0)", () => {
            expect(tensor.calculateGammaMarginScale(1000, 0)).toBe(1.0);
        });
    });

    describe("checkGammaLimits", () => {
        it("passes when within limits", () => {
            const result = tensor.checkGammaLimits(40, { max_account_gamma_notional: 100, max_market_gamma_notional: 0 });
            expect(result.withinLimits).toBe(true);
            expect(result.accountScale).toBe(1.0);
        });

        it("fails when exceeding limits", () => {
            const result = tensor.checkGammaLimits(150, { max_account_gamma_notional: 100, max_market_gamma_notional: 0 });
            expect(result.withinLimits).toBe(false);
            expect(result.warnings.length).toBeGreaterThan(0);
        });

        it("reports scaling when approaching limit", () => {
            const result = tensor.checkGammaLimits(75, { max_account_gamma_notional: 100, max_market_gamma_notional: 0 });
            expect(result.accountScale).toBeGreaterThan(1.0);
            expect(result.warnings.some((w) => w.includes("scaled"))).toBe(true);
        });

        it("unlimited by default", () => {
            const result = tensor.checkGammaLimits(10000);
            expect(result.withinLimits).toBe(true);
            expect(result.accountScale).toBe(1.0);
        });
    });

    // -----------------------------------------------------------------------
    // New features: Health & Delta-Netting
    // -----------------------------------------------------------------------

    describe("calculateHealth", () => {
        it("returns healthy for well-collateralized account", () => {
            const positions = [
                { id: "h1", type: "perp" as const, asset: "ETH", size: 1, entryPrice: 2000, markPrice: 2000 },
            ];
            const result = tensor.calculateHealth(positions, 10000);
            expect(result.health).toBe("healthy");
            expect(result.equity).toBe(10000);
            expect(result.liquidation_distance).toBeGreaterThan(0);
        });

        it("returns critical for under-collateralized account", () => {
            const positions = [
                { id: "h2", type: "perp" as const, asset: "ETH", size: 100, entryPrice: 2000, markPrice: 2000 },
            ];
            const result = tensor.calculateHealth(positions, 1200);
            expect(["critical", "liquidatable"]).toContain(result.health);
        });

        it("includes unrealized PnL in equity", () => {
            const positions = [
                { id: "h3", type: "perp" as const, asset: "ETH", size: 1, entryPrice: 2000, markPrice: 2000 },
            ];
            const result = tensor.calculateHealth(positions, 1000, 500);
            expect(result.equity).toBe(1500);
        });
    });

    describe("deltaNet", () => {
        it("computes margin savings for hedged positions", () => {
            const positions = [
                { id: "dn1", type: "perp" as const, asset: "ETH", size: 10, entryPrice: 2000, markPrice: 2000 },
                { id: "dn2", type: "perp" as const, asset: "ETH", size: -8, entryPrice: 2000, markPrice: 2000 },
            ];
            const result = tensor.deltaNet(positions);
            expect(result.savings).toBeGreaterThan(0);
            expect(result.savings_pct).toBeGreaterThan(0);
            expect(result.netted_margin).toBeLessThan(result.gross_margin);
            expect(result.netting_groups.length).toBeGreaterThan(0);
        });

        it("no savings for single-direction positions", () => {
            const positions = [
                { id: "dn3", type: "perp" as const, asset: "ETH", size: 10, entryPrice: 2000, markPrice: 2000 },
            ];
            const result = tensor.deltaNet(positions);
            expect(result.savings).toBe(0);
        });

        it("groups by underlying asset", () => {
            const positions = [
                { id: "dn4", type: "perp" as const, asset: "ETH-PERP", size: 5, entryPrice: 2000, markPrice: 2000 },
                { id: "dn5", type: "perp" as const, asset: "ETH-PERP", size: -3, entryPrice: 2000, markPrice: 2000 },
                { id: "dn6", type: "perp" as const, asset: "BTC-PERP", size: 2, entryPrice: 50000, markPrice: 50000 },
            ];
            const result = tensor.deltaNet(positions);
            expect(result.netting_groups.length).toBe(2);
        });
    });

    describe("marginWeightFor", () => {
        it("returns correct weights for known types", () => {
            expect(tensor.marginWeightFor("perp")).toBe(0.10);
            expect(tensor.marginWeightFor("option")).toBe(0.15);
            expect(tensor.marginWeightFor("spot")).toBe(0.10);
            expect(tensor.marginWeightFor("lending")).toBe(0.05);
        });

        it("returns default weight for unknown types", () => {
            expect(tensor.marginWeightFor("exotic")).toBe(0.10);
        });
    });
});
