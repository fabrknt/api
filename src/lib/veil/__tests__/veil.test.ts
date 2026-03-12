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

    // -----------------------------------------------------------------------
    // New features: ZK Compression
    // -----------------------------------------------------------------------

    describe("estimateCompressionSavings (ZK Compression)", () => {
        it("returns significant savings for typical data sizes", () => {
            const result = veil.estimateCompressionSavings(128);
            expect(result.uncompressedCost).toBeGreaterThan(result.compressedCost);
            expect(result.savings).toBeGreaterThan(BigInt(0));
            expect(result.savingsPercent).toBeGreaterThan(90);
        });

        it("compressed cost is always 5000 lamports", () => {
            const small = veil.estimateCompressionSavings(32);
            const large = veil.estimateCompressionSavings(1024);
            expect(small.compressedCost).toBe(BigInt(5000));
            expect(large.compressedCost).toBe(BigInt(5000));
        });

        it("uncompressed cost scales with data size", () => {
            const small = veil.estimateCompressionSavings(64);
            const large = veil.estimateCompressionSavings(256);
            expect(large.uncompressedCost).toBeGreaterThan(small.uncompressedCost);
        });

        it("accepts custom lamports-per-byte rate", () => {
            const defaultRate = veil.estimateCompressionSavings(128);
            const customRate = veil.estimateCompressionSavings(128, 10000);
            expect(customRate.uncompressedCost).toBeGreaterThan(defaultRate.uncompressedCost);
        });
    });

    // -----------------------------------------------------------------------
    // New features: Shielded Transfers
    // -----------------------------------------------------------------------

    describe("estimateShieldedFee (Shielded Transfers)", () => {
        it("returns a fee for SOL transfers", () => {
            const fee = veil.estimateShieldedFee("SOL");
            expect(fee).toBeGreaterThan(BigInt(0));
        });

        it("returns a fee for USDC transfers", () => {
            const fee = veil.estimateShieldedFee("USDC");
            expect(fee).toBeGreaterThan(BigInt(0));
        });

        it("returns a fee for USDT transfers", () => {
            const fee = veil.estimateShieldedFee("USDT");
            expect(fee).toBeGreaterThan(BigInt(0));
        });

        it("fee includes base fee and relayer fee", () => {
            const fee = veil.estimateShieldedFee("SOL");
            expect(fee).toBe(BigInt(2_000_000)); // 1M base + 1M relayer
        });
    });

    // -----------------------------------------------------------------------
    // New features: Encrypted Swap Orders (Payload Schemas)
    // -----------------------------------------------------------------------

    describe("calculateSchemaSize (Encrypted Swap Orders)", () => {
        it("calculates swap order schema size correctly", () => {
            const size = veil.calculateSchemaSize(veil.SWAP_ORDER_SCHEMA);
            // u64(8) + u16(2) + i64(8) + bytes(6) = 24
            expect(size).toBe(24);
        });

        it("calculates RWA asset schema size correctly", () => {
            const size = veil.calculateSchemaSize(veil.RWA_ASSET_SCHEMA);
            // u8(1) + u64(8) + u8(1) + u8(1) + u8(1) + u32(4) + i64(8) + i64(8) + bytes(3) + bytes(2) = 37
            expect(size).toBe(37);
        });

        it("calculates RWA access grant schema size", () => {
            const size = veil.calculateSchemaSize(veil.RWA_ACCESS_GRANT_SCHEMA);
            // u8(1) + i64(8) + i64(8) + u8(1) + i64(8) = 26
            expect(size).toBe(26);
        });

        it("handles empty schema", () => {
            const size = veil.calculateSchemaSize({ fields: [] });
            expect(size).toBe(0);
        });
    });

    // -----------------------------------------------------------------------
    // New features: NaCl Box Encryption
    // -----------------------------------------------------------------------

    describe("generateEncryptionKeypair", () => {
        it("generates 32-byte key pairs", () => {
            const kp = veil.generateEncryptionKeypair();
            expect(kp.publicKey).toBeInstanceOf(Uint8Array);
            expect(kp.secretKey).toBeInstanceOf(Uint8Array);
            expect(kp.publicKey.length).toBe(32);
            expect(kp.secretKey.length).toBe(32);
        });

        it("generates unique keypairs each time", () => {
            const kp1 = veil.generateEncryptionKeypair();
            const kp2 = veil.generateEncryptionKeypair();
            expect(Buffer.from(kp1.secretKey).toString("hex"))
                .not.toBe(Buffer.from(kp2.secretKey).toString("hex"));
        });
    });

    describe("deriveEncryptionKeypair", () => {
        it("derives deterministic keypairs from seed", () => {
            const seed = new Uint8Array(32).fill(42);
            const kp1 = veil.deriveEncryptionKeypair(seed);
            const kp2 = veil.deriveEncryptionKeypair(seed);
            expect(Buffer.from(kp1.publicKey).toString("hex"))
                .toBe(Buffer.from(kp2.publicKey).toString("hex"));
        });
    });

    describe("encryptionKeyToBase58 / encryptionKeyToHex", () => {
        it("converts key to base58 string", () => {
            const kp = veil.generateEncryptionKeypair();
            const b58 = veil.encryptionKeyToBase58(kp.publicKey);
            expect(typeof b58).toBe("string");
            expect(b58.length).toBeGreaterThan(0);
        });

        it("converts key to hex string with 0x prefix", () => {
            const kp = veil.generateEncryptionKeypair();
            const hex = veil.encryptionKeyToHex(kp.publicKey);
            expect(hex.startsWith("0x")).toBe(true);
            expect(hex.length).toBe(66); // 0x + 64 hex chars
        });
    });

    // -----------------------------------------------------------------------
    // New features: Threshold Secret Sharing
    // -----------------------------------------------------------------------

    describe("splitSecret / combineShares", () => {
        it("splits a 32-byte secret into shares", () => {
            const secret = new Uint8Array(32).fill(7);
            const shares = veil.splitSecret(secret, 3, 5);
            expect(shares).toHaveLength(5);
            shares.forEach((s) => {
                expect(s.value).toBeInstanceOf(Uint8Array);
                expect(s.value.length).toBe(32);
                expect(s.index).toBeGreaterThan(0);
            });
        });

        it("throws for non-32-byte secret", () => {
            expect(() => veil.splitSecret(new Uint8Array(16), 2, 3))
                .toThrow("Secret must be 32 bytes");
        });

        it("throws for threshold < 2", () => {
            expect(() => veil.splitSecret(new Uint8Array(32), 1, 3))
                .toThrow("Threshold must be at least 2");
        });

        it("throws for totalShares < threshold", () => {
            expect(() => veil.splitSecret(new Uint8Array(32), 5, 3))
                .toThrow("Total shares must be >= threshold");
        });

        it("throws for > 255 shares", () => {
            expect(() => veil.splitSecret(new Uint8Array(32), 2, 256))
                .toThrow("Maximum 255 shares");
        });

        it("combineShares requires at least 2 shares", () => {
            const secret = new Uint8Array(32).fill(1);
            const shares = veil.splitSecret(secret, 2, 3);
            expect(() => veil.combineShares([shares[0]])).toThrow("At least 2 shares required");
        });

        it("combineShares returns a 32-byte result", () => {
            const secret = new Uint8Array(32).fill(1);
            const shares = veil.splitSecret(secret, 2, 3);
            const combined = veil.combineShares([shares[0], shares[1]]);
            expect(combined).toBeInstanceOf(Uint8Array);
            expect(combined.length).toBe(32);
        });
    });

    describe("createThresholdEncryption", () => {
        it("encrypts a secret and returns shares", () => {
            const secret = new Uint8Array(32).fill(99);
            const result = veil.createThresholdEncryption(secret, 2, 3);
            expect(result.encryptedSecret).toBeInstanceOf(Uint8Array);
            expect(result.encryptedSecret.length).toBe(32);
            expect(result.keyShares).toHaveLength(3);
        });
    });

    // -----------------------------------------------------------------------
    // Constants
    // -----------------------------------------------------------------------

    describe("NOIR_CIRCUITS", () => {
        it("exposes known Noir circuit identifiers", () => {
            expect(veil.NOIR_CIRCUITS).toContain("swap_validity");
            expect(veil.NOIR_CIRCUITS).toContain("order_commitment");
            expect(veil.NOIR_CIRCUITS.length).toBeGreaterThanOrEqual(6);
        });
    });

    describe("RPC_ENV_VARS / PUBLIC_RPC_ENDPOINTS", () => {
        it("contains RPC env var names", () => {
            expect(veil.RPC_ENV_VARS.HELIUS_API_KEY).toBe("HELIUS_API_KEY");
        });

        it("contains public endpoints for all networks", () => {
            expect(veil.PUBLIC_RPC_ENDPOINTS["mainnet-beta"]).toContain("solana.com");
            expect(veil.PUBLIC_RPC_ENDPOINTS.devnet).toContain("solana.com");
        });
    });
});
