export type ProofType =
    | "kyc_compliant"      // Prove KYC without revealing identity
    | "jurisdiction_clear" // Prove jurisdiction eligibility
    | "sanctions_clear"    // Prove not on sanctions lists
    | "accredited"         // Prove accredited investor status
    | "age_verified"       // Prove age without revealing DOB
    | "aml_clear";         // Prove AML check passed

export type PrivacyFramework = "GDPR" | "APPI" | "PDPA" | "CCPA";

export interface ComplianceProof {
    proofId: string;
    proofType: ProofType;
    address: string;
    valid: boolean;
    issuedAt: number;
    expiresAt: number;
    verifierContract: string | null;
    proofHash: string;
}

export interface EncryptedRecord {
    recordId: string;
    encryptedData: string;
    dataHash: string;
    algorithm: string;
    createdAt: number;
    expiresAt: number | null;
    accessPolicy: string[];
}

export interface PrivacyAssessment {
    address: string;
    frameworks: PrivacyFramework[];
    compliant: boolean;
    dataCategories: DataCategory[];
    recommendations: string[];
    assessedAt: number;
}

export interface DataCategory {
    category: string;
    encrypted: boolean;
    retentionDays: number;
    purpose: string;
    framework: PrivacyFramework;
    compliant: boolean;
}

export interface ConsentRecord {
    address: string;
    purpose: string;
    framework: PrivacyFramework;
    granted: boolean;
    grantedAt: number | null;
    expiresAt: number | null;
}
