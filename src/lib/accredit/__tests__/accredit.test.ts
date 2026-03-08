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
});
