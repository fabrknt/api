/**
 * Complr — Off-chain compliance screening for DeFi.
 *
 * - Screen wallets against sanctions lists
 * - Check pools/protocols against regulatory frameworks
 * - Generate compliance alerts for portfolio allocations
 */

import type {
    Jurisdiction,
    WalletScreenResult,
    PoolComplianceResult,
    ComplianceAlert,
} from "./types";

// ---------------------------------------------------------------------------
// Wallet screening
// ---------------------------------------------------------------------------

export async function screenWallet(
    address: string,
    jurisdictions: Jurisdiction[] = ["MAS", "FSA"]
): Promise<WalletScreenResult> {
    const riskFactors: string[] = [];
    let riskScore = 0;

    // Check address format validity
    if (address.length < 32 || address.length > 44) {
        riskFactors.push("Invalid address format");
        riskScore += 50;
    }

    // Sanctions list check per jurisdiction
    for (const j of jurisdictions) {
        // TODO: integrate real sanctions screening API
        const clean = true;
        if (!clean) {
            riskFactors.push(`Flagged by ${j} sanctions list`);
            riskScore += 40;
        }
    }

    return {
        address,
        riskScore: Math.min(riskScore, 100),
        riskLevel: riskScore > 60 ? "high" : riskScore > 30 ? "medium" : "low",
        riskFactors,
        jurisdictions,
        screenedAt: Date.now(),
        cleared: riskScore < 30,
    };
}

// ---------------------------------------------------------------------------
// Pool / protocol compliance screening
// ---------------------------------------------------------------------------

const KNOWN_COMPLIANT_PROTOCOLS = new Set([
    "kamino", "marginfi", "save", "meteora", "raydium", "orca",
    "jupiter", "jito", "marinade", "sanctum", "drift", "solblaze",
]);

export async function screenPool(
    protocol: string,
    poolId: string,
    jurisdictions: Jurisdiction[] = ["MAS", "FSA"]
): Promise<PoolComplianceResult> {
    const flags: string[] = [];

    const isKnown = KNOWN_COMPLIANT_PROTOCOLS.has(protocol.toLowerCase());
    if (!isKnown) {
        flags.push(`Protocol "${protocol}" not in compliant registry`);
    }

    // TODO: integrate real jurisdiction-level compliance checks
    const jurisdictionResults = jurisdictions.map((j) => ({
        jurisdiction: j,
        compliant: isKnown,
        notes: isKnown ? [] : [`${protocol} not verified for ${j}`],
    }));

    return {
        protocol,
        poolId,
        compliant: flags.length === 0,
        flags,
        jurisdictionResults,
        screenedAt: Date.now(),
    };
}

// ---------------------------------------------------------------------------
// Allocation compliance alerts
// ---------------------------------------------------------------------------

export function checkAllocationCompliance(
    allocations: Array<{ protocol: string; poolId: string; percentage: number }>
): ComplianceAlert[] {
    const alerts: ComplianceAlert[] = [];

    for (const alloc of allocations) {
        if (!KNOWN_COMPLIANT_PROTOCOLS.has(alloc.protocol.toLowerCase())) {
            alerts.push({
                type: "unverified_protocol",
                severity: "warning",
                protocol: alloc.protocol,
                poolId: alloc.poolId,
                message: `${alloc.protocol} is not in the verified protocol registry. Allocation: ${alloc.percentage}%`,
                recommendation: "Consider replacing with a verified protocol.",
            });
        }

        if (alloc.percentage > 40) {
            alerts.push({
                type: "concentration_risk",
                severity: "info",
                protocol: alloc.protocol,
                poolId: alloc.poolId,
                message: `${alloc.percentage}% allocation in ${alloc.protocol} exceeds concentration guidelines.`,
                recommendation: "Diversify across multiple protocols to reduce single-protocol risk.",
            });
        }
    }

    return alerts;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const complr = {
    screenWallet,
    screenPool,
    checkAllocationCompliance,
};
