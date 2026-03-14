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
// On-chain KYC types — imported from @fabrknt/accredit-core
// ---------------------------------------------------------------------------

import {
    KycLevel as SdkKycLevel,
    Jurisdiction as SdkJurisdiction,
    kycLevelToString,
    kycLevelFromString,
    jurisdictionToString,
    jurisdictionFromString,
} from "@fabrknt/accredit-core";
import type {
    KycLevelString,
    JurisdictionString,
} from "@fabrknt/accredit-core";

/**
 * On-chain KYC level enum — re-exported from @fabrknt/accredit-core.
 * Basic=0, Standard=1, Enhanced=2, Institutional=3.
 */
export const OnChainKycLevel = SdkKycLevel;
export type OnChainKycLevel = SdkKycLevel;

/**
 * On-chain Jurisdiction enum — re-exported from @fabrknt/accredit-core.
 * Used for jurisdiction bitmask checks in the registry program.
 */
export const OnChainJurisdiction = SdkJurisdiction;
export type OnChainJurisdiction = SdkJurisdiction;

// Re-export SDK conversion utilities so API code can bridge between
// the string-based KycLevel/Jurisdiction and numeric enums.
export {
    kycLevelToString,
    kycLevelFromString,
    jurisdictionToString,
    jurisdictionFromString,
};
export type { KycLevelString, JurisdictionString };

/**
 * KYC trade limits per level (USD).
 * The SDK uses bigint limits in smallest units; the API uses USD numbers.
 * We maintain the API's simplified USD-denominated limits for backward compatibility.
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
// Compliant wrapper types (from @fabrknt/accredit-core)
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
// Pool compliance types (from @fabrknt/accredit-core)
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
