/**
 * Accredit — On-chain KYC/AML enforcement and jurisdiction controls.
 *
 * - Identity verification status checks
 * - Jurisdiction-based access control
 * - Accredited investor verification
 * - Transfer restriction enforcement
 * - Compliant wrapper (KYC-gated asset wrapping with fee)
 * - Multi-provider KYC (Civic, World ID, manual)
 * - Blacklist management for SSS-2 compliance
 * - On-chain KYC registry with trade limits
 * - Pool compliance checks
 *
 * Uses Prisma/Postgres when DATABASE_URL is available, falls back to in-memory.
 */

import { randomUUID } from "crypto";
import type {
    Jurisdiction,
    KycLevel,
    InvestorType,
    IdentityScreenResult,
    JurisdictionCheckResult,
    AccreditationResult,
    TransferCheckResult,
    OnChainKycLevel,
    OnChainJurisdiction,
    WhitelistEntry,
    BlacklistEntry,
    ComplianceCheckResult,
    WrapperConfig,
    WrapRequest,
    UnwrapRequest,
    WrapResult,
    PoolComplianceEntry,
    PoolStatus,
    ZkComplianceProof,
    KycProvider,
    KycProviderConfig,
    KycVerificationRequest,
    KycVerificationResult,
} from "./types";
import { kycLevelFromString as sdkKycLevelFromString } from "./types";

export {
    OnChainKycLevel, OnChainJurisdiction, PoolStatus,
    kycLevelToString, kycLevelFromString,
    jurisdictionToString, jurisdictionFromString,
} from "./types";
export type { KycLevelString, JurisdictionString } from "./types";

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
    provider?: KycProvider;
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

    // Check blacklist
    const blacklisted = blacklistStore.get(address.toLowerCase());
    if (blacklisted) {
        flags.push(`Blacklisted: ${blacklisted.reason} (source: ${blacklisted.source})`);
    }

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
    if (!requirements) {
        const supported = Object.keys(JURISDICTION_REQUIREMENTS).join(", ");
        return {
            address,
            jurisdiction,
            allowed: false,
            restrictions: [`Unsupported jurisdiction: ${jurisdiction}. Supported: ${supported}`],
            requiredKycLevel: "none",
            currentKycLevel: "none",
            reason: `Unsupported jurisdiction: ${jurisdiction}. Supported: ${supported}`,
        };
    }

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

    // Check blacklist
    const fromBlacklisted = blacklistStore.get(from.toLowerCase());
    const toBlacklisted = blacklistStore.get(to.toLowerCase());
    if (fromBlacklisted) requiredActions.push(`Sender blacklisted: ${fromBlacklisted.reason}`);
    if (toBlacklisted) requiredActions.push(`Recipient blacklisted: ${toBlacklisted.reason}`);

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
            if (!req) {
                requiredActions.push(`Unsupported jurisdiction: ${j}`);
                continue;
            }
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

    // Check trade limits if applicable
    if (amountUsd && fromRecord) {
        const onChainLevel = kycLevelToOnChain(fromRecord.kycLevel);
        const limit = KYC_TRADE_LIMITS_MAP[onChainLevel];
        if (limit !== Infinity && amountUsd > limit) {
            requiredActions.push(`Trade amount $${amountUsd} exceeds limit for ${fromRecord.kycLevel} KYC level ($${limit})`);
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
    provider?: KycProvider;
}): Promise<KycRecord> {
    const now = Date.now();
    const record: KycRecord = {
        address: params.address.toLowerCase(),
        kycLevel: params.kycLevel,
        investorType: params.investorType,
        jurisdictions: params.jurisdictions,
        verifiedAt: now,
        expiresAt: now + (params.expiresInDays || 365) * 24 * 60 * 60 * 1000,
        provider: params.provider || "manual",
    };

    await setKycRecord(record);
    return record;
}

// ---------------------------------------------------------------------------
// On-chain KYC level mapping
// ---------------------------------------------------------------------------

const KYC_TRADE_LIMITS_MAP: Record<number, number> = {
    0: 1_000,       // Basic
    1: 50_000,      // Standard
    2: 500_000,     // Enhanced
    3: Infinity,    // Institutional
};

/**
 * Convert API's string KYC level to numeric on-chain level.
 * Delegates to @fabrknt/accredit-core's kycLevelFromString.
 */
function kycLevelToOnChain(level: KycLevel): number {
    return sdkKycLevelFromString(level as any) as number;
}

/**
 * Check if a jurisdiction bitmask allows a specific jurisdiction.
 */
export function isJurisdictionInBitmask(bitmask: number, jurisdiction: number): boolean {
    return (bitmask & (1 << jurisdiction)) !== 0;
}

/**
 * Check if a jurisdiction is allowed in a bitmask (convenience wrapper).
 */
export function isJurisdictionAllowed(bitmask: number, jurisdiction: number): boolean {
    return isJurisdictionInBitmask(bitmask, jurisdiction);
}

/**
 * Build a jurisdiction bitmask from an array of jurisdiction values.
 */
export function buildJurisdictionBitmask(jurisdictions: number[]): number {
    let bitmask = 0;
    for (const j of jurisdictions) {
        bitmask |= 1 << j;
    }
    return bitmask;
}

// ---------------------------------------------------------------------------
// Whitelist management (on-chain KYC registry)
// ---------------------------------------------------------------------------

const whitelistStore = new Map<string, WhitelistEntry>();

/**
 * Register a wallet in the whitelist (on-chain registry equivalent).
 */
export async function addToWhitelist(entry: WhitelistEntry): Promise<WhitelistEntry> {
    whitelistStore.set(entry.wallet.toLowerCase(), entry);
    return entry;
}

/**
 * Remove a wallet from the whitelist.
 */
export async function removeFromWhitelist(wallet: string): Promise<boolean> {
    return whitelistStore.delete(wallet.toLowerCase());
}

/**
 * Get a whitelist entry.
 */
export async function getWhitelistEntry(wallet: string): Promise<WhitelistEntry | null> {
    return whitelistStore.get(wallet.toLowerCase()) || null;
}

/**
 * Check compliance for a wallet against on-chain KYC registry rules.
 */
export async function checkOnChainCompliance(params: {
    wallet: string;
    requiredKycLevel?: number;
    jurisdictionBitmask?: number;
    tradeAmountUsd?: number;
}): Promise<ComplianceCheckResult> {
    const { wallet, requiredKycLevel = 0, jurisdictionBitmask, tradeAmountUsd } = params;
    const entry = whitelistStore.get(wallet.toLowerCase());
    const flags: string[] = [];

    if (!entry) {
        return {
            wallet,
            compliant: false,
            kycLevel: 0,
            jurisdictionAllowed: false,
            tradeLimitUsd: 0,
            flags: ["Wallet not found in KYC registry"],
        };
    }

    // Check KYC level
    const levelMet = entry.kycLevel >= requiredKycLevel;
    if (!levelMet) flags.push(`KYC level ${entry.kycLevel} below required ${requiredKycLevel}`);

    // Check expiration
    if (entry.expiresAt < Date.now()) {
        flags.push("KYC verification has expired");
    }

    // Check jurisdiction
    let jurisdictionAllowed = true;
    if (jurisdictionBitmask !== undefined) {
        jurisdictionAllowed = (entry.jurisdictionBitmask & jurisdictionBitmask) !== 0;
        if (!jurisdictionAllowed) flags.push("Jurisdiction not allowed");
    }

    // Check trade limit
    const tradeLimit = KYC_TRADE_LIMITS_MAP[entry.kycLevel] ?? 0;
    if (tradeAmountUsd !== undefined && tradeAmountUsd > tradeLimit) {
        flags.push(`Trade amount $${tradeAmountUsd} exceeds KYC level limit of $${tradeLimit}`);
    }

    const compliant = levelMet && jurisdictionAllowed && entry.expiresAt > Date.now() && flags.length === 0;

    return {
        wallet,
        compliant,
        kycLevel: entry.kycLevel,
        jurisdictionAllowed,
        tradeLimitUsd: tradeLimit,
        flags,
    };
}

// ---------------------------------------------------------------------------
// Blacklist management (SSS-2 compliance)
// ---------------------------------------------------------------------------

const blacklistStore = new Map<string, BlacklistEntry>();

/**
 * Add a wallet to the blacklist.
 */
export async function addToBlacklist(params: {
    wallet: string;
    reason: string;
    source: string;
}): Promise<BlacklistEntry> {
    const entry: BlacklistEntry = {
        wallet: params.wallet.toLowerCase(),
        reason: params.reason,
        blacklistedAt: Date.now(),
        source: params.source,
    };
    blacklistStore.set(entry.wallet, entry);
    return entry;
}

/**
 * Remove a wallet from the blacklist.
 */
export async function removeFromBlacklist(wallet: string): Promise<boolean> {
    return blacklistStore.delete(wallet.toLowerCase());
}

/**
 * Check if a wallet is blacklisted.
 */
export async function isBlacklisted(wallet: string): Promise<BlacklistEntry | null> {
    return blacklistStore.get(wallet.toLowerCase()) || null;
}

/**
 * List all blacklisted wallets.
 */
export async function listBlacklist(params?: {
    source?: string;
    limit?: number;
}): Promise<BlacklistEntry[]> {
    let entries = Array.from(blacklistStore.values());
    if (params?.source) entries = entries.filter((e) => e.source === params.source);
    return entries.slice(0, params?.limit || 100);
}

// ---------------------------------------------------------------------------
// Compliant Wrapper — KYC-gated asset wrapping
// ---------------------------------------------------------------------------

const wrapperConfigStore = new Map<string, WrapperConfig>();

/**
 * Create a new wrapper configuration for KYC-gated asset wrapping.
 */
export async function createWrapperConfig(params: {
    authority: string;
    underlyingMint: string;
    kycRegistry: string;
    minKycLevel?: number;
    feeBps?: number;
    feeRecipient: string;
}): Promise<WrapperConfig> {
    const wrappedMint = `wrapped_${params.underlyingMint.slice(0, 8)}_${randomUUID().slice(0, 8)}`;
    const vault = `vault_${params.underlyingMint.slice(0, 8)}_${randomUUID().slice(0, 8)}`;

    const config: WrapperConfig = {
        authority: params.authority,
        underlyingMint: params.underlyingMint,
        wrappedMint,
        vault,
        kycRegistry: params.kycRegistry,
        totalWrapped: BigInt(0),
        isActive: true,
        minKycLevel: (params.minKycLevel ?? 0) as any,
        feeBps: params.feeBps ?? 30, // 0.3% default
        feeRecipient: params.feeRecipient,
        createdAt: BigInt(Date.now()),
        updatedAt: BigInt(Date.now()),
        bump: 0,
        wrappedMintBump: 0,
    };

    wrapperConfigStore.set(params.underlyingMint.toLowerCase(), config);
    return config;
}

/**
 * Get wrapper config for an underlying mint.
 */
export async function getWrapperConfig(underlyingMint: string): Promise<WrapperConfig | null> {
    return wrapperConfigStore.get(underlyingMint.toLowerCase()) || null;
}

/**
 * Wrap underlying tokens into compliant wrapped tokens.
 * Requires the wallet to be in the KYC registry at the required level.
 */
export async function wrapTokens(request: WrapRequest): Promise<WrapResult> {
    const config = wrapperConfigStore.get(request.underlyingMint.toLowerCase());
    if (!config) {
        return { success: false, wrappedAmount: BigInt(0), fee: BigInt(0), wrappedMint: "" };
    }

    if (!config.isActive) {
        return { success: false, wrappedAmount: BigInt(0), fee: BigInt(0), wrappedMint: config.wrappedMint };
    }

    // Check KYC
    const whitelistEntry = whitelistStore.get(request.wallet.toLowerCase());
    if (!whitelistEntry || whitelistEntry.kycLevel < config.minKycLevel) {
        return { success: false, wrappedAmount: BigInt(0), fee: BigInt(0), wrappedMint: config.wrappedMint };
    }

    // Check expiration
    if (whitelistEntry.expiresAt < Date.now()) {
        return { success: false, wrappedAmount: BigInt(0), fee: BigInt(0), wrappedMint: config.wrappedMint };
    }

    // Calculate fee
    const fee = (request.amount * BigInt(config.feeBps)) / BigInt(10000);
    const wrappedAmount = request.amount - fee;

    // Update state
    config.totalWrapped += wrappedAmount;
    config.updatedAt = BigInt(Date.now());

    return {
        success: true,
        wrappedAmount,
        fee,
        wrappedMint: config.wrappedMint,
    };
}

/**
 * Unwrap compliant wrapped tokens back into underlying tokens.
 */
export async function unwrapTokens(request: UnwrapRequest): Promise<WrapResult> {
    const config = wrapperConfigStore.get(request.underlyingMint.toLowerCase());
    if (!config) {
        return { success: false, wrappedAmount: BigInt(0), fee: BigInt(0), wrappedMint: "" };
    }

    // Check KYC
    const whitelistEntry = whitelistStore.get(request.wallet.toLowerCase());
    if (!whitelistEntry || whitelistEntry.kycLevel < config.minKycLevel) {
        return { success: false, wrappedAmount: BigInt(0), fee: BigInt(0), wrappedMint: config.wrappedMint };
    }

    // Calculate fee
    const fee = (request.amount * BigInt(config.feeBps)) / BigInt(10000);
    const underlyingAmount = request.amount - fee;

    // Update state
    config.totalWrapped -= request.amount;
    if (config.totalWrapped < BigInt(0)) config.totalWrapped = BigInt(0);
    config.updatedAt = BigInt(Date.now());

    return {
        success: true,
        wrappedAmount: underlyingAmount,
        fee,
        wrappedMint: config.wrappedMint,
    };
}

// ---------------------------------------------------------------------------
// Pool Compliance
// ---------------------------------------------------------------------------

const poolComplianceStore = new Map<string, PoolComplianceEntry>();

/**
 * Register a pool's compliance configuration.
 */
export async function registerPoolCompliance(entry: PoolComplianceEntry): Promise<PoolComplianceEntry> {
    poolComplianceStore.set(entry.poolAddress.toLowerCase(), entry);
    return entry;
}

/**
 * Check if a wallet can participate in a pool.
 */
export async function checkPoolAccess(params: {
    wallet: string;
    poolAddress: string;
}): Promise<{ allowed: boolean; reason: string }> {
    const pool = poolComplianceStore.get(params.poolAddress.toLowerCase());
    if (!pool) return { allowed: false, reason: "Pool not registered" };
    if (pool.status !== "active") return { allowed: false, reason: `Pool status: ${pool.status}` };
    if (pool.currentParticipants >= pool.maxParticipants) return { allowed: false, reason: "Pool at capacity" };

    // Check wallet's whitelist entry
    const entry = whitelistStore.get(params.wallet.toLowerCase());
    if (!entry) return { allowed: false, reason: "Wallet not in KYC registry" };
    if (entry.kycLevel < pool.minKycLevel) return { allowed: false, reason: `KYC level ${entry.kycLevel} below pool minimum ${pool.minKycLevel}` };
    if ((entry.jurisdictionBitmask & pool.allowedJurisdictions) === 0) return { allowed: false, reason: "Jurisdiction not allowed for this pool" };
    if (entry.expiresAt < Date.now()) return { allowed: false, reason: "KYC verification expired" };

    return { allowed: true, reason: "Access granted" };
}

// ---------------------------------------------------------------------------
// Multi-provider KYC verification
// ---------------------------------------------------------------------------

const kycProviderConfigs: Map<KycProvider, KycProviderConfig> = new Map();

/**
 * Configure a KYC verification provider.
 */
export function configureKycProvider(config: KycProviderConfig): void {
    kycProviderConfigs.set(config.provider, config);
}

/**
 * Verify KYC via an external provider.
 * In production, calls the provider's API. Here we simulate the verification flow.
 */
export async function verifyKycWithProvider(request: KycVerificationRequest): Promise<KycVerificationResult> {
    const config = kycProviderConfigs.get(request.provider);
    if (!config || !config.enabled) {
        return {
            wallet: request.wallet,
            provider: request.provider,
            verified: false,
            kycLevel: "none",
            confidence: 0,
            verifiedAt: Date.now(),
            expiresAt: 0,
            error: `Provider ${request.provider} not configured or disabled`,
        };
    }

    if (!config.apiKey && request.provider !== "manual") {
        return {
            wallet: request.wallet,
            provider: request.provider,
            verified: false,
            kycLevel: "none",
            confidence: 0,
            verifiedAt: Date.now(),
            expiresAt: 0,
            error: `No API key configured for ${request.provider}`,
        };
    }

    // Provider-specific verification logic
    switch (request.provider) {
        case "civic": {
            // Civic Gateway pass verification
            if (!config.endpoint) {
                return simulateProviderVerification(request, "https://api.civic.com/gateway/v1");
            }
            return callProviderApi(request, config);
        }
        case "worldid": {
            // World ID proof verification
            if (!config.endpoint) {
                return simulateProviderVerification(request, "https://developer.worldcoin.org/api/v1");
            }
            return callProviderApi(request, config);
        }
        case "synaps":
        case "sumsub": {
            if (!config.endpoint) {
                return simulateProviderVerification(request, `https://api.${request.provider}.com/v1`);
            }
            return callProviderApi(request, config);
        }
        case "manual":
        default:
            return simulateProviderVerification(request, "manual");
    }
}

async function callProviderApi(
    request: KycVerificationRequest,
    config: KycProviderConfig,
): Promise<KycVerificationResult> {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(`${config.endpoint}/verify`, {
            method: "POST",
            signal: controller.signal,
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify({
                wallet: request.wallet,
                jurisdiction: request.jurisdiction,
                documentType: request.documentType,
            }),
        });
        clearTimeout(timeout);

        if (!response.ok) {
            const errorText = await response.text();
            return {
                wallet: request.wallet,
                provider: request.provider,
                verified: false,
                kycLevel: "none",
                confidence: 0,
                verifiedAt: Date.now(),
                expiresAt: 0,
                error: `Provider API error: ${response.status} ${errorText}`,
            };
        }

        const data = await response.json() as {
            verified: boolean;
            level?: string;
            confidence?: number;
            expires_at?: number;
        };

        const kycLevel = data.level === "institutional" ? "institutional"
            : data.level === "enhanced" ? "enhanced"
                : data.level === "basic" ? "basic"
                    : "basic";

        const now = Date.now();
        return {
            wallet: request.wallet,
            provider: request.provider,
            verified: data.verified,
            kycLevel: data.verified ? kycLevel : "none",
            confidence: data.confidence ?? (data.verified ? 90 : 0),
            verifiedAt: now,
            expiresAt: data.expires_at || now + 365 * 24 * 60 * 60 * 1000,
        };
    } catch (error: any) {
        return {
            wallet: request.wallet,
            provider: request.provider,
            verified: false,
            kycLevel: "none",
            confidence: 0,
            verifiedAt: Date.now(),
            expiresAt: 0,
            error: `Provider API unavailable: ${error.message}`,
        };
    }
}

function simulateProviderVerification(
    request: KycVerificationRequest,
    _endpoint: string,
): KycVerificationResult {
    // Simulation for development/testing
    const now = Date.now();
    return {
        wallet: request.wallet,
        provider: request.provider,
        verified: true,
        kycLevel: "basic",
        confidence: 85,
        verifiedAt: now,
        expiresAt: now + 365 * 24 * 60 * 60 * 1000,
    };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const accredit = {
    // Original API
    screenIdentity,
    checkJurisdiction,
    verifyAccreditation,
    checkTransfer,
    registerKyc,

    // On-chain KYC registry
    isJurisdictionInBitmask,
    isJurisdictionAllowed,
    buildJurisdictionBitmask,
    addToWhitelist,
    removeFromWhitelist,
    getWhitelistEntry,
    checkOnChainCompliance,

    // Blacklist (SSS-2)
    addToBlacklist,
    removeFromBlacklist,
    isBlacklisted,
    listBlacklist,

    // Compliant wrapper
    createWrapperConfig,
    getWrapperConfig,
    wrapTokens,
    unwrapTokens,

    // Pool compliance
    registerPoolCompliance,
    checkPoolAccess,

    // Multi-provider KYC
    configureKycProvider,
    verifyKycWithProvider,
};
