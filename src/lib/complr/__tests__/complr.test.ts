import { describe, it, expect } from "vitest";
import { complr } from "../index";

describe("Complr — Off-chain Compliance Screening", () => {
    // -----------------------------------------------------------------------
    // Human-in-the-loop review queue
    // -----------------------------------------------------------------------

    describe("submitReview / approveReview / rejectReview / escalateReview", () => {
        it("submits a review item with pending status", () => {
            const item = complr.submitReview({
                type: "check",
                decision: { address: "0xabc", action: "block" },
                metadata: { address: "0xabc", riskLevel: "high" },
            });

            expect(item.id).toMatch(/^rv_/);
            expect(item.status).toBe("pending");
            expect(item.type).toBe("check");
            expect(item.createdAt).toBeTruthy();
        });

        it("auto-assigns priority based on type and risk level", () => {
            const critical = complr.submitReview({
                type: "screen",
                decision: {},
                metadata: { riskLevel: "critical" },
            });
            expect(critical.priority).toBe("critical");

            const high = complr.submitReview({
                type: "screen",
                decision: {},
                metadata: { riskLevel: "high" },
            });
            expect(high.priority).toBe("high");

            const low = complr.submitReview({
                type: "check",
                decision: {},
                metadata: { riskLevel: "low" },
            });
            expect(low.priority).toBe("low");
        });

        it("allows manual priority override", () => {
            const item = complr.submitReview({
                type: "check",
                decision: {},
                priority: "critical",
            });
            expect(item.priority).toBe("critical");
        });

        it("approves a review item", () => {
            const item = complr.submitReview({ type: "check", decision: {} });
            const approved = complr.approveReview(item.id, "reviewer-1", "Looks good");

            expect(approved).toBeDefined();
            expect(approved!.status).toBe("approved");
            expect(approved!.reviewerId).toBe("reviewer-1");
            expect(approved!.reviewerNotes).toBe("Looks good");
            expect(approved!.reviewedAt).toBeTruthy();
        });

        it("rejects a review item", () => {
            const item = complr.submitReview({ type: "screen", decision: {} });
            const rejected = complr.rejectReview(item.id, "reviewer-2", "Suspicious activity");

            expect(rejected).toBeDefined();
            expect(rejected!.status).toBe("rejected");
        });

        it("escalates a review item", () => {
            const item = complr.submitReview({ type: "report", decision: {} });
            const escalated = complr.escalateReview(item.id, "reviewer-3", "Needs senior review");

            expect(escalated).toBeDefined();
            expect(escalated!.status).toBe("escalated");
        });

        it("returns undefined for non-existent review ID", () => {
            const result = complr.approveReview("rv_nonexistent", "reviewer-1");
            expect(result).toBeUndefined();
        });
    });

    describe("getReviewById / queryReviews", () => {
        it("retrieves a review by ID", () => {
            const item = complr.submitReview({ type: "check", decision: { foo: "bar" } });
            const fetched = complr.getReviewById(item.id);

            expect(fetched).toBeDefined();
            expect(fetched!.id).toBe(item.id);
        });

        it("queries reviews by status", () => {
            complr.submitReview({ type: "check", decision: {} });
            const result = complr.queryReviews({ status: "pending" });
            expect(result.items.length).toBeGreaterThan(0);
            expect(result.items.every((i) => i.status === "pending")).toBe(true);
        });

        it("queries reviews by type", () => {
            complr.submitReview({ type: "report", decision: {} });
            const result = complr.queryReviews({ type: "report" });
            expect(result.items.length).toBeGreaterThan(0);
            expect(result.items.every((i) => i.type === "report")).toBe(true);
        });

        it("respects limit and offset", () => {
            for (let i = 0; i < 5; i++) {
                complr.submitReview({ type: "check", decision: { i } });
            }
            const page1 = complr.queryReviews({ limit: 2, offset: 0 });
            expect(page1.items.length).toBeLessThanOrEqual(2);
        });
    });

    describe("getReviewStats", () => {
        it("returns aggregate statistics", () => {
            const stats = complr.getReviewStats();
            expect(stats.total).toBeGreaterThan(0);
            expect(typeof stats.pending).toBe("number");
            expect(typeof stats.approved).toBe("number");
            expect(typeof stats.rejected).toBe("number");
            expect(typeof stats.escalated).toBe("number");
            expect(stats.byPriority).toBeDefined();
        });
    });

    // -----------------------------------------------------------------------
    // External screening providers
    // -----------------------------------------------------------------------

    describe("registerTrmLabsProvider / registerChainalysisProvider", () => {
        it("registers TRM Labs provider without error", () => {
            expect(() =>
                complr.registerTrmLabsProvider({ apiKey: "test-trm-key" })
            ).not.toThrow();
        });

        it("registers Chainalysis provider without error", () => {
            expect(() =>
                complr.registerChainalysisProvider({ apiKey: "test-chainalysis-key" })
            ).not.toThrow();
        });
    });

    // -----------------------------------------------------------------------
    // Confidence scoring (tested via screenWallet integration)
    // -----------------------------------------------------------------------

    describe("screenWallet (confidence scoring)", () => {
        it("screens a clean wallet with low risk", async () => {
            const result = await complr.screenWallet(
                "7nYBVMnJGDYzHWj2yARcVqkCzFhF7h3bGGNZjF4oiENm",
            );
            expect(result.riskScore).toBeLessThanOrEqual(30);
            expect(result.cleared).toBe(true);
        });

        it("flags invalid address format", async () => {
            const result = await complr.screenWallet("short");
            expect(result.riskScore).toBeGreaterThan(0);
            expect(result.riskFactors.some((f) => f.includes("Invalid"))).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // Batch checks
    // -----------------------------------------------------------------------

    describe("batchScreenWallets", () => {
        it("screens multiple wallets at once", async () => {
            const result = await complr.batchScreenWallets([
                "7nYBVMnJGDYzHWj2yARcVqkCzFhF7h3bGGNZjF4oiENm",
                "DRpbCBMxVnDK7maPM5tGv6MvB3v1sRMC86PZ8okm21hy",
            ]);

            expect(result.results).toHaveLength(2);
            expect(result.summary.total).toBe(2);
            expect(typeof result.summary.cleared).toBe("number");
            expect(typeof result.summary.flagged).toBe("number");
            expect(typeof result.summary.highRisk).toBe("number");
        });

        it("summary counts match results", async () => {
            const result = await complr.batchScreenWallets([
                "7nYBVMnJGDYzHWj2yARcVqkCzFhF7h3bGGNZjF4oiENm",
            ]);

            expect(result.summary.cleared + result.summary.flagged).toBe(result.summary.total);
        });
    });

    // -----------------------------------------------------------------------
    // Webhooks
    // -----------------------------------------------------------------------

    describe("registerWebhook / listWebhooks", () => {
        it("registers a webhook and lists it", () => {
            const wh = complr.registerWebhook(
                "api-key-1",
                "https://example.com/hook",
                ["check.completed", "screen.high_risk"],
                "webhook-secret",
            );

            expect(wh.id).toMatch(/^wh_/);
            expect(wh.active).toBe(true);
            expect(wh.events).toContain("check.completed");

            const list = complr.listWebhooks("api-key-1");
            expect(list.some((w) => w.id === wh.id)).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // Rate limiting
    // -----------------------------------------------------------------------

    describe("checkRateLimit", () => {
        it("allows requests within the limit", () => {
            expect(complr.checkRateLimit("test-key-rl-1", 60)).toBe(true);
        });

        it("blocks requests exceeding the limit", () => {
            const key = "test-key-rl-blocked";
            for (let i = 0; i < 5; i++) {
                complr.checkRateLimit(key, 5);
            }
            expect(complr.checkRateLimit(key, 5)).toBe(false);
        });
    });
});
