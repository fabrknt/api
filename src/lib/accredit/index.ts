/**
 * Accredit — On-chain KYC/AML enforcement and jurisdiction controls.
 *
 * - Identity verification status checks
 * - Jurisdiction-based access control
 * - Accredited investor verification
 * - Transfer restriction enforcement
 */

import type {
    Jurisdiction,
    KycLevel,
    InvestorType,
    IdentityScreenResult,
    JurisdictionCheckResult,
    AccreditationResult,
    TransferCheckResult,
} from "./types";

// ---------------------------------------------------------------------------
// KYC registry (in production, backed by Sumsub/Fractal/on-chain attestations)
// ---------------------------------------------------------------------------

const KYC_REGISTRY = new Map<string, {
    kycLevel: KycLevel;
    investorType: InvestorType;
    jurisdictions: Jurisdiction[];
    verifiedAt: number;
    expiresAt: number;
}>();

// ---------------------------------------------------------------------------
// Jurisdiction requirements
// ---------------------------------------------------------------------------

const JURISDICTION_REQUIREMENTS: Record<Jurisdiction, {
    minKycLevel: KycLevel;
    restrictedProtocolTypes: string[];
    maxRetailExposure: number;
}> = {
    MAS: { minKycLevel: "enhanced", restrictedProtocolTypes: ["derivatives", "leveraged"], maxRetailExposure: 50000 },
    SFC: { minKycLevel: "enhanced", restrictedProtocolTypes: ["derivatives"], maxRetailExposure: 100000 },
    FSA: { minKycLevel: "basic", restrictedProtocolTypes: ["leveraged"], maxRetailExposure: 200000 },
    SEC: { minKycLevel: "enhanced", restrictedProtocolTypes: ["securities", "derivatives"], maxRetailExposure: 0 },
    FCA: { minKycLevel: "enhanced", restrictedProtocolTypes: ["derivatives", "leveraged"], maxRetailExposure: 50000 },
    FINMA: { minKycLevel: "basic", restrictedProtocolTypes: [], maxRetailExposure: 500000 },
    BaFin: { minKycLevel: "enhanced", restrictedProtocolTypes: ["derivatives"], maxRetailExposure: 100000 },
};

const KYC_LEVEL_ORDER: KycLevel[] = ["none", "basic", "enhanced", "institutional"];

function meetsKycLevel(current: KycLevel, required: KycLevel): boolean {
    return KYC_LEVEL_ORDER.indexOf(current) >= KYC_LEVEL_ORDER.indexOf(required);
}

// ---------------------------------------------------------------------------
// Identity screening
// ---------------------------------------------------------------------------

export async function screenIdentity(
    address: string,
    jurisdictions: Jurisdiction[] = ["MAS", "FSA"]
): Promise<IdentityScreenResult> {
    const flags: string[] = [];

    // Check address format
    if (address.length < 32 || address.length > 44) {
        flags.push("Invalid address format");
    }

    // Look up KYC status
    const record = KYC_REGISTRY.get(address.toLowerCase());

    if (!record) {
        return {
            address,
            kycLevel: "none",
            investorType: "retail",
            jurisdictions,
            verified: false,
            verifiedAt: null,
            expiresAt: null,
            flags: [...flags, "No KYC record found"],
        };
    }

    // Check expiration
    if (record.expiresAt < Date.now()) {
        flags.push("KYC verification expired");
    }

    return {
        address,
        kycLevel: record.kycLevel,
        investorType: record.investorType,
        jurisdictions: record.jurisdictions,
        verified: record.expiresAt > Date.now(),
        verifiedAt: record.verifiedAt,
        expiresAt: record.expiresAt,
        flags,
    };
}

// ---------------------------------------------------------------------------
// Jurisdiction check
// ---------------------------------------------------------------------------

export async function checkJurisdiction(
    address: string,
    jurisdiction: Jurisdiction,
    protocolType?: string
): Promise<JurisdictionCheckResult> {
    const requirements = JURISDICTION_REQUIREMENTS[jurisdiction];
    const record = KYC_REGISTRY.get(address.toLowerCase());
    const currentKycLevel: KycLevel = record?.kycLevel || "none";
    const restrictions: string[] = [];

    const kycMet = meetsKycLevel(currentKycLevel, requirements.minKycLevel);
    if (!kycMet) {
        restrictions.push(`Requires ${requirements.minKycLevel} KYC (current: ${currentKycLevel})`);
    }

    if (protocolType && requirements.restrictedProtocolTypes.includes(protocolType)) {
        const investorType = record?.investorType || "retail";
        if (investorType === "retail") {
            restrictions.push(`${protocolType} protocols restricted for retail investors in ${jurisdiction}`);
        }
    }

    return {
        address,
        jurisdiction,
        allowed: restrictions.length === 0,
        restrictions,
        requiredKycLevel: requirements.minKycLevel,
        currentKycLevel,
        reason: restrictions.length === 0
            ? `Cleared for ${jurisdiction}`
            : restrictions.join("; "),
    };
}

// ---------------------------------------------------------------------------
// Accreditation verification
// ---------------------------------------------------------------------------

export async function verifyAccreditation(
    address: string,
    jurisdiction: Jurisdiction = "MAS"
): Promise<AccreditationResult> {
    const record = KYC_REGISTRY.get(address.toLowerCase());
    const investorType: InvestorType = record?.investorType || "retail";
    const accredited = investorType === "accredited" || investorType === "institutional" || investorType === "qualified_purchaser";

    const qualifications: string[] = [];
    if (accredited) {
        if (investorType === "institutional") qualifications.push("Institutional investor");
        if (investorType === "accredited") qualifications.push("Accredited investor");
        if (investorType === "qualified_purchaser") qualifications.push("Qualified purchaser");
    }

    return {
        address,
        investorType,
        accredited,
        qualifications,
        jurisdiction,
        verifiedAt: record?.verifiedAt || null,
        expiresAt: record?.expiresAt || null,
    };
}

// ---------------------------------------------------------------------------
// Transfer restriction check
// ---------------------------------------------------------------------------

export async function checkTransfer(
    from: string,
    to: string,
    jurisdictions: Jurisdiction[] = ["MAS", "FSA"]
): Promise<TransferCheckResult> {
    const requiredActions: string[] = [];

    const fromRecord = KYC_REGISTRY.get(from.toLowerCase());
    const toRecord = KYC_REGISTRY.get(to.toLowerCase());

    if (!fromRecord) {
        requiredActions.push("Sender requires KYC verification");
    }
    if (!toRecord) {
        requiredActions.push("Recipient requires KYC verification");
    }

    // Check jurisdiction compatibility
    if (fromRecord && toRecord) {
        for (const j of jurisdictions) {
            const req = JURISDICTION_REQUIREMENTS[j];
            if (!meetsKycLevel(fromRecord.kycLevel, req.minKycLevel)) {
                requiredActions.push(`Sender does not meet ${j} KYC requirements`);
            }
            if (!meetsKycLevel(toRecord.kycLevel, req.minKycLevel)) {
                requiredActions.push(`Recipient does not meet ${j} KYC requirements`);
            }
        }
    }

    return {
        from,
        to,
        allowed: requiredActions.length === 0,
        reason: requiredActions.length === 0
            ? "Transfer permitted"
            : requiredActions.join("; "),
        requiredActions,
    };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const accredit = {
    screenIdentity,
    checkJurisdiction,
    verifyAccreditation,
    checkTransfer,
};
