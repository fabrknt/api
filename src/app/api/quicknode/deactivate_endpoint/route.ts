/**
 * POST /api/quicknode/deactivate_endpoint
 *
 * Called by QuickNode when an endpoint is deactivated (but not removed).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyQuicknodeAuth } from "@/lib/quicknode/auth";

export { handler as POST, handler as DELETE };

async function handler(request: Request) {
    const authError = verifyQuicknodeAuth(request);
    if (authError) return authError;

    try {
        const body = await request.json();
        const {
            "quicknode-id": quicknodeId,
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

        await prisma.quicknodeInstance.update({
            where: { quicknodeId },
            data: { status: "deactivated" },
        });

        return NextResponse.json({ status: "success" });
    } catch (error) {
        console.error("Deactivate error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Deactivation failed" },
            { status: 500 }
        );
    }
}
