/**
 * POST /api/quicknode/deprovision
 *
 * Called by QuickNode when a user removes the Complr add-on
 * or deletes their QuickNode account.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyQuicknodeAuth } from "@/lib/quicknode/auth";

export async function POST(request: Request) {
    const authError = verifyQuicknodeAuth(request);
    if (authError) return authError;

    try {
        const body = await request.json();
        const {
            "quicknode-id": quicknodeId,
            "deprovision-type": deprovisionType,
        } = body;

        if (!quicknodeId) {
            return NextResponse.json(
                { error: "quicknode-id is required" },
                { status: 400 }
            );
        }

        const instance = await prisma.quicknodeInstance.findUnique({
            where: { quicknodeId },
        });

        if (!instance) {
            return NextResponse.json(
                { error: "Instance not found" },
                { status: 404 }
            );
        }

        if (deprovisionType === "delete-account") {
            await prisma.quicknodeInstance.delete({
                where: { quicknodeId },
            });
        } else {
            await prisma.quicknodeInstance.update({
                where: { quicknodeId },
                data: { status: "deprovisioned" },
            });
        }

        return NextResponse.json({ status: "success" });
    } catch (error) {
        console.error("Deprovision error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Deprovisioning failed" },
            { status: 500 }
        );
    }
}
