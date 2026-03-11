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
// Pattern IDs (from @sentinel/core types.ts)
// ---------------------------------------------------------------------------

/**
 * All known pattern IDs.
 * Solana: P-101 through P-108
 * EVM: EVM-001 through EVM-009
 */
export type PatternId =
    // Solana patterns
    | "P-101"  // MintKill
    | "P-102"  // FreezeKill
    | "P-103"  // SignerMismatch
    | "P-104"  // DangerousClose
    | "P-105"  // MaliciousTransferHook
    | "P-106"  // UnexpectedHookExecution
    | "P-107"  // HookReentrancy
    | "P-108"  // ExcessiveHookAccounts
    // EVM patterns
    | "EVM-001" // ReentrancyAttack
    | "EVM-002" // FlashLoanAttack
    | "EVM-003" // FrontRunning
    | "EVM-004" // UnauthorizedAccess
    | "EVM-005" // ProxyManipulation
    | "EVM-006" // SelfdestructAbuse
    | "EVM-007" // ApprovalExploitation
    | "EVM-008" // OracleManipulation
    | "EVM-009"; // GovernanceManipulation

export type Severity = "critical" | "warning" | "alert";

export interface SecurityWarning {
    patternId: PatternId;
    severity: Severity;
    message: string;
    affectedAccount?: string;
    timestamp: number;
}

// ---------------------------------------------------------------------------
// Simulation types (from @sentinel/core types.ts)
// ---------------------------------------------------------------------------

export interface SimulationConfig {
    evmForkUrl?: string;
    solanaRpcUrl?: string;
    forkBlockNumber?: number;
    timeout?: number;
    traceStateDiffs?: boolean;
}

export interface SimulationResult {
    success: boolean;
    chain: string;
    gasUsed?: number;
    computeUnitsUsed?: number;
    stateChanges?: StateChange[];
    balanceChanges?: BalanceChange[];
    logs?: string[];
    error?: string;
    revertReason?: string;
}

export interface StateChange {
    address: string;
    slot?: string;
    previousValue?: string;
    newValue?: string;
}

export interface BalanceChange {
    address: string;
    token?: string;
    before: string;
    after: string;
    delta: string;
}

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
// Bundle types (from @sentinel/core types.ts)
// ---------------------------------------------------------------------------

export enum FlashbotsNetwork {
    Mainnet = "mainnet",
    Goerli = "goerli",
    Sepolia = "sepolia",
}

export interface FlashbotsBundle {
    transactions: string[];
    blockNumber: number;
    minTimestamp?: number;
    maxTimestamp?: number;
    revertingTxHashes?: string[];
}

export interface MevShareBundle {
    transactions: string[];
    blockNumber: number;
    privacy?: {
        hints?: ("calldata" | "contract_address" | "logs" | "function_selector" | "hash")[];
        builders?: string[];
    };
    validity?: {
        refund?: { bodyIdx: number; percent: number }[];
        refundConfig?: { address: string; percent: number }[];
    };
}

export interface BundleResult {
    bundleId: string;
    accepted: boolean;
    signatures?: string[];
    error?: string;
}

export interface BundleStatusResponse {
    status: "pending" | "landed" | "failed" | "invalid";
    landedSlot?: number;
    landedBlock?: number;
    transactions?: string[];
    error?: string;
}

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

export const CHAINLINK_DENOMINATIONS = {
    ETH: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
    BTC: "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB",
    USD: "0x0000000000000000000000000000000000000348",
} as const;
