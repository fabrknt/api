/**
 * POST /api/tensor
 *
 * Tensor API — Portfolio Margin Engine.
 *
 * Methods:
 *   compute_greeks      — Black-Scholes greeks for an option
 *   calculate_margin    — Portfolio margin with delta-netting
 *   solve_intent        — Optimize execution order for a set of orders
 *   analyze_risk        — Portfolio-level risk analysis
 */

import { NextResponse } from "next/server";
import { tensor } from "@/lib/tensor";

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { method, params } = body;

        let result;

        switch (method) {
            case "compute_greeks": {
                const { asset, spot, strike, expiry, optionType, iv } = params || {};
                if (!asset || !spot || !strike || !expiry || !optionType) {
                    return NextResponse.json(
                        { error: "asset, spot, strike, expiry, and optionType are required" },
                        { status: 400 },
                    );
                }
                // Convert expiry to Unix timestamp (seconds) if it's a date string
                const expiryTimestamp = typeof expiry === "string"
                    ? new Date(expiry).getTime() / 1000
                    : expiry;
                if (Number.isNaN(expiryTimestamp)) {
                    return NextResponse.json(
                        { error: "Invalid expiry date" },
                        { status: 400 },
                    );
                }
                result = await tensor.computeGreeks({ asset, spot, strike, expiry: expiryTimestamp, optionType, iv });
                break;
            }
            case "calculate_margin": {
                const { positions } = params || {};
                if (!positions || !Array.isArray(positions) || positions.length === 0) {
                    return NextResponse.json(
                        { error: "positions array is required" },
                        { status: 400 },
                    );
                }
                result = await tensor.calculateMargin({ positions });
                break;
            }
            case "solve_intent": {
                const { orders, currentPositions } = params || {};
                if (!orders || !Array.isArray(orders) || orders.length === 0) {
                    return NextResponse.json(
                        { error: "orders array is required" },
                        { status: 400 },
                    );
                }
                result = await tensor.solveIntent({ orders, currentPositions });
                break;
            }
            case "analyze_risk": {
                const { positions } = params || {};
                if (!positions || !Array.isArray(positions) || positions.length === 0) {
                    return NextResponse.json(
                        { error: "positions array is required" },
                        { status: 400 },
                    );
                }
                result = await tensor.analyzeRisk({ positions });
                break;
            }
            default:
                return NextResponse.json(
                    { error: `Unknown method: ${method}. Supported: compute_greeks, calculate_margin, solve_intent, analyze_risk` },
                    { status: 400 },
                );
        }

        return NextResponse.json({ result, poweredBy: "@tensor by FABRKNT" });
    } catch (error) {
        console.error("Tensor API error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Request failed" },
            { status: 500 },
        );
    }
}
