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
