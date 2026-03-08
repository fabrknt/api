import { describe, it, expect } from "vitest";
import { stratum } from "../index";

describe("Stratum — Data Infrastructure", () => {
    describe("checkSanctions", () => {
        it("detects sanctioned Tornado Cash address", async () => {
            const result = await stratum.checkSanctions(
                "0x8589427373D6D84E98730D7795D8f6f8731FDA16",
            );

            expect(result.sanctioned).toBe(true);
            expect(result.entries).toHaveLength(1);
            expect(result.entries[0].listSource).toBe("OFAC_SDN");
            expect(result.entries[0].reason).toContain("Tornado Cash");
        });

        it("is case-insensitive", async () => {
            const upper = await stratum.checkSanctions(
                "0x8589427373D6D84E98730D7795D8F6F8731FDA16",
            );
            const lower = await stratum.checkSanctions(
                "0x8589427373d6d84e98730d7795d8f6f8731fda16",
            );

            expect(upper.sanctioned).toBe(true);
            expect(lower.sanctioned).toBe(true);
        });

        it("clears non-sanctioned addresses", async () => {
            const result = await stratum.checkSanctions(
                "0x1111111111111111111111111111111111111111",
            );

            expect(result.sanctioned).toBe(false);
            expect(result.entries).toHaveLength(0);
        });

        it("returns source info", async () => {
            const result = await stratum.checkSanctions("0xabc");
            expect(result.source).toBeTruthy();
        });

        it("detects Lazarus Group address", async () => {
            const result = await stratum.checkSanctions(
                "0x098B716B8Aaf21512996dC57EB0615e2383E2f96",
            );

            expect(result.sanctioned).toBe(true);
            expect(result.entries[0].reason).toContain("Lazarus");
        });
    });

    describe("getSanctionsList", () => {
        it("returns all known sanctioned addresses", async () => {
            const result = await stratum.getSanctionsList();
            expect(result.length).toBeGreaterThanOrEqual(10);
        });

        it("filters by list source", async () => {
            const result = await stratum.getSanctionsList({ listSource: "OFAC_SDN" });
            expect(result.every((e) => e.listSource === "OFAC_SDN")).toBe(true);
        });

        it("respects limit", async () => {
            const result = await stratum.getSanctionsList({ limit: 3 });
            expect(result.length).toBeLessThanOrEqual(3);
        });
    });

    describe("getRegulatoryUpdates", () => {
        it("returns regulatory updates", async () => {
            const result = await stratum.getRegulatoryUpdates();
            expect(result.length).toBeGreaterThan(0);
            expect(result[0].jurisdiction).toBeTruthy();
            expect(result[0].impact).toBeTruthy();
        });

        it("filters by jurisdiction", async () => {
            const result = await stratum.getRegulatoryUpdates({ jurisdiction: "MAS" });
            expect(result.every((u) => u.jurisdiction === "MAS")).toBe(true);
        });

        it("filters by impact", async () => {
            const result = await stratum.getRegulatoryUpdates({ impact: "high" });
            expect(result.every((u) => u.impact === "high")).toBe(true);
        });

        it("returns sorted by date descending", async () => {
            const result = await stratum.getRegulatoryUpdates();
            for (let i = 1; i < result.length; i++) {
                expect(result[i - 1].publishedAt).toBeGreaterThanOrEqual(result[i].publishedAt);
            }
        });
    });

    describe("getHealth", () => {
        it("returns health status", async () => {
            const result = await stratum.getHealth();
            expect(result.service).toBe("stratum");
            expect(["healthy", "degraded", "down"]).toContain(result.status);
            expect(result.feeds.length).toBeGreaterThan(0);
            expect(result.uptime).toBeGreaterThan(0);
        });

        it("includes Solana feed", async () => {
            const result = await stratum.getHealth();
            expect(result.feeds.some((f) => f.name.includes("Solana"))).toBe(true);
        });
    });

    describe("getFeedStatus", () => {
        it("returns status for known feed", async () => {
            const result = await stratum.getFeedStatus("ofac-sdn");
            expect(result).not.toBeNull();
            expect(result!.name).toContain("OFAC");
        });

        it("returns null for unknown feed", async () => {
            const result = await stratum.getFeedStatus("nonexistent");
            expect(result).toBeNull();
        });
    });
});
