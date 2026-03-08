export type ThreatType =
    | "reentrancy"
    | "flash_loan"
    | "sandwich"
    | "mev"
    | "oracle_manipulation"
    | "price_manipulation"
    | "front_running"
    | "back_running"
    | "rug_pull"
    | "access_control"
    | "integer_overflow"
    | "unchecked_external_call";

export type RiskLevel = "safe" | "low" | "medium" | "high" | "critical";

export interface ThreatDetection {
    type: ThreatType;
    confidence: number; // 0-100
    description: string;
    recommendation: string;
}

export interface TransactionAnalysis {
    txHash?: string;
    from: string;
    to: string;
    value: string;
    chain: string;
    riskLevel: RiskLevel;
    riskScore: number; // 0-100
    threats: ThreatDetection[];
    gasAnalysis: {
        estimatedGas: number;
        gasWarning: string | null;
    };
    simulationResult: "success" | "revert" | "unknown";
    analyzedAt: number;
}

export interface ContractAnalysis {
    address: string;
    chain: string;
    verified: boolean;
    riskLevel: RiskLevel;
    riskScore: number;
    vulnerabilities: ThreatDetection[];
    metadata: {
        name: string | null;
        compiler: string | null;
        proxy: boolean;
        upgradeableProxy: boolean;
    };
    analyzedAt: number;
}

export interface MevAnalysis {
    txHash: string;
    chain: string;
    mevDetected: boolean;
    mevType: string | null;
    estimatedExtraction: string | null;
    recommendation: string;
}
