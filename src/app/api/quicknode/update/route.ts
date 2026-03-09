/**
 * POST /api/quicknode/update
 *
 * Called by QuickNode when a user changes their Fabrknt add-on subscription plan.
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
            "endpoint-id": endpointId,
            plan,
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
            data: {
                endpointId: endpointId || instance.endpointId,
                plan: plan || instance.plan,
            },
        });

        return NextResponse.json({ status: "success" });
    } catch (error) {
        console.error("Update error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Update failed" },
            { status: 500 }
        );
    }
}
