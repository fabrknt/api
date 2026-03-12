export type DataSource =
    | "on_chain"
    | "sanctions_list"
    | "kyc_provider"
    | "threat_intel"
    | "regulatory_feed"
    | "audit_report"
    | "market_data";

export type PipelineStatus = "active" | "paused" | "error" | "syncing";

export interface DataFeed {
    id: string;
    source: DataSource;
    name: string;
    status: PipelineStatus;
    lastSyncedAt: number | null;
    recordCount: number;
    latency: number; // ms
    errorRate: number; // 0-1
}

export interface SanctionsListEntry {
    address: string;
    listSource: string; // "OFAC_SDN" | "UN_SC" | "EU_FSL" | "MAS" | "SFC" | "FSA"
    addedAt: number;
    reason: string;
    active: boolean;
}

export interface RegulatoryUpdate {
    id: string;
    jurisdiction: string;
    title: string;
    summary: string;
    effectiveDate: string;
    impact: "high" | "medium" | "low";
    affectedProducts: string[];
    publishedAt: number;
}

export interface HealthStatus {
    service: string;
    status: "healthy" | "degraded" | "down";
    uptime: number; // percentage
    feeds: DataFeed[];
    lastCheckedAt: number;
}

// ---------------------------------------------------------------------------
// Order book types — OrderSide imported from @stratum/core
// ---------------------------------------------------------------------------

import { OrderSide } from "@stratum/core";
export { OrderSide };

export interface OrderLeaf {
    price: bigint;
    qty: bigint;
    side: OrderSide;
    owner: Uint8Array;
    nonce: bigint;
}

export interface MerkleProof {
    leaf: Uint8Array;
    siblings: Uint8Array[];
    index: number;
    root: Uint8Array;
}

export type HashFunction = "poseidon" | "sha256" | "keccak256";

// ---------------------------------------------------------------------------
// ZK types (from @stratum/core)
// ---------------------------------------------------------------------------

export interface ZKCircuitConfig {
    name: string;
    description: string;
    inputCount: number;
    backend: "snarkjs" | "mock";
}

export interface ZKProof {
    proof: Uint8Array;
    publicInputs: Uint8Array[];
    circuit: string;
    verifiedAt?: number;
}

export interface ZKVerificationResult {
    valid: boolean;
    circuit: string;
    verifiedAt: number;
    error?: string;
}

// ---------------------------------------------------------------------------
// DA (Data Availability) types (from @stratum/core)
// ---------------------------------------------------------------------------

export type DAProvider = "celestia" | "avail" | "eigenDA" | "memory";

export interface DAConfig {
    provider: DAProvider;
    endpoint?: string;
    authToken?: string;
    namespace?: string;
    /** Maximum blob size in bytes */
    maxBlobSize?: number;
    /** Submission timeout in ms */
    timeout?: number;
}

export interface DASubmissionResult {
    success: boolean;
    provider: DAProvider;
    blobId?: string;
    blockHeight?: number;
    commitment?: Uint8Array;
    error?: string;
    submittedAt: number;
}

export interface DARetrievalResult {
    success: boolean;
    provider: DAProvider;
    data?: Uint8Array;
    error?: string;
    retrievedAt: number;
}

// ---------------------------------------------------------------------------
// Cranker registry types (from @stratum/core)
// ---------------------------------------------------------------------------

export interface CrankerEntry {
    id: string;
    publicKey: string;
    stake: bigint;
    registeredAt: number;
    lastHeartbeat: number;
    successCount: number;
    failCount: number;
    status: "active" | "challenged" | "slashed" | "inactive";
}

export interface CrankerChallenge {
    id: string;
    crankerId: string;
    challengerKey: string;
    reason: string;
    evidence?: string;
    status: "pending" | "resolved" | "rejected";
    createdAt: number;
    resolvedAt?: number;
}

// ---------------------------------------------------------------------------
// Cleanup estimator types
// ---------------------------------------------------------------------------

export interface CleanupEstimate {
    expiredOrders: number;
    reclaimableSpace: number; // bytes
    estimatedCost: bigint;    // lamports or wei
    estimatedSavings: bigint; // rent reclaimed
    netBenefit: bigint;
}
