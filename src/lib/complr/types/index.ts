// Jurisdiction type — imported from @complr/core (identical definition)
import type { Jurisdiction as SdkJurisdiction } from "@complr/core";
export type Jurisdiction = SdkJurisdiction;

export interface WalletScreenResult {
    address: string;
    riskScore: number;
    riskLevel: "low" | "medium" | "high";
    riskFactors: string[];
    jurisdictions: Jurisdiction[];
    screenedAt: number;
    cleared: boolean;
}

export interface PoolComplianceResult {
    protocol: string;
    poolId: string;
    compliant: boolean;
    flags: string[];
    jurisdictionResults: Array<{
        jurisdiction: Jurisdiction;
        compliant: boolean;
        notes: string[];
    }>;
    screenedAt: number;
}

export interface ComplianceAlert {
    type: "unverified_protocol" | "concentration_risk" | "regulatory_change" | "sanctions_match";
    severity: "critical" | "warning" | "info";
    protocol: string;
    poolId: string;
    message: string;
    recommendation: string;
}
