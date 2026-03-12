import { describe, it, expect } from "vitest";
import { accredit } from "../index";

describe("Accredit — KYC/AML Enforcement", () => {
    describe("registerKyc + screenIdentity", () => {
        it("registers and screens a verified identity", async () => {
            await accredit.registerKyc({
                address: "0xTest1111111111111111111111111111111111111",
                kycLevel: "enhanced",
                investorType: "accredited",
                jurisdictions: ["MAS", "FSA"],
            });

            const result = await accredit.screenIdentity(
                "0xTest1111111111111111111111111111111111111",
                ["MAS", "FSA"],
            );

            expect(result.verified).toBe(true);
            expect(result.kycLevel).toBe("enhanced");
            expect(result.investorType).toBe("accredited");
        });

        it("flags unverified addresses", async () => {
            const result = await accredit.screenIdentity(
                "0xUnknown111111111111111111111111111111111",
            );

            expect(result.verified).toBe(false);
            expect(result.kycLevel).toBe("none");
            expect(result.flags.some((f) => f.includes("No KYC record"))).toBe(true);
        });

        it("flags missing jurisdiction coverage", async () => {
            await accredit.registerKyc({
                address: "0xTest2222222222222222222222222222222222222",
                kycLevel: "enhanced",
                investorType: "retail",
                jurisdictions: ["MAS"],
            });

            const result = await accredit.screenIdentity(
                "0xTest2222222222222222222222222222222222222",
                ["MAS", "SEC"],
            );

            expect(result.flags.some((f) => f.includes("SEC"))).toBe(true);
        });
    });

    describe("checkJurisdiction", () => {
        it("allows verified user in their jurisdiction", async () => {
            await accredit.registerKyc({
                address: "0xTest3333333333333333333333333333333333333",
                kycLevel: "enhanced",
                investorType: "institutional",
                jurisdictions: ["MAS"],
            });

            const result = await accredit.checkJurisdiction(
                "0xTest3333333333333333333333333333333333333",
                "MAS",
            );

            expect(result.allowed).toBe(true);
        });

        it("blocks insufficient KYC level", async () => {
            await accredit.registerKyc({
                address: "0xTest4444444444444444444444444444444444444",
                kycLevel: "basic",
                investorType: "retail",
                jurisdictions: ["MAS"],
            });

            const result = await accredit.checkJurisdiction(
                "0xTest4444444444444444444444444444444444444",
                "MAS", // requires enhanced
            );

            expect(result.allowed).toBe(false);
            expect(result.restrictions.some((r) => r.includes("enhanced"))).toBe(true);
        });

        it("blocks restricted protocol types for retail", async () => {
            await accredit.registerKyc({
                address: "0xTest5555555555555555555555555555555555555",
                kycLevel: "enhanced",
                investorType: "retail",
                jurisdictions: ["MAS"],
            });

            const result = await accredit.checkJurisdiction(
                "0xTest5555555555555555555555555555555555555",
                "MAS",
                "derivatives",
            );

            expect(result.allowed).toBe(false);
            expect(result.restrictions.some((r) => r.includes("derivatives"))).toBe(true);
        });

        it("blocks unverified addresses", async () => {
            const result = await accredit.checkJurisdiction(
                "0xNoKyc55555555555555555555555555555555555",
                "MAS",
            );

            expect(result.allowed).toBe(false);
            expect(result.currentKycLevel).toBe("none");
        });
    });

    describe("verifyAccreditation", () => {
        it("confirms accredited investor", async () => {
            await accredit.registerKyc({
                address: "0xTest6666666666666666666666666666666666666",
                kycLevel: "enhanced",
                investorType: "accredited",
                jurisdictions: ["MAS"],
            });

            const result = await accredit.verifyAccreditation(
                "0xTest6666666666666666666666666666666666666",
            );

            expect(result.accredited).toBe(true);
            expect(result.qualifications).toContain("Accredited investor");
        });

        it("identifies retail as non-accredited", async () => {
            const result = await accredit.verifyAccreditation(
                "0xRetail6666666666666666666666666666666666",
            );

            expect(result.accredited).toBe(false);
            expect(result.investorType).toBe("retail");
        });
    });

    describe("checkTransfer", () => {
        it("blocks transfer between unverified parties", async () => {
            const result = await accredit.checkTransfer(
                "0xFrom77777777777777777777777777777777777",
                "0xTo777777777777777777777777777777777777",
            );

            expect(result.allowed).toBe(false);
            expect(result.requiredActions.some((a) => a.includes("Sender requires KYC"))).toBe(true);
            expect(result.requiredActions.some((a) => a.includes("Recipient requires KYC"))).toBe(true);
        });

        it("allows transfer between verified parties", async () => {
            await accredit.registerKyc({
                address: "0xFrom88888888888888888888888888888888888",
                kycLevel: "enhanced", investorType: "accredited", jurisdictions: ["FSA"],
            });
            await accredit.registerKyc({
                address: "0xTo888888888888888888888888888888888888",
                kycLevel: "enhanced", investorType: "accredited", jurisdictions: ["FSA"],
            });

            const result = await accredit.checkTransfer(
                "0xFrom88888888888888888888888888888888888",
                "0xTo888888888888888888888888888888888888",
                ["FSA"],
            );

            expect(result.allowed).toBe(true);
        });

        it("triggers Travel Rule for large transfers", async () => {
            await accredit.registerKyc({
                address: "0xFrom99999999999999999999999999999999999",
                kycLevel: "enhanced", investorType: "institutional", jurisdictions: ["MAS"],
            });
            await accredit.registerKyc({
                address: "0xTo999999999999999999999999999999999999",
                kycLevel: "enhanced", investorType: "institutional", jurisdictions: ["MAS"],
            });

            const result = await accredit.checkTransfer(
                "0xFrom99999999999999999999999999999999999",
                "0xTo999999999999999999999999999999999999",
                ["MAS"],
                5000, // MAS threshold is $1500
            );

            expect(result.requiredActions.some((a) => a.includes("Travel Rule"))).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // New features: Compliant Wrapper
    // -----------------------------------------------------------------------

    describe("createWrapperConfig / wrapTokens / unwrapTokens", () => {
        it("creates a wrapper config", async () => {
            const config = await accredit.createWrapperConfig({
                authority: "authority123",
                underlyingMint: "mintWrapTest1",
                kycRegistry: "registry123",
                feeRecipient: "feeRecipient123",
                feeBps: 50,
            });

            expect(config.wrappedMint).toContain("wrapped_");
            expect(config.vault).toContain("vault_");
            expect(config.isActive).toBe(true);
            expect(config.feeBps).toBe(50);
            expect(config.totalWrapped).toBe(BigInt(0));
        });

        it("retrieves wrapper config by underlying mint", async () => {
            await accredit.createWrapperConfig({
                authority: "auth",
                underlyingMint: "mintWrapGet1",
                kycRegistry: "reg",
                feeRecipient: "fee",
            });

            const config = await accredit.getWrapperConfig("mintWrapGet1");
            expect(config).not.toBeNull();
            expect(config!.underlyingMint).toBe("mintWrapGet1");
        });

        it("wraps tokens with KYC-cleared wallet", async () => {
            const mint = "mintWrapTokens1";
            const wallet = "0xWrapWallet111111111111111111111111111111";

            await accredit.createWrapperConfig({
                authority: "auth",
                underlyingMint: mint,
                kycRegistry: "reg",
                feeRecipient: "fee",
                feeBps: 100, // 1%
                minKycLevel: 0,
            });

            await accredit.addToWhitelist({
                wallet,
                kycLevel: 1,
                jurisdictionBitmask: 0b111,
                verifiedAt: Date.now(),
                expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
                provider: "civic",
            });

            const result = await accredit.wrapTokens({
                wallet,
                underlyingMint: mint,
                amount: BigInt(10000),
            });

            expect(result.success).toBe(true);
            expect(result.fee).toBe(BigInt(100)); // 1% of 10000
            expect(result.wrappedAmount).toBe(BigInt(9900));
        });

        it("fails to wrap without KYC", async () => {
            const mint = "mintWrapNoKyc1";
            await accredit.createWrapperConfig({
                authority: "auth",
                underlyingMint: mint,
                kycRegistry: "reg",
                feeRecipient: "fee",
            });

            const result = await accredit.wrapTokens({
                wallet: "0xNoKycWallet1111111111111111111111111111",
                underlyingMint: mint,
                amount: BigInt(1000),
            });

            expect(result.success).toBe(false);
        });

        it("unwraps tokens", async () => {
            const mint = "mintUnwrapTest1";
            const wallet = "0xUnwrapWallet111111111111111111111111111";

            await accredit.createWrapperConfig({
                authority: "auth",
                underlyingMint: mint,
                kycRegistry: "reg",
                feeRecipient: "fee",
                feeBps: 30,
                minKycLevel: 0,
            });

            await accredit.addToWhitelist({
                wallet,
                kycLevel: 2,
                jurisdictionBitmask: 0b1111,
                verifiedAt: Date.now(),
                expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
                provider: "manual",
            });

            // First wrap
            await accredit.wrapTokens({ wallet, underlyingMint: mint, amount: BigInt(10000) });

            // Then unwrap
            const result = await accredit.unwrapTokens({ wallet, underlyingMint: mint, amount: BigInt(5000) });
            expect(result.success).toBe(true);
            expect(result.fee).toBeGreaterThan(BigInt(0));
        });
    });

    // -----------------------------------------------------------------------
    // New features: Multi-provider KYC
    // -----------------------------------------------------------------------

    describe("configureKycProvider / verifyKycWithProvider", () => {
        it("returns error for unconfigured provider", async () => {
            const result = await accredit.verifyKycWithProvider({
                wallet: "0xtest",
                provider: "synaps",
                jurisdiction: "MAS",
            });

            expect(result.verified).toBe(false);
            expect(result.error).toContain("not configured");
        });

        it("verifies KYC via manual provider", async () => {
            accredit.configureKycProvider({
                provider: "manual",
                enabled: true,
            });

            const result = await accredit.verifyKycWithProvider({
                wallet: "0xManualKycWallet11111111111111111111111",
                provider: "manual",
                jurisdiction: "FSA",
            });

            expect(result.verified).toBe(true);
            expect(result.kycLevel).toBe("basic");
            expect(result.confidence).toBeGreaterThan(0);
            expect(result.expiresAt).toBeGreaterThan(result.verifiedAt);
        });

        it("verifies KYC via civic provider (simulated)", async () => {
            accredit.configureKycProvider({
                provider: "civic",
                apiKey: "test-civic-key",
                enabled: true,
            });

            const result = await accredit.verifyKycWithProvider({
                wallet: "0xCivicKycWallet111111111111111111111111",
                provider: "civic",
                jurisdiction: "MAS",
            });

            // Without a real endpoint, civic simulates verification
            expect(result.verified).toBe(true);
            expect(result.provider).toBe("civic");
        });

        it("returns error for disabled provider", async () => {
            accredit.configureKycProvider({
                provider: "worldid",
                apiKey: "test-key",
                enabled: false,
            });

            const result = await accredit.verifyKycWithProvider({
                wallet: "0xtest",
                provider: "worldid",
                jurisdiction: "MAS",
            });

            expect(result.verified).toBe(false);
            expect(result.error).toContain("not configured or disabled");
        });
    });

    // -----------------------------------------------------------------------
    // New features: Blacklist Management
    // -----------------------------------------------------------------------

    describe("addToBlacklist / removeFromBlacklist / isBlacklisted / listBlacklist", () => {
        it("adds a wallet to the blacklist", async () => {
            const entry = await accredit.addToBlacklist({
                wallet: "0xBlacklistTestAddr11111111111111111111111",
                reason: "Sanctioned entity",
                source: "OFAC",
            });

            expect(entry.wallet).toBe("0xblacklisttestaddr11111111111111111111111");
            expect(entry.reason).toBe("Sanctioned entity");
            expect(entry.blacklistedAt).toBeGreaterThan(0);
        });

        it("checks if a wallet is blacklisted", async () => {
            await accredit.addToBlacklist({
                wallet: "0xCheckBlacklist111111111111111111111111",
                reason: "Test",
                source: "internal",
            });

            const result = await accredit.isBlacklisted("0xCheckBlacklist111111111111111111111111");
            expect(result).not.toBeNull();
            expect(result!.reason).toBe("Test");
        });

        it("returns null for non-blacklisted wallet", async () => {
            const result = await accredit.isBlacklisted("0xCleanWallet11111111111111111111111111111");
            expect(result).toBeNull();
        });

        it("removes a wallet from the blacklist", async () => {
            await accredit.addToBlacklist({
                wallet: "0xRemoveBlacklist1111111111111111111111111",
                reason: "Temporary",
                source: "internal",
            });

            const removed = await accredit.removeFromBlacklist("0xRemoveBlacklist1111111111111111111111111");
            expect(removed).toBe(true);

            const check = await accredit.isBlacklisted("0xRemoveBlacklist1111111111111111111111111");
            expect(check).toBeNull();
        });

        it("lists blacklisted wallets", async () => {
            await accredit.addToBlacklist({ wallet: "0xListBlacklist11111111111111111111111111", reason: "Test", source: "OFAC" });
            const list = await accredit.listBlacklist();
            expect(list.length).toBeGreaterThan(0);
        });

        it("filters blacklist by source", async () => {
            await accredit.addToBlacklist({ wallet: "0xFilterBlacklist111111111111111111111111", reason: "Test", source: "UN_SC" });
            const filtered = await accredit.listBlacklist({ source: "UN_SC" });
            expect(filtered.every((e) => e.source === "UN_SC")).toBe(true);
        });

        it("blacklisted wallet is flagged in screenIdentity", async () => {
            await accredit.addToBlacklist({
                wallet: "0xScreenBlacklist1111111111111111111111111",
                reason: "Sanctioned",
                source: "OFAC",
            });

            const result = await accredit.screenIdentity("0xScreenBlacklist1111111111111111111111111");
            expect(result.flags.some((f) => f.includes("Blacklisted"))).toBe(true);
        });

        it("blacklisted wallet is blocked in checkTransfer", async () => {
            await accredit.addToBlacklist({
                wallet: "0xTransferBlocked111111111111111111111111",
                reason: "Blocked",
                source: "internal",
            });

            const result = await accredit.checkTransfer(
                "0xTransferBlocked111111111111111111111111",
                "0xCleanRecipient111111111111111111111111111",
            );
            expect(result.allowed).toBe(false);
            expect(result.requiredActions.some((a) => a.includes("blacklisted"))).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // On-chain KYC helpers
    // -----------------------------------------------------------------------

    describe("jurisdiction bitmask utilities", () => {
        it("builds bitmask from jurisdictions", () => {
            const bitmask = accredit.buildJurisdictionBitmask([0, 1, 2]);
            expect(accredit.isJurisdictionAllowed(bitmask, 0)).toBe(true);
            expect(accredit.isJurisdictionAllowed(bitmask, 1)).toBe(true);
            expect(accredit.isJurisdictionAllowed(bitmask, 2)).toBe(true);
            expect(accredit.isJurisdictionAllowed(bitmask, 3)).toBe(false);
        });
    });
});
