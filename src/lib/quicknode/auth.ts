/**
 * QuickNode Marketplace HTTP Basic Auth verification.
 *
 * QuickNode sends provisioning requests with Basic Auth credentials
 * configured in the Marketplace dashboard.
 */

import { NextResponse } from "next/server";

export function verifyQuicknodeAuth(request: Request): NextResponse | null {
    const authHeader = request.headers.get("authorization");

    if (!authHeader?.startsWith("Basic ")) {
        return NextResponse.json(
            { error: "Missing Basic Auth credentials" },
            { status: 401 }
        );
    }

    const encoded = authHeader.slice(6);
    const decoded = Buffer.from(encoded, "base64").toString("utf-8");
    const [username, password] = decoded.split(":");

    const expectedUser = process.env.QUICKNODE_PROVISION_USERNAME;
    const expectedPass = process.env.QUICKNODE_PROVISION_PASSWORD;

    if (!expectedUser || !expectedPass) {
        console.error("QUICKNODE_PROVISION_USERNAME or QUICKNODE_PROVISION_PASSWORD not set");
        return NextResponse.json(
            { error: "Server configuration error" },
            { status: 500 }
        );
    }

    if (username !== expectedUser || password !== expectedPass) {
        return NextResponse.json(
            { error: "Invalid credentials" },
            { status: 401 }
        );
    }

    return null;
}
