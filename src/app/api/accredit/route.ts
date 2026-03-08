/**
 * POST /api/accredit
 *
 * Accredit API — KYC/AML controls and jurisdiction enforcement.
 *
 * Methods:
 *   screen_identity     — Check KYC verification status
 *   check_jurisdiction  — Verify jurisdiction eligibility
 *   verify_accreditation — Check accredited investor status
 *   check_transfer      — Validate transfer restrictions
 */

import { NextResponse } from "next/server";
import { accredit } from "@/lib/accredit";

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { method, params } = body;

        let result;

        switch (method) {
            case "screen_identity": {
                const { address, jurisdictions } = params || {};
                if (!address) return NextResponse.json({ error: "address is required" }, { status: 400 });
                result = await accredit.screenIdentity(address, jurisdictions);
                break;
            }
            case "check_jurisdiction": {
                const { address, jurisdiction, protocolType } = params || {};
                if (!address || !jurisdiction) return NextResponse.json({ error: "address and jurisdiction are required" }, { status: 400 });
                result = await accredit.checkJurisdiction(address, jurisdiction, protocolType);
                break;
            }
            case "verify_accreditation": {
                const { address, jurisdiction } = params || {};
                if (!address) return NextResponse.json({ error: "address is required" }, { status: 400 });
                result = await accredit.verifyAccreditation(address, jurisdiction);
                break;
            }
            case "check_transfer": {
                const { from, to, jurisdictions } = params || {};
                if (!from || !to) return NextResponse.json({ error: "from and to are required" }, { status: 400 });
                result = await accredit.checkTransfer(from, to, jurisdictions);
                break;
            }
            default:
                return NextResponse.json(
                    { error: `Unknown method: ${method}. Supported: screen_identity, check_jurisdiction, verify_accreditation, check_transfer` },
                    { status: 400 }
                );
        }

        return NextResponse.json({ result, poweredBy: "@accredit by FABRKNT" });
    } catch (error) {
        console.error("Accredit API error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Request failed" },
            { status: 500 }
        );
    }
}
