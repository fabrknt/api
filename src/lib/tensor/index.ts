/**
 * Tensor — Portfolio Margin Engine for DeFi.
 *
 * - Black-Scholes greeks computation
 * - Portfolio margin with delta-netting
 * - Intent solver for execution optimization
 * - Portfolio risk analysis
 * - Vol surface (9 moneyness nodes x 4 expiry buckets, bilinear interpolation)
 * - Solver auctions (bid evaluation, ranking, settlement)
 * - Dynamic gamma margin scaling (up to 5x)
 * - Gamma concentration limits by investor category
 * - Health calculation with liquidation distance
 * - Delta-netting with margin reduction
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
    VolSurface,
    OnChainVolSurface,
    SolverBid,
    SolverEntry,
    BidEvaluation,
    AuctionResult,
    GammaLimits,
    HealthStatus,
    HealthResult,
    NettingGroup,
    DeltaNetResult,
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

/** Maintenance margin is this fraction of the initial margin (from @tensor/core) */
const MAINTENANCE_RATIO = 0.5;

const DEFAULT_IV = 0.80;     // 80% annualized — typical crypto
const RISK_FREE_RATE = 0.05; // 5%

// ---------------------------------------------------------------------------
// Vol surface (from @tensor/core vol-surface.ts)
// ---------------------------------------------------------------------------

/**
 * Default moneyness nodes for the vol surface.
 * Covers 0.7x to 1.2x strike/spot ratio.
 */
export const DEFAULT_MONEYNESS_NODES = [0.7, 0.8, 0.85, 0.9, 0.95, 1.0, 1.05, 1.1, 1.2];

/**
 * Default expiry bucket boundaries in days.
 */
export const DEFAULT_EXPIRY_DAYS = [7, 30, 90, 180];

/**
 * Default skew multipliers relative to ATM IV, indexed by moneyness node.
 * Based on typical crypto vol smile: higher IV for OTM puts, minimum at ATM.
 */
export const DEFAULT_SKEW_MULTIPLIERS = [
    1.50, // 0.7x — deep OTM puts
    1.30, // 0.8x — OTM puts
    1.20, // 0.85x
    1.10, // 0.9x
    1.04, // 0.95x
    1.00, // 1.0x — ATM
    1.02, // 1.05x
    1.05, // 1.1x — OTM calls
    1.15, // 1.2x — far OTM calls
];

/**
 * Term structure multipliers: how IV changes with expiry relative to 30-day ATM.
 */
export const DEFAULT_TERM_MULTIPLIERS = [
    1.15, // 7d  — elevated short-dated vol
    1.00, // 30d — baseline
    0.95, // 90d — slight mean reversion
    0.92, // 180d — longer-term convergence
];

/**
 * Build a vol surface from a single ATM IV value using fixed skew/term multipliers.
 */
export function buildVolSurface(
    atmVol: number,
    skewMultipliers: number[] = DEFAULT_SKEW_MULTIPLIERS,
    termMultipliers: number[] = DEFAULT_TERM_MULTIPLIERS,
): VolSurface {
    const surface: number[][] = [];

    for (let e = 0; e < termMultipliers.length; e++) {
        const row: number[] = [];
        for (let m = 0; m < skewMultipliers.length; m++) {
            row.push(atmVol * skewMultipliers[m] * termMultipliers[e]);
        }
        surface.push(row);
    }

    return {
        surface,
        moneyness_nodes: DEFAULT_MONEYNESS_NODES.slice(0, skewMultipliers.length),
        expiry_days: DEFAULT_EXPIRY_DAYS.slice(0, termMultipliers.length),
    };
}

/**
 * Convert a VolSurface (decimal IV) to on-chain format (IV in bps, fixed-size arrays).
 */
export function volSurfaceToOnChain(surface: VolSurface): OnChainVolSurface {
    const MAX_NODES = 9;
    const MAX_EXPIRY = 4;

    const volBps: number[][] = [];
    for (let e = 0; e < MAX_EXPIRY; e++) {
        const row: number[] = [];
        for (let m = 0; m < MAX_NODES; m++) {
            const val = surface.surface[e]?.[m] ?? 0;
            row.push(Math.round(val * 10_000));
        }
        volBps.push(row);
    }

    const mNodes: number[] = new Array(MAX_NODES).fill(0);
    for (let i = 0; i < Math.min(surface.moneyness_nodes.length, MAX_NODES); i++) {
        mNodes[i] = Math.round(surface.moneyness_nodes[i] * 1_000_000);
    }

    const eDays: number[] = new Array(MAX_EXPIRY).fill(0);
    for (let i = 0; i < Math.min(surface.expiry_days.length, MAX_EXPIRY); i++) {
        eDays[i] = surface.expiry_days[i];
    }

    return {
        vol_surface: volBps,
        moneyness_nodes: mNodes,
        expiry_days: eDays,
        node_count: Math.min(surface.moneyness_nodes.length, MAX_NODES),
        expiry_count: Math.min(surface.expiry_days.length, MAX_EXPIRY),
    };
}

/**
 * Fit a vol surface from ATM oracle variance data.
 */
export function fitVolSurfaceFromOracle(varianceBps: number): OnChainVolSurface {
    const ivBps = Math.sqrt(varianceBps);
    const atmVol = ivBps / 10_000;
    const surface = buildVolSurface(atmVol);
    return volSurfaceToOnChain(surface);
}

/**
 * Bilinear interpolation on the vol surface to get IV for any moneyness/expiry.
 */
export function interpolateVolSurface(
    surface: VolSurface,
    moneyness: number,
    expiryDays: number,
): number {
    const { moneyness_nodes, expiry_days } = surface;

    // Find bracketing moneyness indices
    let mLow = 0;
    let mHigh = moneyness_nodes.length - 1;
    for (let i = 0; i < moneyness_nodes.length - 1; i++) {
        if (moneyness >= moneyness_nodes[i] && moneyness <= moneyness_nodes[i + 1]) {
            mLow = i;
            mHigh = i + 1;
            break;
        }
    }
    if (moneyness <= moneyness_nodes[0]) { mLow = 0; mHigh = 0; }
    if (moneyness >= moneyness_nodes[moneyness_nodes.length - 1]) { mLow = moneyness_nodes.length - 1; mHigh = moneyness_nodes.length - 1; }

    // Find bracketing expiry indices
    let eLow = 0;
    let eHigh = expiry_days.length - 1;
    for (let i = 0; i < expiry_days.length - 1; i++) {
        if (expiryDays >= expiry_days[i] && expiryDays <= expiry_days[i + 1]) {
            eLow = i;
            eHigh = i + 1;
            break;
        }
    }
    if (expiryDays <= expiry_days[0]) { eLow = 0; eHigh = 0; }
    if (expiryDays >= expiry_days[expiry_days.length - 1]) { eLow = expiry_days.length - 1; eHigh = expiry_days.length - 1; }

    // Bilinear interpolation
    const mRange = moneyness_nodes[mHigh] - moneyness_nodes[mLow];
    const eRange = expiry_days[eHigh] - expiry_days[eLow];

    const tm = mRange > 0 ? (moneyness - moneyness_nodes[mLow]) / mRange : 0;
    const te = eRange > 0 ? (expiryDays - expiry_days[eLow]) / eRange : 0;

    const v00 = surface.surface[eLow]?.[mLow] ?? 0;
    const v01 = surface.surface[eLow]?.[mHigh] ?? 0;
    const v10 = surface.surface[eHigh]?.[mLow] ?? 0;
    const v11 = surface.surface[eHigh]?.[mHigh] ?? 0;

    const v0 = v00 + tm * (v01 - v00);
    const v1 = v10 + tm * (v11 - v10);

    return v0 + te * (v1 - v0);
}

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
    volSurface?: VolSurface;
}): Promise<GreeksResult> {
    const { asset, spot, strike, expiry, optionType, volSurface } = params;

    const now = Date.now() / 1000;
    const timeToExpiry = Math.max((expiry - now) / (365 * 24 * 3600), 0);

    // If a vol surface is provided, interpolate IV from it
    let iv = params.iv ?? DEFAULT_IV;
    if (volSurface && spot > 0) {
        const moneyness = strike / spot;
        const expiryDays = timeToExpiry * 365;
        iv = interpolateVolSurface(volSurface, moneyness, expiryDays);
    }

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
            greeks = {
                delta: greeks.delta * pos.size,
                gamma: greeks.gamma * pos.size,
                theta: greeks.theta * pos.size,
                vega: greeks.vega * pos.size,
                rho: greeks.rho,
            };
        } else if (pos.type === "perp") {
            greeks = { delta: pos.size, gamma: 0, theta: 0, vega: 0, rho: 0 };
        } else {
            greeks = { delta: pos.size, gamma: 0, theta: 0, vega: 0, rho: 0 };
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

        const rep = positions.find((p) => p.asset === asset);
        const price = rep?.markPrice || 0;

        const netNotional = Math.abs(agg.delta * price);
        portfolioMargin += netNotional * MARGIN_RATES.perp.initial;

        // Gamma add-on: additional margin for convexity risk
        const gammaCharge = Math.abs(agg.gamma) * price * price * 0.01;
        portfolioMargin += gammaCharge;
    }

    const marginSaved = Math.max(totalIsolated - portfolioMargin, 0);
    const marginSavedPct = totalIsolated > 0 ? (marginSaved / totalIsolated) * 100 : 0;

    return {
        initialMargin: totalIsolated,
        maintenanceMargin: totalIsolated * MAINTENANCE_RATIO,
        portfolioMargin,
        marginSaved,
        marginSavedPct: Math.round(marginSavedPct * 100) / 100,
        positions: positionMargins,
        netDelta,
        netGamma,
    };
}

// ---------------------------------------------------------------------------
// Health calculation (from @tensor/core margin.ts)
// ---------------------------------------------------------------------------

const HEALTH_THRESHOLDS: Array<{ min: number; status: HealthStatus }> = [
    { min: 3.0, status: "healthy" },
    { min: 1.5, status: "warning" },
    { min: 1.0, status: "critical" },
];

/**
 * Evaluate the health of an account given positions, collateral, and unrealized PnL.
 */
export function calculateHealth(
    positions: Position[],
    collateral: number,
    unrealizedPnl: number = 0,
): HealthResult {
    const equity = collateral + unrealizedPnl;

    let totalMaintenance = 0;
    for (const p of positions) {
        const notional = Math.abs(p.size * p.markPrice);
        const rates = MARGIN_RATES[p.type];
        totalMaintenance += notional * rates.initial * MAINTENANCE_RATIO;
    }

    const marginRatio = totalMaintenance > 0 ? equity / totalMaintenance : Infinity;
    const liquidationDistance = Math.max(0, equity - totalMaintenance);

    let health: HealthStatus = "liquidatable";
    for (const threshold of HEALTH_THRESHOLDS) {
        if (marginRatio >= threshold.min) {
            health = threshold.status;
            break;
        }
    }

    return {
        equity,
        total_maintenance_margin: totalMaintenance,
        margin_ratio: marginRatio,
        liquidation_distance: liquidationDistance,
        health,
    };
}

// ---------------------------------------------------------------------------
// Delta-netting (from @tensor/core margin.ts)
// ---------------------------------------------------------------------------

/**
 * Return the initial-margin weight for a given instrument type.
 */
export function marginWeightFor(instrumentType: string): number {
    const weights: Record<string, number> = {
        perpetual: 0.10,
        perp: 0.10,
        spot: 0.10,
        lending: 0.05,
        option: 0.15,
    };
    return weights[instrumentType] ?? 0.10;
}

/**
 * Compute delta-netted margin. Groups positions by underlying asset,
 * calculates the net delta for each group, and determines margin reduction.
 */
export function deltaNet(positions: Position[]): DeltaNetResult {
    const groups: Record<string, { longDelta: number; shortDelta: number }> = {};
    let grossMargin = 0;

    for (const pos of positions) {
        const notional = Math.abs(pos.size * pos.markPrice);
        const weight = marginWeightFor(pos.type);
        grossMargin += notional * weight;

        const underlying = pos.asset.split("-")[0] || pos.asset;
        if (!groups[underlying]) {
            groups[underlying] = { longDelta: 0, shortDelta: 0 };
        }

        const delta = pos.size > 0 ? pos.size : 0;
        const shortDelta = pos.size < 0 ? Math.abs(pos.size) : 0;
        groups[underlying].longDelta += delta;
        groups[underlying].shortDelta += shortDelta;
    }

    const nettingGroups: NettingGroup[] = Object.entries(groups).map(
        ([asset, g]) => {
            const netDelta = Math.abs(g.longDelta - g.shortDelta);
            const grossDelta = g.longDelta + g.shortDelta;
            const reduction = grossDelta > 0 ? 1 - netDelta / grossDelta : 0;

            return {
                asset,
                long_delta: g.longDelta,
                short_delta: g.shortDelta,
                net_delta: netDelta,
                margin_reduction: reduction,
            };
        },
    );

    const avgReduction = nettingGroups.length > 0
        ? nettingGroups.reduce((sum, g) => sum + g.margin_reduction, 0) / nettingGroups.length
        : 0;

    const nettedMargin = grossMargin * (1 - avgReduction);
    const savings = grossMargin - nettedMargin;

    return {
        gross_margin: grossMargin,
        netted_margin: nettedMargin,
        savings,
        savings_pct: grossMargin > 0 ? (savings / grossMargin) * 100 : 0,
        netting_groups: nettingGroups,
    };
}

// ---------------------------------------------------------------------------
// Gamma limits and dynamic gamma margin scaling
// ---------------------------------------------------------------------------

/** Default gamma limits per account/market */
export const DEFAULT_GAMMA_LIMITS: GammaLimits = {
    max_account_gamma_notional: 0, // unlimited by default
    max_market_gamma_notional: 0,
};

/**
 * Dynamic gamma margin scaling — up to 5x additional margin for concentrated gamma.
 * As gamma exposure increases relative to the limit, margin scaling increases.
 */
export function calculateGammaMarginScale(
    gammaNotional: number,
    limit: number,
): number {
    if (limit <= 0) return 1.0; // unlimited
    const ratio = Math.abs(gammaNotional) / limit;
    if (ratio <= 0.5) return 1.0;
    if (ratio >= 1.0) return 5.0;
    // Linear scale from 1x at 50% to 5x at 100%
    return 1.0 + (ratio - 0.5) * 2 * 4.0;
}

/**
 * Check gamma concentration against limits.
 */
export function checkGammaLimits(
    gammaNotional: number,
    limits: GammaLimits = DEFAULT_GAMMA_LIMITS,
): { withinLimits: boolean; accountScale: number; warnings: string[] } {
    const warnings: string[] = [];
    let withinLimits = true;

    const accountScale = limits.max_account_gamma_notional > 0
        ? calculateGammaMarginScale(gammaNotional, limits.max_account_gamma_notional)
        : 1.0;

    if (limits.max_account_gamma_notional > 0 && Math.abs(gammaNotional) > limits.max_account_gamma_notional) {
        withinLimits = false;
        warnings.push(`Account gamma notional ${Math.abs(gammaNotional).toFixed(2)} exceeds limit ${limits.max_account_gamma_notional}`);
    }

    if (accountScale > 1.0) {
        warnings.push(`Gamma margin scaled to ${accountScale.toFixed(1)}x due to concentration`);
    }

    return { withinLimits, accountScale, warnings };
}

// ---------------------------------------------------------------------------
// Solver auctions (from @tensor/core solver-client.ts)
// ---------------------------------------------------------------------------

const solverRegistry: Map<string, SolverEntry> = new Map();

/**
 * Register a solver in the registry.
 */
export function registerSolver(entry: SolverEntry): void {
    solverRegistry.set(entry.solver, entry);
}

/**
 * Get all registered solvers.
 */
export function listSolvers(): SolverEntry[] {
    return Array.from(solverRegistry.values());
}

/**
 * Rank bids: for buys, highest bid wins; for sells, lowest bid wins.
 */
export function rankBids(bids: SolverBid[], side: "buy" | "sell"): SolverBid[] {
    const active = bids.filter((b) => b.is_active);
    return active.sort((a, b) =>
        side === "buy" ? b.bid_price - a.bid_price : a.bid_price - b.bid_price
    );
}

/**
 * Evaluate an auction and select the winning bid.
 */
export function evaluateAuction(bids: SolverBid[], side: "buy" | "sell"): SolverBid | null {
    const ranked = rankBids(bids, side);
    return ranked[0] || null;
}

/**
 * Process a full auction: rank bids, select winner, check profitability.
 */
export function processAuction(
    bids: SolverBid[],
    side: "buy" | "sell",
    gasCost: number,
    marketPrice: number,
): AuctionResult {
    const ranked = rankBids(bids, side);
    const winner = evaluateAuction(bids, side);

    if (!winner) {
        return { winner: null, ranked, isProfitable: false };
    }

    const isProfitable = side === "buy"
        ? winner.bid_price >= marketPrice + gasCost
        : winner.bid_price <= marketPrice - gasCost;

    return { winner, ranked, isProfitable };
}

/**
 * Evaluate whether to submit a bid on a given intent.
 */
export function evaluateBidOpportunity(params: {
    asset: string;
    side: "buy" | "sell";
    size: number;
    limitPrice: number;
    marketPrice: number;
    gasCostPerStep: number;
    minProfitBps: number;
}): BidEvaluation {
    const { side, size, limitPrice, marketPrice, gasCostPerStep, minProfitBps } = params;

    const spread = side === "buy"
        ? limitPrice - marketPrice
        : marketPrice - limitPrice;

    const totalProfit = spread * size;
    const netProfit = totalProfit - gasCostPerStep;
    const notional = size * marketPrice;
    const profitBps = notional > 0 ? (netProfit / notional) * 10_000 : 0;

    if (profitBps < minProfitBps) {
        return {
            shouldBid: false,
            bidPrice: 0,
            expectedProfit: netProfit,
            reason: `Profit ${profitBps.toFixed(1)} bps below minimum ${minProfitBps} bps`,
        };
    }

    const halfSpread = (limitPrice - marketPrice) / 2;
    const bidPrice = side === "buy"
        ? marketPrice + halfSpread
        : marketPrice - halfSpread;

    return {
        shouldBid: true,
        bidPrice,
        expectedProfit: netProfit,
        reason: `Profitable: ${profitBps.toFixed(1)} bps net profit`,
    };
}

/**
 * Find auctions that have ended and need settlement.
 */
export function findSettleableAuctions(
    currentTime: number,
    intentAuctionEnds: Record<string, number>,
): string[] {
    return Object.entries(intentAuctionEnds)
        .filter(([_, auctionEnd]) => auctionEnd > 0 && currentTime > auctionEnd)
        .map(([intentId]) => intentId);
}

// ---------------------------------------------------------------------------
// Intent solver (original API, preserved)
// ---------------------------------------------------------------------------

export async function solveIntent(params: {
    orders: IntentOrder[];
    currentPositions?: Position[];
}): Promise<IntentSolution> {
    const { orders, currentPositions = [] } = params;

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

    const mockPositions: Position[] = orders.map((o) => ({
        id: o.id,
        type: o.type,
        asset: o.asset,
        size: o.side === "buy" ? o.size : -o.size,
        entryPrice: 0,
        markPrice: 1000,
    }));

    const combined = [...currentPositions, ...mockPositions];
    const marginResult = await calculateMargin({ positions: combined });
    const currentMargin = currentPositions.length > 0
        ? (await calculateMargin({ positions: currentPositions })).portfolioMargin
        : 0;

    const marginImpact = marginResult.portfolioMargin - currentMargin;

    const totalSize = orders.reduce((sum, o) => sum + o.size, 0);
    const avgUrgency = orders.reduce((sum, o) => sum + urgencyOrder[o.urgency], 0) / orders.length;
    const estimatedSlippage = Math.min(totalSize * 0.001 * (1 + avgUrgency * 0.5), 5);

    const estimatedGas = orders.length * 150000;

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
// Portfolio risk analysis (original API, preserved)
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

    const dailyVol = DEFAULT_IV / Math.sqrt(365);
    const var99 = Math.abs(marginResult.netDelta) *
        (positions[0]?.markPrice || 0) * dailyVol * 2.326;

    const maxDrawdown = Math.round(var99 * 100) / 100;

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
    // Original API
    computeGreeks,
    calculateMargin,
    solveIntent,
    analyzeRisk,

    // Vol surface
    buildVolSurface,
    volSurfaceToOnChain,
    fitVolSurfaceFromOracle,
    interpolateVolSurface,
    DEFAULT_MONEYNESS_NODES,
    DEFAULT_EXPIRY_DAYS,
    DEFAULT_SKEW_MULTIPLIERS,
    DEFAULT_TERM_MULTIPLIERS,

    // Health & margin
    calculateHealth,
    marginWeightFor,
    deltaNet,

    // Gamma limits
    calculateGammaMarginScale,
    checkGammaLimits,
    DEFAULT_GAMMA_LIMITS,

    // Solver auctions
    registerSolver,
    listSolvers,
    rankBids,
    evaluateAuction,
    processAuction,
    evaluateBidOpportunity,
    findSettleableAuctions,
};
