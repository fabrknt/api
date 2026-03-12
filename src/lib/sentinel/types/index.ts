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
    | "unchecked_external_call"
    | "proxy_manipulation"
    | "selfdestruct_abuse"
    | "approval_exploitation"
    | "governance_manipulation";

export type RiskLevel = "safe" | "low" | "medium" | "high" | "critical";

export interface ThreatDetection {
    type: ThreatType;
    confidence: number; // 0-100
    description: string;
    recommendation: string;
    patternId?: string;
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
    bytecodeAnalysis?: BytecodeAnalysis;
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

// ---------------------------------------------------------------------------
// Pattern IDs — derived from @sentinel/core PatternId enum values
// ---------------------------------------------------------------------------

import { PatternId as SdkPatternId, Severity as SdkSeverity } from "@sentinel/core";

/**
 * All known pattern IDs as string union.
 * The SDK uses a string enum with the same values, so we use the enum's
 * value type directly. This keeps backward compatibility with API consumers
 * who expect plain string values.
 */
export type PatternId = `${SdkPatternId}`;

export type Severity = `${SdkSeverity}`;

export interface SecurityWarning {
    patternId: PatternId;
    severity: Severity;
    message: string;
    affectedAccount?: string;
    timestamp: number;
}

// ---------------------------------------------------------------------------
// Simulation types — re-exported from @sentinel/core
// ---------------------------------------------------------------------------

export type {
    SimulationConfig,
    SimulationResult,
    StateChange,
    BalanceChange,
} from "@sentinel/core";

// ---------------------------------------------------------------------------
// Bytecode analysis types
// ---------------------------------------------------------------------------

export interface BytecodeAnalysis {
    hasDelegatecall: boolean;
    hasSelfDestruct: boolean;
    hasCreate2: boolean;
    codeSize: number;
    isProxy: boolean;
}

// ---------------------------------------------------------------------------
// Bundle types — re-exported from @sentinel/core
// ---------------------------------------------------------------------------

export {
    FlashbotsNetwork,
} from "@sentinel/core";

export type {
    FlashbotsBundle,
    MevShareBundle,
    BundleResult,
    BundleStatusResponse,
} from "@sentinel/core";

// ---------------------------------------------------------------------------
// Honeypot analysis types
// ---------------------------------------------------------------------------

export interface HoneypotAnalysis {
    isHoneypot: boolean;
    buyTax: number;
    sellTax: number;
    reason?: string;
}

// ---------------------------------------------------------------------------
// Oracle registry types (from @sentinel/core oracle-registry.ts)
// ---------------------------------------------------------------------------

export interface OracleRegistryConfig {
    rpcUrl: string;
}

// Re-export Chainlink denomination constants from @sentinel/core
import { DENOMINATIONS } from "@sentinel/core";
export const CHAINLINK_DENOMINATIONS = DENOMINATIONS;
