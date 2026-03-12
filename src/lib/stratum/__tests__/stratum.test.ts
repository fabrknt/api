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

    // -----------------------------------------------------------------------
    // New features: DA provider config
    // -----------------------------------------------------------------------

    describe("loadDAConfig / validateDAConfig", () => {
        it("loads memory provider by default", () => {
            const config = stratum.loadDAConfig();
            expect(config.provider).toBe("memory");
            expect(config.maxBlobSize).toBeGreaterThan(0);
        });

        it("validates memory config as valid", () => {
            const config = stratum.loadDAConfig();
            const result = stratum.validateDAConfig(config);
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it("flags missing endpoint for non-memory providers", () => {
            const result = stratum.validateDAConfig({ provider: "celestia" });
            expect(result.valid).toBe(false);
            expect(result.errors.some((e) => e.includes("endpoint"))).toBe(true);
        });

        it("flags missing auth token for non-memory providers", () => {
            const result = stratum.validateDAConfig({
                provider: "avail",
                endpoint: "https://avail.example.com",
            });
            expect(result.valid).toBe(false);
            expect(result.errors.some((e) => e.includes("auth token"))).toBe(true);
        });

        it("flags missing namespace for Celestia", () => {
            const result = stratum.validateDAConfig({
                provider: "celestia",
                endpoint: "https://celestia.example.com",
                authToken: "token",
            });
            expect(result.valid).toBe(false);
            expect(result.errors.some((e) => e.includes("namespace"))).toBe(true);
        });

        it("passes full Celestia config", () => {
            const result = stratum.validateDAConfig({
                provider: "celestia",
                endpoint: "https://celestia.example.com",
                authToken: "token",
                namespace: "fabrknt",
            });
            expect(result.valid).toBe(true);
        });
    });

    describe("submitToDA / retrieveFromDA (memory provider)", () => {
        it("submits and retrieves data from memory DA", async () => {
            const data = new Uint8Array([1, 2, 3, 4, 5]);
            const submitResult = await stratum.submitToDA(data, { provider: "memory" });

            expect(submitResult.success).toBe(true);
            expect(submitResult.provider).toBe("memory");
            expect(submitResult.blobId).toBeTruthy();
            expect(submitResult.commitment).toBeInstanceOf(Uint8Array);

            const retrieveResult = await stratum.retrieveFromDA(submitResult.blobId!, { provider: "memory" });
            expect(retrieveResult.success).toBe(true);
            expect(retrieveResult.data).toEqual(data);
        });

        it("returns error for non-existent blob", async () => {
            const result = await stratum.retrieveFromDA("nonexistent-blob", { provider: "memory" });
            expect(result.success).toBe(false);
            expect(result.error).toContain("not found");
        });
    });

    // -----------------------------------------------------------------------
    // New features: ZK Verifier
    // -----------------------------------------------------------------------

    describe("listZkCircuits / getZkCircuit", () => {
        it("lists available ZK circuits", () => {
            const circuits = stratum.listZkCircuits();
            expect(circuits.length).toBeGreaterThanOrEqual(3);
            expect(circuits.some((c) => c.name === "merkle_inclusion")).toBe(true);
            expect(circuits.some((c) => c.name === "state_transition")).toBe(true);
        });

        it("gets a specific circuit config", () => {
            const circuit = stratum.getZkCircuit("merkle_inclusion");
            expect(circuit).not.toBeNull();
            expect(circuit!.name).toBe("merkle_inclusion");
            expect(circuit!.inputCount).toBe(3);
            expect(circuit!.backend).toBe("snarkjs");
        });

        it("returns null for unknown circuit", () => {
            const circuit = stratum.getZkCircuit("nonexistent");
            expect(circuit).toBeNull();
        });
    });

    describe("generateZkProof / verifyZkProof", () => {
        it("generates a ZK proof for a known circuit", async () => {
            const proof = await stratum.generateZkProof({
                circuit: "merkle_inclusion",
                inputs: { leaf: 42, root: 100, path: 1 },
            });

            expect(proof.proof).toBeInstanceOf(Uint8Array);
            expect(proof.proof.length).toBeGreaterThan(0);
            expect(proof.circuit).toBe("merkle_inclusion");
            expect(proof.publicInputs.length).toBe(3);
        });

        it("throws for unknown circuit", async () => {
            await expect(
                stratum.generateZkProof({ circuit: "nonexistent", inputs: { x: 1 } }),
            ).rejects.toThrow("Unknown circuit");
        });

        it("verifies a valid proof", async () => {
            const proof = await stratum.generateZkProof({
                circuit: "state_transition",
                inputs: { old_root: 1, new_root: 2, operation: 0, proof: 99 },
            });

            const result = await stratum.verifyZkProof({ proof });
            expect(result.valid).toBe(true);
            expect(result.circuit).toBe("state_transition");
            expect(result.verifiedAt).toBeGreaterThan(0);
        });

        it("rejects proof with unknown circuit", async () => {
            const result = await stratum.verifyZkProof({
                proof: {
                    proof: new Uint8Array([1, 2, 3]),
                    publicInputs: [new Uint8Array([4])],
                    circuit: "fake_circuit",
                },
            });
            expect(result.valid).toBe(false);
            expect(result.error).toContain("Unknown circuit");
        });
    });

    describe("Merkle tree utilities", () => {
        it("builds Merkle root from leaves", () => {
            const leaves = [
                new Uint8Array(32).fill(1),
                new Uint8Array(32).fill(2),
            ];
            const root = stratum.buildMerkleRoot(leaves);
            expect(root).toBeInstanceOf(Uint8Array);
            expect(root.length).toBe(32);
        });

        it("returns empty root for empty leaves", () => {
            const root = stratum.buildMerkleRoot([]);
            expect(root.length).toBe(32);
            expect(root.every((b) => b === 0)).toBe(true);
        });

        it("returns the leaf itself for single leaf", () => {
            const leaf = new Uint8Array(32).fill(5);
            const root = stratum.buildMerkleRoot([leaf]);
            expect(root).toEqual(leaf);
        });
    });

    // -----------------------------------------------------------------------
    // New features: Cranker Registry
    // -----------------------------------------------------------------------

    describe("registerCranker / listCrankers / challengeCranker", () => {
        it("registers a new cranker", async () => {
            const cranker = await stratum.registerCranker({
                publicKey: "crankerPubKey123",
                stake: BigInt(1_000_000),
            });

            expect(cranker.id).toBeTruthy();
            expect(cranker.publicKey).toBe("crankerPubKey123");
            expect(cranker.stake).toBe(BigInt(1_000_000));
            expect(cranker.status).toBe("active");
            expect(cranker.successCount).toBe(0);
        });

        it("lists crankers with optional status filter", async () => {
            await stratum.registerCranker({ publicKey: "listTest1", stake: BigInt(100) });
            const active = await stratum.listCrankers({ status: "active" });
            expect(active.length).toBeGreaterThan(0);
            expect(active.every((c) => c.status === "active")).toBe(true);
        });

        it("records cranker heartbeat", async () => {
            const cranker = await stratum.registerCranker({ publicKey: "hbTest", stake: BigInt(100) });
            const before = cranker.lastHeartbeat;

            // Small delay to ensure different timestamp
            const updated = await stratum.crankerHeartbeat(cranker.id);
            expect(updated).not.toBeNull();
            expect(updated!.lastHeartbeat).toBeGreaterThanOrEqual(before);
        });

        it("returns null for heartbeat on unknown cranker", async () => {
            const result = await stratum.crankerHeartbeat("nonexistent-id");
            expect(result).toBeNull();
        });

        it("challenges a cranker", async () => {
            const cranker = await stratum.registerCranker({ publicKey: "challengeTest", stake: BigInt(500) });
            const challenge = await stratum.challengeCranker({
                crankerId: cranker.id,
                challengerKey: "challenger123",
                reason: "Missed crank window",
                evidence: "block 12345",
            });

            expect(challenge.id).toBeTruthy();
            expect(challenge.status).toBe("pending");
            expect(challenge.reason).toBe("Missed crank window");
        });

        it("throws when challenging non-existent cranker", async () => {
            await expect(
                stratum.challengeCranker({
                    crankerId: "nonexistent",
                    challengerKey: "key",
                    reason: "test",
                }),
            ).rejects.toThrow("not found");
        });

        it("resolves a challenge with slash", async () => {
            const cranker = await stratum.registerCranker({ publicKey: "slashTest", stake: BigInt(1000) });
            const challenge = await stratum.challengeCranker({
                crankerId: cranker.id,
                challengerKey: "challenger",
                reason: "Malicious behavior",
            });

            const resolved = await stratum.resolveChallenge({
                challengeId: challenge.id,
                resolution: "slash",
            });

            expect(resolved).not.toBeNull();
            expect(resolved!.status).toBe("resolved");
            expect(resolved!.resolvedAt).toBeGreaterThan(0);
        });

        it("resolves a challenge with reject (clears cranker)", async () => {
            const cranker = await stratum.registerCranker({ publicKey: "rejectTest", stake: BigInt(1000) });
            const challenge = await stratum.challengeCranker({
                crankerId: cranker.id,
                challengerKey: "challenger",
                reason: "False alarm",
            });

            const resolved = await stratum.resolveChallenge({
                challengeId: challenge.id,
                resolution: "reject",
            });

            expect(resolved).not.toBeNull();
            expect(resolved!.status).toBe("rejected");
        });
    });

    // -----------------------------------------------------------------------
    // New features: Cleanup Estimator
    // -----------------------------------------------------------------------

    describe("estimateCleanup", () => {
        it("estimates cleanup for Solana orders", async () => {
            const result = await stratum.estimateCleanup({
                expiredOrderCount: 100,
                chain: "solana",
            });

            expect(result.expiredOrders).toBe(100);
            expect(result.reclaimableSpace).toBe(100 * 128);
            expect(result.estimatedCost).toBeGreaterThan(BigInt(0));
            expect(result.estimatedSavings).toBeGreaterThan(BigInt(0));
            expect(result.netBenefit).toBeGreaterThan(BigInt(0));
        });

        it("estimates cleanup for Ethereum orders", async () => {
            const result = await stratum.estimateCleanup({
                expiredOrderCount: 50,
                chain: "ethereum",
            });

            expect(result.expiredOrders).toBe(50);
            expect(result.estimatedCost).toBeGreaterThan(BigInt(0));
        });

        it("net benefit is savings minus cost", async () => {
            const result = await stratum.estimateCleanup({
                expiredOrderCount: 10,
                chain: "solana",
            });

            expect(result.netBenefit).toBe(result.estimatedSavings - result.estimatedCost);
        });

        it("scales with order count", async () => {
            const small = await stratum.estimateCleanup({ expiredOrderCount: 10 });
            const large = await stratum.estimateCleanup({ expiredOrderCount: 100 });

            expect(large.estimatedSavings).toBeGreaterThan(small.estimatedSavings);
        });
    });
});
