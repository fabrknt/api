/**
 * POST /api/sentinel
 *
 * Sentinel API — Pre-transaction security analysis.
 *
 * Methods:
 *   analyze_transaction — Detect threats in pending transactions
 *   analyze_contract    — Security scoring for smart contracts
 *   analyze_mev         — MEV exposure analysis
 */

import { NextResponse } from "next/server";
import { sentinel } from "@/lib/sentinel";

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { method, params } = body;

        let result;

        switch (method) {
            case "analyze_transaction": {
                const { from, to, data, value, chain } = params || {};
                if (!from || !to) return NextResponse.json({ error: "from and to are required" }, { status: 400 });
                result = await sentinel.analyzeTransaction({ from, to, data, value, chain });
                break;
            }
            case "analyze_contract": {
                const { address, chain } = params || {};
                if (!address) return NextResponse.json({ error: "address is required" }, { status: 400 });
                result = await sentinel.analyzeContract({ address, chain });
                break;
            }
            case "analyze_mev": {
                const { txHash, chain } = params || {};
                if (!txHash) return NextResponse.json({ error: "txHash is required" }, { status: 400 });
                result = await sentinel.analyzeMev({ txHash, chain });
                break;
            }
            default:
                return NextResponse.json(
                    { error: `Unknown method: ${method}. Supported: analyze_transaction, analyze_contract, analyze_mev` },
                    { status: 400 }
                );
        }

        return NextResponse.json({ result, poweredBy: "@sentinel by FABRKNT" });
    } catch (error) {
        console.error("Sentinel API error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Request failed" },
            { status: 500 }
        );
    }
}
