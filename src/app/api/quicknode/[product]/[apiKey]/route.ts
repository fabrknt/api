/**
 * POST /api/quicknode/[product]/[apiKey]
 *
 * Unified QuickNode Marketplace customer API for all 7 Fabrknt products.
 * Validates API key, checks plan limits, dispatches to the appropriate product handler.
 *
 * Products: complr, accredit, sentinel, veil, stratum, tensor, tempest
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { complr } from "@/lib/complr";
import { accredit } from "@/lib/accredit";
import { sentinel } from "@/lib/sentinel";
import { veil } from "@/lib/veil";
import { stratum } from "@/lib/stratum";
import { tensor } from "@/lib/tensor";
import { tempest } from "@/lib/tempest";

const PLAN_LIMITS: Record<string, number> = {
    free: 100,
    starter: 1_000,
    growth: 10_000,
    business: 100_000,
};

const VALID_PRODUCTS = ["complr", "accredit", "sentinel", "veil", "stratum", "tensor", "tempest"] as const;
type Product = typeof VALID_PRODUCTS[number];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleComplr(method: string, params: any) {
    switch (method) {
        case "screen_wallet": {
            const { address, jurisdictions } = params || {};
            if (!address) throw { status: 400, message: "address is required" };
            return await complr.screenWallet(address, jurisdictions);
        }
        case "screen_pool": {
            const { protocol, poolId, jurisdictions } = params || {};
            if (!protocol || !poolId) throw { status: 400, message: "protocol and poolId are required" };
            return await complr.screenPool(protocol, poolId, jurisdictions);
        }
        case "check_allocation": {
            const { allocations } = params || {};
            if (!allocations || !Array.isArray(allocations)) throw { status: 400, message: "allocations array is required" };
            return complr.checkAllocationCompliance(allocations);
        }
        default:
            throw { status: 400, message: `Unknown method: ${method}. Supported: screen_wallet, screen_pool, check_allocation` };
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleAccredit(method: string, params: any) {
    switch (method) {
        case "screen_identity": {
            const { address, jurisdictions } = params || {};
            if (!address) throw { status: 400, message: "address is required" };
            return await accredit.screenIdentity(address, jurisdictions);
        }
        case "check_jurisdiction": {
            const { address, jurisdiction, protocolType } = params || {};
            if (!address || !jurisdiction) throw { status: 400, message: "address and jurisdiction are required" };
            return await accredit.checkJurisdiction(address, jurisdiction, protocolType);
        }
        case "verify_accreditation": {
            const { address, jurisdiction } = params || {};
            if (!address) throw { status: 400, message: "address is required" };
            return await accredit.verifyAccreditation(address, jurisdiction);
        }
        case "check_transfer": {
            const { from, to, jurisdictions, amountUsd } = params || {};
            if (!from || !to) throw { status: 400, message: "from and to are required" };
            return await accredit.checkTransfer(from, to, jurisdictions, amountUsd);
        }
        case "register_kyc": {
            const { address, kycLevel, investorType, jurisdictions, expiresInDays } = params || {};
            if (!address || !kycLevel || !investorType || !jurisdictions) {
                throw { status: 400, message: "address, kycLevel, investorType, and jurisdictions are required" };
            }
            return await accredit.registerKyc({ address, kycLevel, investorType, jurisdictions, expiresInDays });
        }
        default:
            throw { status: 400, message: `Unknown method: ${method}. Supported: screen_identity, check_jurisdiction, verify_accreditation, check_transfer, register_kyc` };
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleSentinel(method: string, params: any) {
    switch (method) {
        case "analyze_transaction": {
            const { from, to, data, value, chain } = params || {};
            if (!from || !to) throw { status: 400, message: "from and to are required" };
            return await sentinel.analyzeTransaction({ from, to, data, value, chain });
        }
        case "analyze_contract": {
            const { address, chain } = params || {};
            if (!address) throw { status: 400, message: "address is required" };
            return await sentinel.analyzeContract({ address, chain });
        }
        case "analyze_mev": {
            const { txHash, chain } = params || {};
            if (!txHash) throw { status: 400, message: "txHash is required" };
            return await sentinel.analyzeMev({ txHash, chain });
        }
        default:
            throw { status: 400, message: `Unknown method: ${method}. Supported: analyze_transaction, analyze_contract, analyze_mev` };
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleVeil(method: string, params: any) {
    switch (method) {
        case "generate_proof": {
            const { address, proofType, claims } = params || {};
            if (!address || !proofType) throw { status: 400, message: "address and proofType are required" };
            return await veil.generateProof({ address, proofType, claims });
        }
        case "verify_proof": {
            const { proofId, proofHash } = params || {};
            if (!proofId || !proofHash) throw { status: 400, message: "proofId and proofHash are required" };
            return await veil.verifyProof({ proofId, proofHash });
        }
        case "encrypt_data": {
            const { data, accessPolicy, expiresInDays } = params || {};
            if (!data) throw { status: 400, message: "data is required" };
            return await veil.encryptData({ data, accessPolicy: accessPolicy || [], expiresInDays });
        }
        case "assess_privacy": {
            const { address, frameworks, dataCategories } = params || {};
            if (!address || !frameworks) throw { status: 400, message: "address and frameworks are required" };
            return await veil.assessPrivacy({ address, frameworks, dataCategories });
        }
        case "record_consent": {
            const { address, purpose, framework, granted, expiresInDays } = params || {};
            if (!address || !purpose || !framework) throw { status: 400, message: "address, purpose, and framework are required" };
            return await veil.recordConsent({ address, purpose, framework, granted: granted ?? true, expiresInDays });
        }
        case "get_consent": {
            const { address, purpose } = params || {};
            if (!address) throw { status: 400, message: "address is required" };
            return await veil.getConsent({ address, purpose });
        }
        default:
            throw { status: 400, message: `Unknown method: ${method}. Supported: generate_proof, verify_proof, encrypt_data, assess_privacy, record_consent, get_consent` };
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleStratum(method: string, params: any) {
    switch (method) {
        case "check_sanctions": {
            const { address } = params || {};
            if (!address) throw { status: 400, message: "address is required" };
            return await stratum.checkSanctions(address);
        }
        case "get_sanctions_list": {
            const { listSource, limit } = params || {};
            return await stratum.getSanctionsList({ listSource, limit });
        }
        case "get_regulatory_updates": {
            const { jurisdiction, impact, limit } = params || {};
            return await stratum.getRegulatoryUpdates({ jurisdiction, impact, limit });
        }
        case "get_health":
            return await stratum.getHealth();
        case "get_feed_status": {
            const { feedId } = params || {};
            if (!feedId) throw { status: 400, message: "feedId is required" };
            return await stratum.getFeedStatus(feedId);
        }
        default:
            throw { status: 400, message: `Unknown method: ${method}. Supported: check_sanctions, get_sanctions_list, get_regulatory_updates, get_health, get_feed_status` };
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleTensor(method: string, params: any) {
    switch (method) {
        case "compute_greeks": {
            const { asset, spot, strike, expiry, optionType, iv } = params || {};
            if (!asset || !spot || !strike || !expiry || !optionType) {
                throw { status: 400, message: "asset, spot, strike, expiry, and optionType are required" };
            }
            return await tensor.computeGreeks({ asset, spot, strike, expiry, optionType, iv });
        }
        case "calculate_margin": {
            const { positions } = params || {};
            if (!positions || !Array.isArray(positions) || positions.length === 0) {
                throw { status: 400, message: "positions array is required" };
            }
            return await tensor.calculateMargin({ positions });
        }
        case "solve_intent": {
            const { orders, currentPositions } = params || {};
            if (!orders || !Array.isArray(orders) || orders.length === 0) {
                throw { status: 400, message: "orders array is required" };
            }
            return await tensor.solveIntent({ orders, currentPositions });
        }
        case "analyze_risk": {
            const { positions } = params || {};
            if (!positions || !Array.isArray(positions) || positions.length === 0) {
                throw { status: 400, message: "positions array is required" };
            }
            return await tensor.analyzeRisk({ positions });
        }
        default:
            throw { status: 400, message: `Unknown method: ${method}. Supported: compute_greeks, calculate_margin, solve_intent, analyze_risk` };
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleTempest(method: string, params: any) {
    switch (method) {
        case "estimate_fee": {
            const { pair, volatility, config } = params || {};
            if (!pair || volatility === undefined) throw { status: 400, message: "pair and volatility are required" };
            return await tempest.estimateFee({ pair, volatility, config });
        }
        case "classify_vol_regime": {
            const { pair, volatility, volatility24h } = params || {};
            if (!pair || volatility === undefined) throw { status: 400, message: "pair and volatility are required" };
            return await tempest.classifyVolRegime({ pair, volatility, volatility24h });
        }
        case "get_fee_curve": {
            const { pair, config } = params || {};
            if (!pair) throw { status: 400, message: "pair is required" };
            return await tempest.getFeeCurve({ pair, config });
        }
        case "estimate_il": {
            const { pair, priceChangeRatio, liquidity, dailyVolume, feeBps } = params || {};
            if (!pair || priceChangeRatio === undefined) throw { status: 400, message: "pair and priceChangeRatio are required" };
            return await tempest.estimateIL({ pair, priceChangeRatio, liquidity, dailyVolume, feeBps });
        }
        case "optimize_lp_range": {
            const { pair, currentPrice, volatility, timeHorizon, riskTolerance } = params || {};
            if (!pair || !currentPrice || volatility === undefined) {
                throw { status: 400, message: "pair, currentPrice, and volatility are required" };
            }
            return await tempest.optimizeLPRange({ pair, currentPrice, volatility, timeHorizon, riskTolerance });
        }
        default:
            throw { status: 400, message: `Unknown method: ${method}. Supported: estimate_fee, classify_vol_regime, get_fee_curve, estimate_il, optimize_lp_range` };
    }
}

const PRODUCT_HANDLERS: Record<Product, (method: string, params: unknown) => Promise<unknown>> = {
    complr: handleComplr,
    accredit: handleAccredit,
    sentinel: handleSentinel,
    veil: handleVeil,
    stratum: handleStratum,
    tensor: handleTensor,
    tempest: handleTempest,
};

export async function POST(
    request: Request,
    { params }: { params: Promise<{ product: string; apiKey: string }> }
) {
    const { product, apiKey } = await params;

    if (!VALID_PRODUCTS.includes(product as Product)) {
        return NextResponse.json(
            { error: `Unknown product: ${product}. Supported: ${VALID_PRODUCTS.join(", ")}` },
            { status: 404 }
        );
    }

    const instance = await prisma.quicknodeInstance.findUnique({
        where: { apiKey },
    });

    if (!instance) {
        return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }

    if (instance.product !== product) {
        return NextResponse.json(
            { error: `API key is for ${instance.product}, not ${product}` },
            { status: 403 }
        );
    }

    if (instance.status !== "active") {
        return NextResponse.json(
            { error: `Add-on is ${instance.status}` },
            { status: 403 }
        );
    }

    const limit = PLAN_LIMITS[instance.plan] ?? PLAN_LIMITS.free;
    if (instance.requestCount >= limit) {
        return NextResponse.json(
            { error: "Monthly request limit exceeded. Upgrade your plan." },
            { status: 429 }
        );
    }

    try {
        const body = await request.json();
        const { method, params: methodParams } = body;

        const handler = PRODUCT_HANDLERS[product as Product];
        const result = await handler(method, methodParams);

        await prisma.quicknodeInstance.update({
            where: { apiKey },
            data: {
                requestCount: { increment: 1 },
                lastRequestAt: new Date(),
            },
        });

        return NextResponse.json({
            result,
            poweredBy: `@${product} by FABRKNT`,
        });
    } catch (error) {
        if (typeof error === "object" && error !== null && "status" in error && "message" in error) {
            const e = error as { status: number; message: string };
            return NextResponse.json({ error: e.message }, { status: e.status });
        }
        console.error(`${product} API error:`, error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Request failed" },
            { status: 500 }
        );
    }
}
