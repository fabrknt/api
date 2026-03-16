/**
 * POST /api/complr
 *
 * Complr API — Off-chain compliance screening for DeFi.
 *
 * Methods:
 *   screen_wallet              — Screen a wallet against sanctions lists
 *   batch_screen_wallets       — Batch screen multiple wallets
 *   screen_pool                — Check pool/protocol regulatory compliance
 *   check_allocation_compliance — Generate compliance alerts for allocations
 *   submit_review              — Submit an item to the review queue
 *   approve_review             — Approve a pending review item
 *   reject_review              — Reject a pending review item
 *   escalate_review            — Escalate a review item
 *   get_review                 — Get a review item by ID
 *   query_reviews              — Query the review queue with filters
 *   get_review_stats           — Get review queue statistics
 *   register_webhook           — Register a webhook endpoint
 *   list_webhooks              — List active webhooks for an API key
 */

import { NextResponse } from "next/server";
import { complr } from "@/lib/complr";

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { method, params } = body;

        let result;

        switch (method) {
            case "screen_wallet": {
                const { address, jurisdictions } = params || {};
                if (!address) return NextResponse.json({ error: "address is required" }, { status: 400 });
                result = await complr.screenWallet(address, jurisdictions);
                break;
            }
            case "batch_screen_wallets": {
                const { addresses, jurisdictions } = params || {};
                if (!addresses || !Array.isArray(addresses)) return NextResponse.json({ error: "addresses array is required" }, { status: 400 });
                result = await complr.batchScreenWallets(addresses, jurisdictions);
                break;
            }
            case "screen_pool": {
                const { protocol, poolId, jurisdictions } = params || {};
                if (!protocol || !poolId) return NextResponse.json({ error: "protocol and poolId are required" }, { status: 400 });
                result = await complr.screenPool(protocol, poolId, jurisdictions);
                break;
            }
            case "check_allocation_compliance": {
                const { allocations } = params || {};
                if (!allocations || !Array.isArray(allocations)) return NextResponse.json({ error: "allocations array is required" }, { status: 400 });
                result = complr.checkAllocationCompliance(allocations);
                break;
            }
            case "submit_review": {
                const { type, decision, metadata, priority } = params || {};
                if (!type || !decision) return NextResponse.json({ error: "type and decision are required" }, { status: 400 });
                result = complr.submitReview({ type, decision, metadata, priority });
                break;
            }
            case "approve_review": {
                const { id, reviewerId, notes } = params || {};
                if (!id || !reviewerId) return NextResponse.json({ error: "id and reviewerId are required" }, { status: 400 });
                result = complr.approveReview(id, reviewerId, notes);
                if (!result) return NextResponse.json({ error: "Review item not found" }, { status: 404 });
                break;
            }
            case "reject_review": {
                const { id, reviewerId, notes } = params || {};
                if (!id || !reviewerId) return NextResponse.json({ error: "id and reviewerId are required" }, { status: 400 });
                result = complr.rejectReview(id, reviewerId, notes);
                if (!result) return NextResponse.json({ error: "Review item not found" }, { status: 404 });
                break;
            }
            case "escalate_review": {
                const { id, reviewerId, notes } = params || {};
                if (!id || !reviewerId) return NextResponse.json({ error: "id and reviewerId are required" }, { status: 400 });
                result = complr.escalateReview(id, reviewerId, notes);
                if (!result) return NextResponse.json({ error: "Review item not found" }, { status: 404 });
                break;
            }
            case "get_review": {
                const { id } = params || {};
                if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
                result = complr.getReviewById(id);
                if (!result) return NextResponse.json({ error: "Review item not found" }, { status: 404 });
                break;
            }
            case "query_reviews": {
                const { status, priority, type, limit, offset } = params || {};
                result = complr.queryReviews({ status, priority, type, limit, offset });
                break;
            }
            case "get_review_stats": {
                result = complr.getReviewStats();
                break;
            }
            case "register_webhook": {
                const { apiKeyId, url, events, secret } = params || {};
                if (!apiKeyId || !url || !events || !secret) return NextResponse.json({ error: "apiKeyId, url, events, and secret are required" }, { status: 400 });
                result = complr.registerWebhook(apiKeyId, url, events, secret);
                break;
            }
            case "list_webhooks": {
                const { apiKeyId } = params || {};
                if (!apiKeyId) return NextResponse.json({ error: "apiKeyId is required" }, { status: 400 });
                result = complr.listWebhooks(apiKeyId);
                break;
            }
            default:
                return NextResponse.json(
                    { error: `Unknown method: ${method}. Supported: screen_wallet, batch_screen_wallets, screen_pool, check_allocation_compliance, submit_review, approve_review, reject_review, escalate_review, get_review, query_reviews, get_review_stats, register_webhook, list_webhooks` },
                    { status: 400 }
                );
        }

        return NextResponse.json({ result, poweredBy: "@complr by FABRKNT" });
    } catch (error) {
        console.error("Complr API error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Request failed" },
            { status: 500 }
        );
    }
}
