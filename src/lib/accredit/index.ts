/**
 * Accredit — On-chain KYC/AML enforcement and jurisdiction controls.
 *
 * - Identity verification status checks
 * - Jurisdiction-based access control
 * - Accredited investor verification
 * - Transfer restriction enforcement
 *
 * Uses Prisma/Postgres when DATABASE_URL is available, falls back to in-memory.
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
// KYC registry — Prisma persistence with in-memory fallback
// ---------------------------------------------------------------------------

interface KycRecord {
    address: string;
    kycLevel: KycLevel;
    investorType: InvestorType;
    jurisdictions: Jurisdiction[];
    verifiedAt: number;
    expiresAt: number;
}

// In-memory fallback store
const KYC_MEMORY_STORE = new Map<string, KycRecord>();

let prismaAvailable: boolean | null = null;

/**
 * Lazy-check if Prisma/DB is available.
 * Caches result to avoid repeated connection attempts.
 */
async function checkPrisma(): Promise<boolean> {
    if (prismaAvailable !== null) return prismaAvailable;

    if (!process.env.DATABASE_URL) {
        prismaAvailable = false;
        return false;
    }

    try {
        const { prisma } = await import("@/lib/db");
        await prisma.$queryRaw`SELECT 1`;
        prismaAvailable = true;
        return true;
    } catch {
        console.warn("Accredit: DATABASE_URL set but connection failed — using in-memory store");
        prismaAvailable = false;
        return false;
    }
}

async function getKycRecord(address: string): Promise<KycRecord | null> {
    const key = address.toLowerCase();

    if (await checkPrisma()) {
        try {
            const { prisma } = await import("@/lib/db");
            // Use raw query since we don't have a KYC model in schema yet
            const rows = await prisma.$queryRaw<KycRecord[]>`
                SELECT address, kyc_level as "kycLevel", investor_type as "investorType",
                       jurisdictions, verified_at as "verifiedAt", expires_at as "expiresAt"
                FROM kyc_records WHERE LOWER(address) = ${key} LIMIT 1
            `;
            return rows[0] || null;
        } catch {
            // Table may not exist yet — fall through to memory store
        }
    }

    return KYC_MEMORY_STORE.get(key) || null;
}

async function setKycRecord(record: KycRecord): Promise<void> {
    const key = record.address.toLowerCase();
    KYC_MEMORY_STORE.set(key, record);

    // Also persist to DB if available (best effort)
    if (await checkPrisma()) {
        try {
            const { prisma } = await import("@/lib/db");
            await prisma.$executeRaw`
                INSERT INTO kyc_records (address, kyc_level, investor_type, jurisdictions, verified_at, expires_at)
                VALUES (${key}, ${record.kycLevel}, ${record.investorType},
                        ${JSON.stringify(record.jurisdictions)}, ${record.verifiedAt}, ${record.expiresAt})
                ON CONFLICT (address) DO UPDATE SET
                    kyc_level = EXCLUDED.kyc_level,
                    investor_type = EXCLUDED.investor_type,
                    jurisdictions = EXCLUDED.jurisdictions,
                    verified_at = EXCLUDED.verified_at,
                    expires_at = EXCLUDED.expires_at
            `;
        } catch {
            // Table may not exist — silently fall back to memory only
        }
    }
}

// ---------------------------------------------------------------------------
// Jurisdiction requirements
// ---------------------------------------------------------------------------

const JURISDICTION_REQUIREMENTS: Record<Jurisdiction, {
    minKycLevel: KycLevel;
    restrictedProtocolTypes: string[];
    maxRetailExposure: number;
    travelRuleThreshold: number; // USD
    reportingCurrency: string;
}> = {
    MAS: { minKycLevel: "enhanced", restrictedProtocolTypes: ["derivatives", "leveraged"], maxRetailExposure: 50000, travelRuleThreshold: 1500, reportingCurrency: "SGD" },
    SFC: { minKycLevel: "enhanced", restrictedProtocolTypes: ["derivatives"], maxRetailExposure: 100000, travelRuleThreshold: 1000, reportingCurrency: "HKD" },
    FSA: { minKycLevel: "basic", restrictedProtocolTypes: ["leveraged"], maxRetailExposure: 200000, travelRuleThreshold: 3000, reportingCurrency: "JPY" },
    SEC: { minKycLevel: "enhanced", restrictedProtocolTypes: ["securities", "derivatives"], maxRetailExposure: 0, travelRuleThreshold: 3000, reportingCurrency: "USD" },
    FCA: { minKycLevel: "enhanced", restrictedProtocolTypes: ["derivatives", "leveraged"], maxRetailExposure: 50000, travelRuleThreshold: 1000, reportingCurrency: "GBP" },
    FINMA: { minKycLevel: "basic", restrictedProtocolTypes: [], maxRetailExposure: 500000, travelRuleThreshold: 1000, reportingCurrency: "CHF" },
    BaFin: { minKycLevel: "enhanced", restrictedProtocolTypes: ["derivatives"], maxRetailExposure: 100000, travelRuleThreshold: 1000, reportingCurrency: "EUR" },
};

const KYC_LEVEL_ORDER: KycLevel[] = ["none", "basic", "enhanced", "institutional"];

function meetsKycLevel(current: KycLevel, required: KycLevel): boolean {
    return KYC_LEVEL_ORDER.indexOf(current) >= KYC_LEVEL_ORDER.indexOf(required);
}

// ---------------------------------------------------------------------------
// Address validation
// ---------------------------------------------------------------------------

function validateAddress(address: string): string[] {
    const flags: string[] = [];

    // EVM address
    if (address.startsWith("0x")) {
        if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
            flags.push("Invalid EVM address format");
        }
        if (address === "0x0000000000000000000000000000000000000000") {
            flags.push("Null address — likely error");
        }
    }
    // Solana address (base58, 32-44 chars)
    else if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
        // Valid Solana format
    }
    // Unknown format
    else if (address.length < 20) {
        flags.push("Address too short — may be invalid");
    }

    return flags;
}

// ---------------------------------------------------------------------------
// Identity screening
// ---------------------------------------------------------------------------

export async function screenIdentity(
    address: string,
    jurisdictions: Jurisdiction[] = ["MAS", "FSA"],
): Promise<IdentityScreenResult> {
    const flags: string[] = [];

    // Validate address format
    flags.push(...validateAddress(address));

    // Look up KYC status
    const record = await getKycRecord(address);

    if (!record) {
        return {
            address,
            kycLevel: "none",
            investorType: "retail",
            jurisdictions,
            verified: false,
            verifiedAt: null,
            expiresAt: null,
            flags: [...flags, "No KYC record found — verification required"],
        };
    }

    // Check expiration
    if (record.expiresAt < Date.now()) {
        flags.push("KYC verification expired — renewal required");
    }

    // Check jurisdiction coverage
    for (const j of jurisdictions) {
        if (!record.jurisdictions.includes(j)) {
            flags.push(`Not verified for ${j} jurisdiction`);
        }
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
    protocolType?: string,
    exposureUsd?: number,
): Promise<JurisdictionCheckResult> {
    const requirements = JURISDICTION_REQUIREMENTS[jurisdiction];
    const record = await getKycRecord(address);
    const currentKycLevel: KycLevel = record?.kycLevel || "none";
    const restrictions: string[] = [];

    // KYC level check
    const kycMet = meetsKycLevel(currentKycLevel, requirements.minKycLevel);
    if (!kycMet) {
        restrictions.push(`Requires ${requirements.minKycLevel} KYC (current: ${currentKycLevel})`);
    }

    // Protocol type restriction
    if (protocolType && requirements.restrictedProtocolTypes.includes(protocolType)) {
        const investorType = record?.investorType || "retail";
        if (investorType === "retail") {
            restrictions.push(`${protocolType} protocols restricted for retail investors in ${jurisdiction}`);
        }
    }

    // Exposure limit check
    if (exposureUsd !== undefined && requirements.maxRetailExposure > 0) {
        const investorType = record?.investorType || "retail";
        if (investorType === "retail" && exposureUsd > requirements.maxRetailExposure) {
            restrictions.push(
                `Retail exposure ${exposureUsd} ${requirements.reportingCurrency} exceeds ${jurisdiction} limit of ${requirements.maxRetailExposure}`,
            );
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
    jurisdiction: Jurisdiction = "MAS",
): Promise<AccreditationResult> {
    const record = await getKycRecord(address);
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
    jurisdictions: Jurisdiction[] = ["MAS", "FSA"],
    amountUsd?: number,
): Promise<TransferCheckResult> {
    const requiredActions: string[] = [];

    const fromRecord = await getKycRecord(from);
    const toRecord = await getKycRecord(to);

    if (!fromRecord) {
        requiredActions.push("Sender requires KYC verification");
    }
    if (!toRecord) {
        requiredActions.push("Recipient requires KYC verification");
    }

    // Check KYC expiration
    if (fromRecord && fromRecord.expiresAt < Date.now()) {
        requiredActions.push("Sender KYC has expired — renewal required");
    }
    if (toRecord && toRecord.expiresAt < Date.now()) {
        requiredActions.push("Recipient KYC has expired — renewal required");
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

            // Travel Rule check
            if (amountUsd && amountUsd >= req.travelRuleThreshold) {
                requiredActions.push(
                    `Transfer of $${amountUsd} triggers ${j} Travel Rule (threshold: $${req.travelRuleThreshold}) — originator/beneficiary data required`,
                );
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
// KYC registration (for testing / internal use)
// ---------------------------------------------------------------------------

export async function registerKyc(params: {
    address: string;
    kycLevel: KycLevel;
    investorType: InvestorType;
    jurisdictions: Jurisdiction[];
    expiresInDays?: number;
}): Promise<KycRecord> {
    const now = Date.now();
    const record: KycRecord = {
        address: params.address.toLowerCase(),
        kycLevel: params.kycLevel,
        investorType: params.investorType,
        jurisdictions: params.jurisdictions,
        verifiedAt: now,
        expiresAt: now + (params.expiresInDays || 365) * 24 * 60 * 60 * 1000,
    };

    await setKycRecord(record);
    return record;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const accredit = {
    screenIdentity,
    checkJurisdiction,
    verifyAccreditation,
    checkTransfer,
    registerKyc,
};
