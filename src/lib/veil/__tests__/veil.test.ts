import { describe, it, expect } from "vitest";
import { veil } from "../index";

describe("Veil — Privacy & Encryption", () => {
    describe("generateProof", () => {
        it("generates a valid proof", async () => {
            const result = await veil.generateProof({
                address: "0x1234",
                proofType: "kyc_compliant",
            });

            expect(result.proofId).toBeTruthy();
            expect(result.proofHash).toHaveLength(64); // SHA-256 hex
            expect(result.valid).toBe(true);
            expect(result.proofType).toBe("kyc_compliant");
            expect(result.expiresAt).toBeGreaterThan(result.issuedAt);
        });

        it("generates unique proofs for same input", async () => {
            const p1 = await veil.generateProof({ address: "0x1234", proofType: "kyc_compliant" });
            const p2 = await veil.generateProof({ address: "0x1234", proofType: "kyc_compliant" });

            expect(p1.proofId).not.toBe(p2.proofId);
            expect(p1.proofHash).not.toBe(p2.proofHash);
        });
    });

    describe("verifyProof", () => {
        it("verifies a valid proof", async () => {
            const proof = await veil.generateProof({
                address: "0x1234",
                proofType: "sanctions_clear",
            });

            const result = await veil.verifyProof({
                proofId: proof.proofId,
                proofHash: proof.proofHash,
            });

            expect(result.valid).toBe(true);
            expect(result.expired).toBe(false);
            expect(result.proofType).toBe("sanctions_clear");
        });

        it("rejects unknown proof ID", async () => {
            const result = await veil.verifyProof({
                proofId: "nonexistent",
                proofHash: "abc123",
            });

            expect(result.valid).toBe(false);
            expect(result.proofType).toBeNull();
        });

        it("rejects wrong proof hash", async () => {
            const proof = await veil.generateProof({
                address: "0x1234",
                proofType: "kyc_compliant",
            });

            const result = await veil.verifyProof({
                proofId: proof.proofId,
                proofHash: "wrong_hash",
            });

            expect(result.valid).toBe(false);
        });
    });

    describe("encryptData", () => {
        it("encrypts data with AES-256-GCM", async () => {
            const result = await veil.encryptData({
                data: "Sensitive PII: John Doe, Passport AB123456",
                accessPolicy: ["compliance_team"],
            });

            expect(result.algorithm).toBe("aes-256-gcm");
            expect(result.encryptedData).not.toContain("John Doe");
            expect(result.encryptedData).not.toContain("Passport");
            expect(result.dataHash).toHaveLength(64); // SHA-256
            expect(result.recordId).toBeTruthy();
        });

        it("produces different ciphertext for same plaintext", async () => {
            const r1 = await veil.encryptData({ data: "same data", accessPolicy: [] });
            const r2 = await veil.encryptData({ data: "same data", accessPolicy: [] });

            // Same plaintext hash
            expect(r1.dataHash).toBe(r2.dataHash);
            // Different ciphertext (different IV each time)
            expect(r1.encryptedData).not.toBe(r2.encryptedData);
        });

        it("sets expiry when requested", async () => {
            const result = await veil.encryptData({
                data: "test",
                accessPolicy: [],
                expiresInDays: 30,
            });

            expect(result.expiresAt).not.toBeNull();
            const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
            expect(result.expiresAt! - result.createdAt).toBeCloseTo(thirtyDaysMs, -3);
        });
    });

    describe("assessPrivacy", () => {
        it("flags unencrypted data under GDPR", async () => {
            const result = await veil.assessPrivacy({
                address: "0x1234",
                frameworks: ["GDPR"],
                dataCategories: [
                    { category: "wallet_address", encrypted: false, retentionDays: 365, purpose: "compliance" },
                ],
            });

            expect(result.compliant).toBe(false);
            expect(result.recommendations.some((r) => r.includes("encryption"))).toBe(true);
        });

        it("passes compliant encrypted data", async () => {
            const result = await veil.assessPrivacy({
                address: "0x1234",
                frameworks: ["CCPA"],
                dataCategories: [
                    { category: "wallet_address", encrypted: true, retentionDays: 30, purpose: "compliance" },
                ],
            });

            // CCPA doesn't require encryption or consent
            expect(result.compliant).toBe(true);
        });

        it("flags excessive retention", async () => {
            const result = await veil.assessPrivacy({
                address: "0x1234",
                frameworks: ["GDPR"],
                dataCategories: [
                    { category: "kyc_docs", encrypted: true, retentionDays: 999, purpose: "compliance" },
                ],
            });

            expect(result.recommendations.some((r) => r.includes("retention"))).toBe(true);
        });
    });

    describe("consent management", () => {
        it("records and retrieves consent", async () => {
            await veil.recordConsent({
                address: "0xConsent1",
                purpose: "marketing",
                framework: "GDPR",
                granted: true,
                expiresInDays: 365,
            });

            const records = await veil.getConsent({ address: "0xConsent1" });
            expect(records.length).toBeGreaterThan(0);
            expect(records[0].purpose).toBe("marketing");
            expect(records[0].granted).toBe(true);
        });

        it("filters by purpose", async () => {
            await veil.recordConsent({
                address: "0xConsent2", purpose: "analytics", framework: "GDPR", granted: true,
            });
            await veil.recordConsent({
                address: "0xConsent2", purpose: "marketing", framework: "GDPR", granted: false,
            });

            const analytics = await veil.getConsent({ address: "0xConsent2", purpose: "analytics" });
            expect(analytics).toHaveLength(1);
            expect(analytics[0].granted).toBe(true);
        });

        it("replaces existing consent for same purpose+framework", async () => {
            await veil.recordConsent({
                address: "0xConsent3", purpose: "tracking", framework: "APPI", granted: true,
            });
            await veil.recordConsent({
                address: "0xConsent3", purpose: "tracking", framework: "APPI", granted: false,
            });

            const records = await veil.getConsent({ address: "0xConsent3", purpose: "tracking" });
            expect(records).toHaveLength(1);
            expect(records[0].granted).toBe(false);
        });
    });
});
