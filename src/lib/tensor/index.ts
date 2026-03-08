/**
 * Tensor — Portfolio Margin Engine for DeFi.
 *
 * - Black-Scholes greeks computation
 * - Portfolio margin with delta-netting
 * - Intent solver for execution optimization
 * - Portfolio risk analysis
 */

import type {
    OptionType,
    PositionType,
    Position,
    Greeks,
    MarginResult,
    PositionMargin,
    GreeksResult,
    IntentOrder,
    IntentSolution,
    RiskAnalysis,
} from "./types";

// ---------------------------------------------------------------------------
// Black-Scholes
// ---------------------------------------------------------------------------

/** Standard normal CDF approximation (Abramowitz & Stegun) */
function normCdf(x: number): number {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    const absX = Math.abs(x);
    const t = 1.0 / (1.0 + p * absX);
    const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX / 2);

    return 0.5 * (1.0 + sign * y);
}

/** Standard normal PDF */
function normPdf(x: number): number {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/** Black-Scholes d1 and d2 */
function bsD1D2(
    spot: number,
    strike: number,
    timeToExpiry: number,
    iv: number,
    riskFreeRate: number,
): { d1: number; d2: number } {
    const d1 = (Math.log(spot / strike) + (riskFreeRate + 0.5 * iv * iv) * timeToExpiry) /
        (iv * Math.sqrt(timeToExpiry));
    const d2 = d1 - iv * Math.sqrt(timeToExpiry);
    return { d1, d2 };
}

/** Black-Scholes option price */
function bsPrice(
    spot: number,
    strike: number,
    timeToExpiry: number,
    iv: number,
    riskFreeRate: number,
    optionType: OptionType,
): number {
    if (timeToExpiry <= 0) {
        return optionType === "call"
            ? Math.max(spot - strike, 0)
            : Math.max(strike - spot, 0);
    }

    const { d1, d2 } = bsD1D2(spot, strike, timeToExpiry, iv, riskFreeRate);
    const df = Math.exp(-riskFreeRate * timeToExpiry);

    if (optionType === "call") {
        return spot * normCdf(d1) - strike * df * normCdf(d2);
    }
    return strike * df * normCdf(-d2) - spot * normCdf(-d1);
}

/** Black-Scholes Greeks */
function bsGreeks(
    spot: number,
    strike: number,
    timeToExpiry: number,
    iv: number,
    riskFreeRate: number,
    optionType: OptionType,
): Greeks {
    if (timeToExpiry <= 0) {
        const itm = optionType === "call" ? spot > strike : spot < strike;
        return {
            delta: itm ? (optionType === "call" ? 1 : -1) : 0,
            gamma: 0,
            theta: 0,
            vega: 0,
            rho: 0,
        };
    }

    const { d1, d2 } = bsD1D2(spot, strike, timeToExpiry, iv, riskFreeRate);
    const df = Math.exp(-riskFreeRate * timeToExpiry);
    const sqrtT = Math.sqrt(timeToExpiry);

    const gamma = normPdf(d1) / (spot * iv * sqrtT);
    const vega = spot * normPdf(d1) * sqrtT / 100; // per 1% vol change

    if (optionType === "call") {
        const delta = normCdf(d1);
        const theta = (-(spot * normPdf(d1) * iv) / (2 * sqrtT)
            - riskFreeRate * strike * df * normCdf(d2)) / 365;
        const rho = strike * timeToExpiry * df * normCdf(d2) / 100;
        return { delta, gamma, theta, vega, rho };
    }

    const delta = normCdf(d1) - 1;
    const theta = (-(spot * normPdf(d1) * iv) / (2 * sqrtT)
        + riskFreeRate * strike * df * normCdf(-d2)) / 365;
    const rho = -strike * timeToExpiry * df * normCdf(-d2) / 100;
    return { delta, gamma, theta, vega, rho };
}

// ---------------------------------------------------------------------------
// Margin rates
// ---------------------------------------------------------------------------

const MARGIN_RATES: Record<PositionType, { initial: number; maintenance: number }> = {
    perp: { initial: 0.10, maintenance: 0.05 },
    option: { initial: 0.15, maintenance: 0.10 },
    spot: { initial: 1.0, maintenance: 1.0 },     // fully collateralized
    lending: { initial: 0.20, maintenance: 0.15 },
};

const DEFAULT_IV = 0.80;     // 80% annualized — typical crypto
const RISK_FREE_RATE = 0.05; // 5%

// ---------------------------------------------------------------------------
// Greeks computation (public endpoint)
// ---------------------------------------------------------------------------

export async function computeGreeks(params: {
    asset: string;
    spot: number;
    strike: number;
    expiry: number;
    optionType: OptionType;
    iv?: number;
}): Promise<GreeksResult> {
    const { asset, spot, strike, expiry, optionType, iv = DEFAULT_IV } = params;

    const now = Date.now() / 1000;
    const timeToExpiry = Math.max((expiry - now) / (365 * 24 * 3600), 0);

    const greeks = bsGreeks(spot, strike, timeToExpiry, iv, RISK_FREE_RATE, optionType);
    const theoreticalPrice = bsPrice(spot, strike, timeToExpiry, iv, RISK_FREE_RATE, optionType);

    return {
        asset,
        spot,
        strike,
        expiry,
        optionType,
        iv,
        greeks,
        theoreticalPrice,
        timeToExpiry,
        calculatedAt: Date.now(),
    };
}

// ---------------------------------------------------------------------------
// Portfolio margin with delta-netting
// ---------------------------------------------------------------------------

export async function calculateMargin(params: {
    positions: Position[];
}): Promise<MarginResult> {
    const { positions } = params;

    const positionMargins: PositionMargin[] = [];
    let totalIsolated = 0;

    // Per-asset delta aggregation for netting
    const assetDeltas: Record<string, { delta: number; gamma: number }> = {};

    for (const pos of positions) {
        const notional = Math.abs(pos.size * pos.markPrice);
        const rates = MARGIN_RATES[pos.type];

        let greeks: Greeks;

        if (pos.type === "option" && pos.strike && pos.expiry && pos.optionType) {
            greeks = bsGreeks(
                pos.markPrice,
                pos.strike,
                Math.max((pos.expiry - Date.now() / 1000) / (365 * 24 * 3600), 0),
                DEFAULT_IV,
                RISK_FREE_RATE,
                pos.optionType,
            );
            // Scale by position size
            greeks = {
                delta: greeks.delta * pos.size,
                gamma: greeks.gamma * pos.size,
                theta: greeks.theta * pos.size,
                vega: greeks.vega * pos.size,
                rho: greeks.rho * pos.size,
            };
        } else if (pos.type === "perp") {
            greeks = {
                delta: pos.size,
                gamma: 0,
                theta: 0,
                vega: 0,
                rho: 0,
            };
        } else {
            greeks = {
                delta: pos.size,
                gamma: 0,
                theta: 0,
                vega: 0,
                rho: 0,
            };
        }

        const isolatedMargin = notional * rates.initial;
        totalIsolated += isolatedMargin;

        positionMargins.push({
            id: pos.id,
            asset: pos.asset,
            type: pos.type,
            isolatedMargin,
            greeks,
        });

        // Aggregate per asset
        if (!assetDeltas[pos.asset]) {
            assetDeltas[pos.asset] = { delta: 0, gamma: 0 };
        }
        assetDeltas[pos.asset].delta += greeks.delta;
        assetDeltas[pos.asset].gamma += greeks.gamma;
    }

    // Delta-netting: portfolio margin based on net delta exposure
    let netDelta = 0;
    let netGamma = 0;
    let portfolioMargin = 0;

    for (const [asset, agg] of Object.entries(assetDeltas)) {
        netDelta += agg.delta;
        netGamma += agg.gamma;

        // Find representative price for this asset
        const rep = positions.find((p) => p.asset === asset);
        const price = rep?.markPrice || 0;

        // Net delta margin: only the net exposure needs margin
        const netNotional = Math.abs(agg.delta * price);
        portfolioMargin += netNotional * MARGIN_RATES.perp.initial;

        // Gamma add-on: additional margin for convexity risk
        const gammaCharge = Math.abs(agg.gamma) * price * price * 0.01; // 1% move
        portfolioMargin += gammaCharge;
    }

    const marginSaved = Math.max(totalIsolated - portfolioMargin, 0);
    const marginSavedPct = totalIsolated > 0 ? (marginSaved / totalIsolated) * 100 : 0;

    return {
        initialMargin: totalIsolated,
        maintenanceMargin: totalIsolated * 0.5, // simplified
        portfolioMargin,
        marginSaved,
        marginSavedPct: Math.round(marginSavedPct * 100) / 100,
        positions: positionMargins,
        netDelta,
        netGamma,
    };
}

// ---------------------------------------------------------------------------
// Intent solver
// ---------------------------------------------------------------------------

export async function solveIntent(params: {
    orders: IntentOrder[];
    currentPositions?: Position[];
}): Promise<IntentSolution> {
    const { orders, currentPositions = [] } = params;

    // Sort by urgency (high first), then by type (spot < perp < option)
    const typeOrder: Record<PositionType, number> = {
        spot: 0,
        perp: 1,
        lending: 2,
        option: 3,
    };
    const urgencyOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };

    const sorted = [...orders].sort((a, b) => {
        const urgDiff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
        if (urgDiff !== 0) return urgDiff;
        return typeOrder[a.type] - typeOrder[b.type];
    });

    const executionSequence = sorted.map((o) => o.id);

    // Estimate margin impact
    const mockPositions: Position[] = orders.map((o) => ({
        id: o.id,
        type: o.type,
        asset: o.asset,
        size: o.side === "buy" ? o.size : -o.size,
        entryPrice: 0,
        markPrice: 1000, // placeholder
    }));

    const combined = [...currentPositions, ...mockPositions];
    const marginResult = await calculateMargin({ positions: combined });
    const currentMargin = currentPositions.length > 0
        ? (await calculateMargin({ positions: currentPositions })).portfolioMargin
        : 0;

    const marginImpact = marginResult.portfolioMargin - currentMargin;

    // Estimate slippage based on total size and urgency
    const totalSize = orders.reduce((sum, o) => sum + o.size, 0);
    const avgUrgency = orders.reduce((sum, o) => sum + urgencyOrder[o.urgency], 0) / orders.length;
    const estimatedSlippage = Math.min(totalSize * 0.001 * (1 + avgUrgency * 0.5), 5); // max 5%

    const estimatedGas = orders.length * 150000; // ~150k gas per order

    return {
        orders,
        executionSequence,
        estimatedSlippage: Math.round(estimatedSlippage * 100) / 100,
        estimatedGas,
        marginImpact: Math.round(marginImpact * 100) / 100,
        recommendation: orders.length > 3
            ? "Consider batching into fewer transactions to reduce gas costs"
            : "Execution sequence optimized for minimal market impact",
        solvedAt: Date.now(),
    };
}

// ---------------------------------------------------------------------------
// Portfolio risk analysis
// ---------------------------------------------------------------------------

export async function analyzeRisk(params: {
    positions: Position[];
}): Promise<RiskAnalysis> {
    const { positions } = params;

    const marginResult = await calculateMargin({ positions });

    const portfolioValue = positions.reduce(
        (sum, p) => sum + Math.abs(p.size * p.markPrice),
        0,
    );

    const marginRatio = portfolioValue > 0
        ? marginResult.portfolioMargin / portfolioValue
        : 0;

    // 99% VaR estimate using delta-normal approach
    // Assume 80% annualized vol, daily horizon
    const dailyVol = DEFAULT_IV / Math.sqrt(365);
    const var99 = Math.abs(marginResult.netDelta) *
        (positions[0]?.markPrice || 0) * dailyVol * 2.326; // 99th percentile z-score

    const maxDrawdown = Math.round(var99 * 100) / 100;

    // Liquidation price (simplified: for net long delta)
    let liquidationPrice: number | null = null;
    if (positions.length > 0 && marginResult.netDelta !== 0) {
        const avgPrice = positions.reduce((sum, p) => sum + p.markPrice, 0) / positions.length;
        const buffer = marginResult.portfolioMargin / Math.abs(marginResult.netDelta);
        liquidationPrice = marginResult.netDelta > 0
            ? Math.max(avgPrice - buffer, 0)
            : avgPrice + buffer;
        liquidationPrice = Math.round(liquidationPrice * 100) / 100;
    }

    const warnings: string[] = [];
    if (marginRatio > 0.8) warnings.push("Margin utilization above 80% — close to liquidation");
    if (marginRatio > 0.5) warnings.push("Margin utilization above 50% — consider reducing exposure");
    if (Math.abs(marginResult.netGamma) > 10) warnings.push("High gamma exposure — portfolio sensitive to large price moves");
    if (var99 > portfolioValue * 0.1) warnings.push("Daily 99% VaR exceeds 10% of portfolio value");

    const riskLevel = marginRatio > 0.8 ? "danger"
        : marginRatio > 0.5 ? "elevated"
        : marginRatio > 0.3 ? "moderate"
        : "safe";

    return {
        portfolioValue: Math.round(portfolioValue * 100) / 100,
        totalMargin: Math.round(marginResult.portfolioMargin * 100) / 100,
        marginRatio: Math.round(marginRatio * 10000) / 10000,
        maxDrawdown,
        liquidationPrice,
        riskLevel,
        warnings,
        analyzedAt: Date.now(),
    };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const tensor = {
    computeGreeks,
    calculateMargin,
    solveIntent,
    analyzeRisk,
};
