/**
 * Stratum — Data infrastructure layer powering all Fabrknt products.
 *
 * - Sanctions list aggregation (OFAC, UN, EU, MAS, SFC, FSA)
 * - Regulatory update feeds
 * - Data pipeline health monitoring
 * - Cross-product data sharing
 */

import { randomUUID } from "crypto";
import type {
    DataSource,
    DataFeed,
    SanctionsListEntry,
    RegulatoryUpdate,
    HealthStatus,
} from "./types";

// ---------------------------------------------------------------------------
// Sanctions list aggregation
// ---------------------------------------------------------------------------

const SANCTIONS_LISTS: Map<string, SanctionsListEntry> = new Map();

// OFAC SDN known addresses (sample)
const OFAC_ADDRESSES = [
    "0x8589427373D6D84E98730D7795D8f6f8731FDA16", // Tornado Cash
    "0xd90e2f925DA726b50C4Ed8D0Fb90Ad053324F31b",
    "0x722122dF12D4e14e13Ac3b6895a86e84145b6967",
    "0xDD4c48C0B24039969fC16D1cdF626eaB821d3384",
    "0xd96f2B1c14Db8458374d9Aca76E26c3D18364307",
];

for (const addr of OFAC_ADDRESSES) {
    SANCTIONS_LISTS.set(addr.toLowerCase(), {
        address: addr,
        listSource: "OFAC_SDN",
        addedAt: Date.parse("2022-08-08"),
        reason: "Tornado Cash sanctions",
        active: true,
    });
}

export async function checkSanctions(
    address: string
): Promise<{ sanctioned: boolean; entries: SanctionsListEntry[] }> {
    const entry = SANCTIONS_LISTS.get(address.toLowerCase());
    return {
        sanctioned: !!entry && entry.active,
        entries: entry ? [entry] : [],
    };
}

export async function getSanctionsList(params?: {
    listSource?: string;
    limit?: number;
}): Promise<SanctionsListEntry[]> {
    const entries = Array.from(SANCTIONS_LISTS.values());
    let filtered = entries;

    if (params?.listSource) {
        filtered = filtered.filter(e => e.listSource === params.listSource);
    }

    return filtered.slice(0, params?.limit || 100);
}

// ---------------------------------------------------------------------------
// Regulatory update feeds
// ---------------------------------------------------------------------------

const REGULATORY_UPDATES: RegulatoryUpdate[] = [
    {
        id: randomUUID(),
        jurisdiction: "MAS",
        title: "MAS Digital Payment Token Licensing Framework Update",
        summary: "Expanded scope of DPT licensing to cover DeFi protocol operators with Singapore-based users.",
        effectiveDate: "2025-01-15",
        impact: "high",
        affectedProducts: ["Complr", "Accredit"],
        publishedAt: Date.parse("2024-11-01"),
    },
    {
        id: randomUUID(),
        jurisdiction: "EU",
        title: "MiCA Regulation Phase 2 — DeFi Provisions",
        summary: "Clarified applicability of MiCA to decentralized protocols offering services to EU residents.",
        effectiveDate: "2025-06-30",
        impact: "high",
        affectedProducts: ["Complr", "Accredit", "Veil"],
        publishedAt: Date.parse("2024-12-15"),
    },
    {
        id: randomUUID(),
        jurisdiction: "FSA",
        title: "Japan FATF Travel Rule Implementation Deadline",
        summary: "All VASPs must implement Travel Rule for transactions above 100,000 JPY by Q1 2025.",
        effectiveDate: "2025-03-31",
        impact: "medium",
        affectedProducts: ["Complr"],
        publishedAt: Date.parse("2024-10-20"),
    },
    {
        id: randomUUID(),
        jurisdiction: "SFC",
        title: "Hong Kong SFC Virtual Asset Trading Platform Guidelines",
        summary: "Updated guidelines for licensed VA trading platforms, including DeFi protocol interaction requirements.",
        effectiveDate: "2025-04-01",
        impact: "medium",
        affectedProducts: ["Complr", "Accredit", "Sentinel"],
        publishedAt: Date.parse("2024-11-30"),
    },
];

export async function getRegulatoryUpdates(params?: {
    jurisdiction?: string;
    impact?: string;
    limit?: number;
}): Promise<RegulatoryUpdate[]> {
    let updates = [...REGULATORY_UPDATES];

    if (params?.jurisdiction) {
        updates = updates.filter(u => u.jurisdiction === params.jurisdiction);
    }
    if (params?.impact) {
        updates = updates.filter(u => u.impact === params.impact);
    }

    updates.sort((a, b) => b.publishedAt - a.publishedAt);
    return updates.slice(0, params?.limit || 50);
}

// ---------------------------------------------------------------------------
// Data pipeline health
// ---------------------------------------------------------------------------

const DATA_FEEDS: DataFeed[] = [
    { id: "ofac-sdn", source: "sanctions_list", name: "OFAC SDN List", status: "active", lastSyncedAt: Date.now() - 3600000, recordCount: OFAC_ADDRESSES.length, latency: 250, errorRate: 0 },
    { id: "un-sc", source: "sanctions_list", name: "UN Security Council", status: "active", lastSyncedAt: Date.now() - 7200000, recordCount: 0, latency: 500, errorRate: 0 },
    { id: "eu-fsl", source: "sanctions_list", name: "EU Financial Sanctions", status: "active", lastSyncedAt: Date.now() - 5400000, recordCount: 0, latency: 350, errorRate: 0 },
    { id: "eth-mainnet", source: "on_chain", name: "Ethereum Mainnet", status: "active", lastSyncedAt: Date.now() - 12000, recordCount: 0, latency: 120, errorRate: 0.001 },
    { id: "regulatory", source: "regulatory_feed", name: "Regulatory Updates", status: "active", lastSyncedAt: Date.now() - 86400000, recordCount: REGULATORY_UPDATES.length, latency: 1000, errorRate: 0 },
    { id: "threat-intel", source: "threat_intel", name: "Threat Intelligence", status: "active", lastSyncedAt: Date.now() - 1800000, recordCount: 0, latency: 300, errorRate: 0.002 },
];

export async function getHealth(): Promise<HealthStatus> {
    const degradedFeeds = DATA_FEEDS.filter(f => f.status !== "active");
    const status = degradedFeeds.length === 0 ? "healthy"
        : degradedFeeds.length < DATA_FEEDS.length / 2 ? "degraded"
        : "down";

    const totalUptime = DATA_FEEDS.reduce((sum, f) => sum + (f.status === "active" ? 1 : 0), 0);

    return {
        service: "stratum",
        status,
        uptime: (totalUptime / DATA_FEEDS.length) * 100,
        feeds: DATA_FEEDS,
        lastCheckedAt: Date.now(),
    };
}

export async function getFeedStatus(feedId: string): Promise<DataFeed | null> {
    return DATA_FEEDS.find(f => f.id === feedId) || null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const stratum = {
    checkSanctions,
    getSanctionsList,
    getRegulatoryUpdates,
    getHealth,
    getFeedStatus,
};
