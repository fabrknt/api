/**
 * POST /api/veil
 *
 * Veil API — Privacy-preserving compliance.
 *
 * Methods:
 *   generate_proof   — Generate ZK compliance proof
 *   verify_proof     — Verify an existing proof
 *   encrypt_data     — Encrypt PII for compliant storage
 *   assess_privacy   — Privacy framework compliance assessment
 *   record_consent   — Record user consent
 *   get_consent      — Retrieve consent records
 */

import { NextResponse } from "next/server";
import { veil } from "@/lib/veil";

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { method, params } = body;

        let result;

        switch (method) {
            case "generate_proof": {
                const { address, proofType, claims } = params || {};
                if (!address || !proofType) return NextResponse.json({ error: "address and proofType are required" }, { status: 400 });
                result = await veil.generateProof({ address, proofType, claims });
                break;
            }
            case "verify_proof": {
                const { proofId, proofHash } = params || {};
                if (!proofId || !proofHash) return NextResponse.json({ error: "proofId and proofHash are required" }, { status: 400 });
                result = await veil.verifyProof({ proofId, proofHash });
                break;
            }
            case "encrypt_data": {
                const { data, accessPolicy, expiresInDays } = params || {};
                if (!data) return NextResponse.json({ error: "data is required" }, { status: 400 });
                result = await veil.encryptData({ data, accessPolicy: accessPolicy || [], expiresInDays });
                break;
            }
            case "assess_privacy": {
                const { address, frameworks, dataCategories } = params || {};
                if (!address || !frameworks) return NextResponse.json({ error: "address and frameworks are required" }, { status: 400 });
                result = await veil.assessPrivacy({ address, frameworks, dataCategories });
                break;
            }
            case "record_consent": {
                const { address, purpose, framework, granted, expiresInDays } = params || {};
                if (!address || !purpose || !framework) return NextResponse.json({ error: "address, purpose, and framework are required" }, { status: 400 });
                result = await veil.recordConsent({ address, purpose, framework, granted: granted ?? true, expiresInDays });
                break;
            }
            case "get_consent": {
                const { address, purpose } = params || {};
                if (!address) return NextResponse.json({ error: "address is required" }, { status: 400 });
                result = await veil.getConsent({ address, purpose });
                break;
            }
            default:
                return NextResponse.json(
                    { error: `Unknown method: ${method}. Supported: generate_proof, verify_proof, encrypt_data, assess_privacy, record_consent, get_consent` },
                    { status: 400 }
                );
        }

        return NextResponse.json({ result, poweredBy: "@veil by FABRKNT" });
    } catch (error) {
        console.error("Veil API error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Request failed" },
            { status: 500 }
        );
    }
}
