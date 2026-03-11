export type Jurisdiction = "MAS" | "SFC" | "FSA" | "SEC" | "FCA" | "FINMA" | "BaFin";

export type KycLevel = "none" | "basic" | "enhanced" | "institutional";

export type InvestorType = "retail" | "accredited" | "institutional" | "qualified_purchaser";

export interface IdentityScreenResult {
    address: string;
    kycLevel: KycLevel;
    investorType: InvestorType;
    jurisdictions: Jurisdiction[];
    verified: boolean;
    verifiedAt: number | null;
    expiresAt: number | null;
    flags: string[];
}

export interface JurisdictionCheckResult {
    address: string;
    jurisdiction: Jurisdiction;
    allowed: boolean;
    restrictions: string[];
    requiredKycLevel: KycLevel;
    currentKycLevel: KycLevel;
    reason: string;
}

export interface AccreditationResult {
    address: string;
    investorType: InvestorType;
    accredited: boolean;
    qualifications: string[];
    jurisdiction: Jurisdiction;
    verifiedAt: number | null;
    expiresAt: number | null;
}

export interface TransferCheckResult {
    from: string;
    to: string;
    allowed: boolean;
    reason: string;
    requiredActions: string[];
}

// ---------------------------------------------------------------------------
// On-chain KYC types (from @accredit/core)
// ---------------------------------------------------------------------------

/**
 * On-chain KYC level enum (matches Solana program's u8 values).
 * Basic=0, Standard=1, Enhanced=2, Institutional=3.
 */
export enum OnChainKycLevel {
    Basic = 0,
    Standard = 1,
    Enhanced = 2,
    Institutional = 3,
}

/**
 * On-chain Jurisdiction enum (matches Solana program's bitmask values).
 * Used for jurisdiction bitmask checks in the registry program.
 */
export enum OnChainJurisdiction {
    Japan = 0,
    Singapore = 1,
    HongKong = 2,
    EU = 3,
    US = 4,
    Other = 5,
}

/**
 * KYC trade limits per level (USD).
 * From @accredit/core — maps on-chain KYC level to max trade size.
 */
export const KYC_TRADE_LIMITS: Record<number, number> = {
    [OnChainKycLevel.Basic]: 1_000,
    [OnChainKycLevel.Standard]: 50_000,
    [OnChainKycLevel.Enhanced]: 500_000,
    [OnChainKycLevel.Institutional]: Infinity,
};

/**
 * Whitelist entry in the on-chain KYC registry.
 */
export interface WhitelistEntry {
    wallet: string;
    kycLevel: OnChainKycLevel;
    jurisdictionBitmask: number;
    verifiedAt: number;
    expiresAt: number;
    provider: string;
}

/**
 * Blacklist entry for SSS-2 compliance.
 */
export interface BlacklistEntry {
    wallet: string;
    reason: string;
    blacklistedAt: number;
    source: string;
}

/**
 * Result of an on-chain compliance check.
 */
export interface ComplianceCheckResult {
    wallet: string;
    compliant: boolean;
    kycLevel: OnChainKycLevel;
    jurisdictionAllowed: boolean;
    tradeLimitUsd: number;
    flags: string[];
}

// ---------------------------------------------------------------------------
// Compliant wrapper types (from @accredit/core)
// ---------------------------------------------------------------------------

/**
 * On-chain WrapperConfig deserialized (chain-agnostic).
 * Represents a KYC-gated wrapped asset configuration.
 */
export interface WrapperConfig {
    authority: string;
    underlyingMint: string;
    wrappedMint: string;
    vault: string;
    kycRegistry: string;
    totalWrapped: bigint;
    isActive: boolean;
    minKycLevel: OnChainKycLevel;
    feeBps: number;
    feeRecipient: string;
    createdAt: bigint;
    updatedAt: bigint;
    bump: number;
    wrappedMintBump: number;
}

/**
 * Request to wrap underlying tokens into compliant wrapped tokens.
 */
export interface WrapRequest {
    wallet: string;
    underlyingMint: string;
    amount: bigint;
}

/**
 * Request to unwrap compliant wrapped tokens back into underlying tokens.
 */
export interface UnwrapRequest {
    wallet: string;
    underlyingMint: string;
    amount: bigint;
}

/**
 * Result of a wrap or unwrap operation.
 */
export interface WrapResult {
    success: boolean;
    wrappedAmount: bigint;
    fee: bigint;
    wrappedMint: string;
    txSignature?: string;
}

// ---------------------------------------------------------------------------
// Pool compliance types (from @accredit/core)
// ---------------------------------------------------------------------------

export enum PoolStatus {
    Active = "active",
    Paused = "paused",
    Deprecated = "deprecated",
}

export interface PoolComplianceEntry {
    poolAddress: string;
    status: PoolStatus;
    allowedJurisdictions: number; // bitmask
    minKycLevel: OnChainKycLevel;
    maxParticipants: number;
    currentParticipants: number;
}

export interface ZkComplianceProof {
    proof: Uint8Array;
    publicInputs: Uint8Array[];
    circuit: string;
    verifiedAt?: number;
}

// ---------------------------------------------------------------------------
// Multi-provider KYC types
// ---------------------------------------------------------------------------

export type KycProvider = "civic" | "worldid" | "synaps" | "sumsub" | "manual";

export interface KycProviderConfig {
    provider: KycProvider;
    apiKey?: string;
    endpoint?: string;
    enabled: boolean;
}

export interface KycVerificationRequest {
    wallet: string;
    provider: KycProvider;
    jurisdiction: Jurisdiction;
    documentType?: string;
}

export interface KycVerificationResult {
    wallet: string;
    provider: KycProvider;
    verified: boolean;
    kycLevel: KycLevel;
    confidence: number;
    verifiedAt: number;
    expiresAt: number;
    error?: string;
}
