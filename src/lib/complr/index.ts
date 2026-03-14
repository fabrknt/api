/**
 * Complr — Off-chain compliance screening for DeFi.
 *
 * Self-contained implementation reflecting @fabrknt/complr-core capabilities:
 * - Screen wallets against sanctions lists with confidence scoring
 * - External screening providers (TRM Labs, Chainalysis)
 * - Human-in-the-loop review queue for compliance decisions
 * - Check pools/protocols against regulatory frameworks
 * - Generate compliance alerts for portfolio allocations
 * - Batch compliance checks
 * - Webhook delivery with HMAC signatures
 * - Rate limiting per API key
 * - SDK with batch checks and webhooks
 */

import { randomBytes, createHmac } from "crypto";
import type {
    Jurisdiction,
    WalletScreenResult,
    PoolComplianceResult,
    ComplianceAlert,
} from "./types";
import { stratum } from "../stratum";

// ---------------------------------------------------------------------------
// Screening provider registry (reflects @fabrknt/complr-core policy/screening-provider.ts)
// ---------------------------------------------------------------------------

export interface ScreeningHit {
    provider: string;
    matchType: "exact" | "fuzzy";
    sanctionedEntity: string;
    program: string;
    listEntry: string;
    confidence: number; // 0-1
}

export interface ScreeningProvider {
    name: string;
    lastRefreshed?: string;
    screen(address: string, chain?: string): ScreeningHit[];
}

class ScreeningRegistry {
    private providers: ScreeningProvider[] = [];

    register(provider: ScreeningProvider): void {
        this.providers.push(provider);
    }

    screenAll(address: string, chain?: string): ScreeningHit[] {
        const hits: ScreeningHit[] = [];
        for (const provider of this.providers) {
            hits.push(...provider.screen(address, chain));
        }
        return hits;
    }

    get providerCount(): number {
        return this.providers.length;
    }
}

const screeningRegistry = new ScreeningRegistry();

// ---------------------------------------------------------------------------
// External screening providers (reflects @fabrknt/complr-core policy/trm-provider.ts
// and chainalysis-provider.ts)
// ---------------------------------------------------------------------------

/**
 * Register a TRM Labs screening provider.
 * In production, this calls the TRM /v2/screening/addresses endpoint.
 */
export function registerTrmLabsProvider(config: {
    apiKey: string;
    baseUrl?: string;
}): void {
    const provider: ScreeningProvider = {
        name: "TRM Labs",
        screen(address: string, chain?: string): ScreeningHit[] {
            // In production, calls TRM Labs API
            // POST {baseUrl}/v2/screening/addresses
            // Returns risk indicators translated to ScreeningHit objects
            return [];
        },
    };
    screeningRegistry.register(provider);
}

/**
 * Register a Chainalysis screening provider.
 */
export function registerChainalysisProvider(config: {
    apiKey: string;
    baseUrl?: string;
}): void {
    const provider: ScreeningProvider = {
        name: "Chainalysis",
        screen(address: string, chain?: string): ScreeningHit[] {
            // In production, calls Chainalysis KYT API
            return [];
        },
    };
    screeningRegistry.register(provider);
}

// ---------------------------------------------------------------------------
// Human-in-the-loop review queue (reflects @fabrknt/complr-core review/queue.ts)
// ---------------------------------------------------------------------------

export interface ReviewItem {
    id: string;
    type: "check" | "screen" | "report";
    status: "pending" | "approved" | "rejected" | "escalated";
    priority: "low" | "medium" | "high" | "critical";
    createdAt: string;
    updatedAt: string;
    reviewedAt?: string;
    reviewerId?: string;
    reviewerNotes?: string;
    decision: unknown;
    metadata: {
        transactionId?: string;
        address?: string;
        jurisdiction?: string;
        riskLevel?: string;
        apiKeyId?: string;
        organizationId?: string;
    };
}

export interface ReviewStats {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    escalated: number;
    avgReviewTimeMs: number;
    byPriority: Record<string, number>;
}

const REVIEW_STORE = new Map<string, ReviewItem>();

function autoPriority(
    type: ReviewItem["type"],
    metadata?: ReviewItem["metadata"],
): ReviewItem["priority"] {
    const riskLevel = metadata?.riskLevel;
    if (type === "screen" && riskLevel === "critical") return "critical";
    if (type === "screen" && riskLevel === "high") return "high";
    if (type === "check" && riskLevel === "blocked") return "high";
    if (type === "check" && riskLevel === "requires_action") return "medium";
    if (type === "report") return "medium";
    return "low";
}

export function submitReview(params: {
    type: ReviewItem["type"];
    decision: unknown;
    metadata?: ReviewItem["metadata"];
    priority?: ReviewItem["priority"];
}): ReviewItem {
    const now = new Date().toISOString();
    const priority = params.priority ?? autoPriority(params.type, params.metadata);
    const item: ReviewItem = {
        id: `rv_${randomBytes(8).toString("hex")}`,
        type: params.type,
        status: "pending",
        priority,
        createdAt: now,
        updatedAt: now,
        decision: params.decision,
        metadata: params.metadata ?? {},
    };
    REVIEW_STORE.set(item.id, item);
    return item;
}

export function approveReview(id: string, reviewerId: string, notes?: string): ReviewItem | undefined {
    return resolveReview(id, "approved", reviewerId, notes);
}

export function rejectReview(id: string, reviewerId: string, notes?: string): ReviewItem | undefined {
    return resolveReview(id, "rejected", reviewerId, notes);
}

export function escalateReview(id: string, reviewerId: string, notes?: string): ReviewItem | undefined {
    return resolveReview(id, "escalated", reviewerId, notes);
}

function resolveReview(
    id: string,
    status: "approved" | "rejected" | "escalated",
    reviewerId: string,
    notes?: string,
): ReviewItem | undefined {
    const item = REVIEW_STORE.get(id);
    if (!item) return undefined;
    const now = new Date().toISOString();
    const updated: ReviewItem = {
        ...item,
        status,
        updatedAt: now,
        reviewedAt: now,
        reviewerId,
        reviewerNotes: notes,
    };
    REVIEW_STORE.set(id, updated);
    return updated;
}

export function getReviewById(id: string): ReviewItem | undefined {
    return REVIEW_STORE.get(id);
}

export function queryReviews(filters: {
    status?: ReviewItem["status"];
    priority?: ReviewItem["priority"];
    type?: ReviewItem["type"];
    limit?: number;
    offset?: number;
} = {}): { items: ReviewItem[]; total: number } {
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;
    let items = Array.from(REVIEW_STORE.values());
    if (filters.status) items = items.filter((i) => i.status === filters.status);
    if (filters.priority) items = items.filter((i) => i.priority === filters.priority);
    if (filters.type) items = items.filter((i) => i.type === filters.type);
    items.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
    const total = items.length;
    return { items: items.slice(offset, offset + limit), total };
}

export function getReviewStats(): ReviewStats {
    const all = Array.from(REVIEW_STORE.values());
    const resolved = all.filter((i) => i.reviewedAt);
    let avgReviewTimeMs = 0;
    if (resolved.length > 0) {
        const totalMs = resolved.reduce((sum, i) =>
            sum + (new Date(i.reviewedAt!).getTime() - new Date(i.createdAt).getTime()), 0);
        avgReviewTimeMs = Math.round(totalMs / resolved.length);
    }
    const byPriority: Record<string, number> = {};
    for (const item of all) {
        byPriority[item.priority] = (byPriority[item.priority] ?? 0) + 1;
    }
    return {
        total: all.length,
        pending: all.filter((i) => i.status === "pending").length,
        approved: all.filter((i) => i.status === "approved").length,
        rejected: all.filter((i) => i.status === "rejected").length,
        escalated: all.filter((i) => i.status === "escalated").length,
        avgReviewTimeMs,
        byPriority,
    };
}

// ---------------------------------------------------------------------------
// Webhook management (reflects @fabrknt/complr-core webhooks/manager.ts)
// ---------------------------------------------------------------------------

export type WebhookEvent = "check.completed" | "check.blocked" | "screen.high_risk" | "report.generated";

export interface WebhookRegistration {
    id: string;
    apiKeyId: string;
    url: string;
    events: WebhookEvent[];
    secret: string;
    createdAt: string;
    active: boolean;
    lastDeliveredAt?: string;
    failureCount: number;
}

const WEBHOOK_STORE = new Map<string, WebhookRegistration>();

export function registerWebhook(
    apiKeyId: string,
    url: string,
    events: WebhookEvent[],
    secret: string,
): WebhookRegistration {
    const id = `wh_${randomBytes(8).toString("hex")}`;
    const registration: WebhookRegistration = {
        id,
        apiKeyId,
        url,
        events,
        secret,
        createdAt: new Date().toISOString(),
        active: true,
        failureCount: 0,
    };
    WEBHOOK_STORE.set(id, registration);
    return registration;
}

export function listWebhooks(apiKeyId: string): WebhookRegistration[] {
    return Array.from(WEBHOOK_STORE.values()).filter(
        (w) => w.apiKeyId === apiKeyId && w.active,
    );
}

export async function deliverWebhook(event: WebhookEvent, data: unknown): Promise<void> {
    const payload = {
        id: `evt_${randomBytes(8).toString("hex")}`,
        event,
        timestamp: new Date().toISOString(),
        data,
    };

    const matching = Array.from(WEBHOOK_STORE.values()).filter(
        (w) => w.active && w.events.includes(event),
    );

    await Promise.allSettled(
        matching.map(async (wh) => {
            const body = JSON.stringify(payload);
            const signature = createHmac("sha256", wh.secret).update(body).digest("hex");
            try {
                const response = await fetch(wh.url, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-Complr-Signature": signature,
                        "X-Complr-Event": payload.event,
                        "X-Complr-Delivery": payload.id,
                    },
                    body,
                    signal: AbortSignal.timeout(10_000),
                });
                if (response.ok) {
                    wh.lastDeliveredAt = new Date().toISOString();
                    wh.failureCount = 0;
                } else {
                    wh.failureCount++;
                }
            } catch {
                wh.failureCount++;
                if (wh.failureCount >= 10) wh.active = false;
            }
        }),
    );
}

// ---------------------------------------------------------------------------
// Confidence scoring (reflects @fabrknt/complr-core regulatory/confidence.ts)
// ---------------------------------------------------------------------------

function computeConfidenceScore(
    sanctionsHits: boolean,
    externalHits: ScreeningHit[],
    addressValid: boolean,
): { score: number; level: "low" | "medium" | "high" | "critical" } {
    let score = 0;

    if (sanctionsHits) score += 60;
    if (!addressValid) score += 20;

    for (const hit of externalHits) {
        score += Math.round(hit.confidence * 30);
    }

    score = Math.min(score, 100);
    const level = score >= 80 ? "critical" : score >= 60 ? "high" : score >= 30 ? "medium" : "low";
    return { score, level };
}

// ---------------------------------------------------------------------------
// Rate limiting (reflects @fabrknt/complr-core api/rate-limit.ts)
// ---------------------------------------------------------------------------

const RATE_LIMIT_STORE = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(apiKeyId: string, maxPerMinute: number = 60): boolean {
    const now = Date.now();
    const entry = RATE_LIMIT_STORE.get(apiKeyId);

    if (!entry || now > entry.resetAt) {
        RATE_LIMIT_STORE.set(apiKeyId, { count: 1, resetAt: now + 60_000 });
        return true;
    }

    if (entry.count >= maxPerMinute) return false;
    entry.count++;
    return true;
}

// ---------------------------------------------------------------------------
// Wallet screening (enhanced with external providers + confidence scoring)
// ---------------------------------------------------------------------------

export async function screenWallet(
    address: string,
    jurisdictions: Jurisdiction[] = ["MAS", "FSA"],
): Promise<WalletScreenResult> {
    const riskFactors: string[] = [];
    let riskScore = 0;

    // Check address format validity
    const addressValid = address.length >= 32 && address.length <= 44;
    if (!addressValid) {
        riskFactors.push("Invalid address format");
        riskScore += 50;
    }

    // Check against Stratum sanctions data
    const sanctionsResult = await stratum.checkSanctions(address);
    if (sanctionsResult.sanctioned) {
        for (const entry of sanctionsResult.entries) {
            riskFactors.push(`Sanctioned: ${entry.listSource} — ${entry.reason}`);
            riskScore += 80;
        }
    }

    // Check external screening providers (TRM Labs, Chainalysis)
    const externalHits = screeningRegistry.screenAll(address);
    for (const hit of externalHits) {
        riskFactors.push(`${hit.provider}: ${hit.sanctionedEntity} (${hit.program}) — confidence ${Math.round(hit.confidence * 100)}%`);
        riskScore += Math.round(hit.confidence * 40);
    }

    // Confidence scoring
    const confidence = computeConfidenceScore(
        sanctionsResult.sanctioned,
        externalHits,
        addressValid,
    );

    // Jurisdiction-specific checks
    for (const j of jurisdictions) {
        const clean = !sanctionsResult.sanctioned;
        if (!clean) {
            riskFactors.push(`Flagged by ${j} sanctions list`);
            riskScore += 40;
        }
    }

    const finalScore = Math.min(riskScore, 100);

    // Auto-submit to review queue for high-risk results
    if (confidence.level === "high" || confidence.level === "critical") {
        submitReview({
            type: "screen",
            decision: { address, riskScore: finalScore, riskFactors },
            metadata: {
                address,
                riskLevel: confidence.level,
            },
        });
    }

    return {
        address,
        riskScore: finalScore,
        riskLevel: finalScore > 60 ? "high" : finalScore > 30 ? "medium" : "low",
        riskFactors,
        jurisdictions,
        screenedAt: Date.now(),
        cleared: finalScore < 30,
    };
}

// ---------------------------------------------------------------------------
// Batch screening (reflects @fabrknt/complr-core SDK batch checks)
// ---------------------------------------------------------------------------

export async function batchScreenWallets(
    addresses: string[],
    jurisdictions: Jurisdiction[] = ["MAS", "FSA"],
): Promise<{
    results: WalletScreenResult[];
    summary: { total: number; cleared: number; flagged: number; highRisk: number };
}> {
    const results = await Promise.all(
        addresses.map((addr) => screenWallet(addr, jurisdictions)),
    );

    return {
        results,
        summary: {
            total: results.length,
            cleared: results.filter((r) => r.cleared).length,
            flagged: results.filter((r) => !r.cleared).length,
            highRisk: results.filter((r) => r.riskLevel === "high").length,
        },
    };
}

// ---------------------------------------------------------------------------
// Pool / protocol compliance screening
// ---------------------------------------------------------------------------

const KNOWN_COMPLIANT_PROTOCOLS = new Set([
    "kamino", "marginfi", "save", "meteora", "raydium", "orca",
    "jupiter", "jito", "marinade", "sanctum", "drift", "solblaze",
]);

export async function screenPool(
    protocol: string,
    poolId: string,
    jurisdictions: Jurisdiction[] = ["MAS", "FSA"],
): Promise<PoolComplianceResult> {
    const flags: string[] = [];

    const isKnown = KNOWN_COMPLIANT_PROTOCOLS.has(protocol.toLowerCase());
    if (!isKnown) {
        flags.push(`Protocol "${protocol}" not in compliant registry`);
    }

    const jurisdictionResults = jurisdictions.map((j) => ({
        jurisdiction: j,
        compliant: isKnown,
        notes: isKnown ? [] : [`${protocol} not verified for ${j}`],
    }));

    return {
        protocol,
        poolId,
        compliant: flags.length === 0,
        flags,
        jurisdictionResults,
        screenedAt: Date.now(),
    };
}

// ---------------------------------------------------------------------------
// Allocation compliance alerts
// ---------------------------------------------------------------------------

export function checkAllocationCompliance(
    allocations: Array<{ protocol: string; poolId: string; percentage: number }>,
): ComplianceAlert[] {
    const alerts: ComplianceAlert[] = [];

    for (const alloc of allocations) {
        if (!KNOWN_COMPLIANT_PROTOCOLS.has(alloc.protocol.toLowerCase())) {
            alerts.push({
                type: "unverified_protocol",
                severity: "warning",
                protocol: alloc.protocol,
                poolId: alloc.poolId,
                message: `${alloc.protocol} is not in the verified protocol registry. Allocation: ${alloc.percentage}%`,
                recommendation: "Consider replacing with a verified protocol.",
            });
        }

        if (alloc.percentage > 40) {
            alerts.push({
                type: "concentration_risk",
                severity: "info",
                protocol: alloc.protocol,
                poolId: alloc.poolId,
                message: `${alloc.percentage}% allocation in ${alloc.protocol} exceeds concentration guidelines.`,
                recommendation: "Diversify across multiple protocols to reduce single-protocol risk.",
            });
        }
    }

    return alerts;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const complr = {
    // Original API (backward compatible)
    screenWallet,
    screenPool,
    checkAllocationCompliance,
    // New capabilities
    batchScreenWallets,
    registerTrmLabsProvider,
    registerChainalysisProvider,
    // Review queue
    submitReview,
    approveReview,
    rejectReview,
    escalateReview,
    getReviewById,
    queryReviews,
    getReviewStats,
    // Webhooks
    registerWebhook,
    listWebhooks,
    deliverWebhook,
    // Rate limiting
    checkRateLimit,
};
