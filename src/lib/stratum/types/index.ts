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
