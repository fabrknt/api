/**
 * POST /api/tempest
 *
 * Tempest API — Dynamic AMM Fee Engine.
 *
 * Methods:
 *   estimate_fee          — Dynamic fee for a trading pair
 *   classify_vol_regime   — Volatility regime classification
 *   get_fee_curve         — Full fee curve across vol range
 *   estimate_il           — Impermanent loss estimation
 *   optimize_lp_range     — LP range optimization for concentrated liquidity
 */

import { NextResponse } from "next/server";
import { tempest } from "@/lib/tempest";

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { method, params } = body;

        let result;

        switch (method) {
            case "estimate_fee": {
                const { pair, volatility, config } = params || {};
                if (!pair || volatility === undefined) {
                    return NextResponse.json(
                        { error: "pair and volatility are required" },
                        { status: 400 },
                    );
                }
                result = await tempest.estimateFee({ pair, volatility, config });
                break;
            }
            case "classify_vol_regime": {
                const { pair, volatility, volatility24h } = params || {};
                if (!pair || volatility === undefined) {
                    return NextResponse.json(
                        { error: "pair and volatility are required" },
                        { status: 400 },
                    );
                }
                result = await tempest.classifyVolRegime({ pair, volatility, volatility24h });
                break;
            }
            case "get_fee_curve": {
                const { pair, config } = params || {};
                if (!pair) {
                    return NextResponse.json(
                        { error: "pair is required" },
                        { status: 400 },
                    );
                }
                result = await tempest.getFeeCurve({ pair, config });
                break;
            }
            case "estimate_il": {
                const { pair, priceChangeRatio, liquidity, dailyVolume, feeBps } = params || {};
                if (!pair || priceChangeRatio === undefined) {
                    return NextResponse.json(
                        { error: "pair and priceChangeRatio are required" },
                        { status: 400 },
                    );
                }
                result = await tempest.estimateIL({ pair, priceChangeRatio, liquidity, dailyVolume, feeBps });
                break;
            }
            case "optimize_lp_range": {
                const { pair, currentPrice, volatility, timeHorizon, riskTolerance } = params || {};
                if (!pair || !currentPrice || volatility === undefined) {
                    return NextResponse.json(
                        { error: "pair, currentPrice, and volatility are required" },
                        { status: 400 },
                    );
                }
                result = await tempest.optimizeLPRange({ pair, currentPrice, volatility, timeHorizon, riskTolerance });
                break;
            }
            default:
                return NextResponse.json(
                    { error: `Unknown method: ${method}. Supported: estimate_fee, classify_vol_regime, get_fee_curve, estimate_il, optimize_lp_range` },
                    { status: 400 },
                );
        }

        return NextResponse.json({ result, poweredBy: "@tempest by FABRKNT" });
    } catch (error) {
        console.error("Tempest API error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Request failed" },
            { status: 500 },
        );
    }
}
