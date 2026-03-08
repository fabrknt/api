/**
 * POST /api/quicknode/provision
 *
 * Called by QuickNode Marketplace when a user adds the Complr add-on.
 * Creates a new instance and returns access credentials.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyQuicknodeAuth } from "@/lib/quicknode/auth";
import { randomUUID } from "crypto";

export async function POST(request: Request) {
    const authError = verifyQuicknodeAuth(request);
    if (authError) return authError;

    try {
        const body = await request.json();
        const {
            "quicknode-id": quicknodeId,
            "endpoint-id": endpointId,
            "wss-url": wssUrl,
            "http-url": httpUrl,
            chain,
            network,
            plan,
        } = body;

        if (!quicknodeId) {
            return NextResponse.json(
                { error: "quicknode-id is required" },
                { status: 400 }
            );
        }

        const baseUrl = process.env.NEXT_PUBLIC_URL || "https://api.fabrknt.com";

        // Check for existing instance (re-provision)
        const existing = await prisma.quicknodeInstance.findUnique({
            where: { quicknodeId },
        });

        if (existing) {
            const instance = await prisma.quicknodeInstance.update({
                where: { quicknodeId },
                data: {
                    endpointId,
                    wssUrl,
                    httpUrl,
                    chain,
                    network,
                    plan: plan || "free",
                    status: "active",
                },
            });

            return NextResponse.json({
                status: "success",
                "dashboard-url": `${baseUrl}/quicknode/${instance.id}`,
                "access-url": `${baseUrl}/api/quicknode/complr/${instance.apiKey}`,
            });
        }

        const apiKey = randomUUID();

        const instance = await prisma.quicknodeInstance.create({
            data: {
                quicknodeId,
                endpointId,
                wssUrl,
                httpUrl,
                chain,
                network,
                plan: plan || "free",
                product: "complr",
                apiKey,
            },
        });

        return NextResponse.json({
            status: "success",
            "dashboard-url": `${baseUrl}/quicknode/${instance.id}`,
            "access-url": `${baseUrl}/api/quicknode/complr/${instance.apiKey}`,
        });
    } catch (error) {
        console.error("Provision error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Provisioning failed" },
            { status: 500 }
        );
    }
}
