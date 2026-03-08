/**
 * POST /api/stratum
 *
 * Stratum API — Data infrastructure layer.
 *
 * Methods:
 *   check_sanctions       — Check address against aggregated sanctions lists
 *   get_sanctions_list    — Browse sanctions list entries
 *   get_regulatory_updates — Latest regulatory changes
 *   get_health            — Data pipeline health status
 *   get_feed_status       — Individual feed status
 */

import { NextResponse } from "next/server";
import { stratum } from "@/lib/stratum";

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { method, params } = body;

        let result;

        switch (method) {
            case "check_sanctions": {
                const { address } = params || {};
                if (!address) return NextResponse.json({ error: "address is required" }, { status: 400 });
                result = await stratum.checkSanctions(address);
                break;
            }
            case "get_sanctions_list": {
                const { listSource, limit } = params || {};
                result = await stratum.getSanctionsList({ listSource, limit });
                break;
            }
            case "get_regulatory_updates": {
                const { jurisdiction, impact, limit } = params || {};
                result = await stratum.getRegulatoryUpdates({ jurisdiction, impact, limit });
                break;
            }
            case "get_health": {
                result = await stratum.getHealth();
                break;
            }
            case "get_feed_status": {
                const { feedId } = params || {};
                if (!feedId) return NextResponse.json({ error: "feedId is required" }, { status: 400 });
                result = await stratum.getFeedStatus(feedId);
                break;
            }
            default:
                return NextResponse.json(
                    { error: `Unknown method: ${method}. Supported: check_sanctions, get_sanctions_list, get_regulatory_updates, get_health, get_feed_status` },
                    { status: 400 }
                );
        }

        return NextResponse.json({ result, poweredBy: "@stratum by FABRKNT" });
    } catch (error) {
        console.error("Stratum API error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Request failed" },
            { status: 500 }
        );
    }
}
