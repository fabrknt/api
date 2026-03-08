/**
 * Tempest — Dynamic AMM Fee Engine.
 *
 * - Volatility regime classification (5 levels)
 * - Dynamic fee estimation with piecewise-linear interpolation
 * - Impermanent loss estimation
 * - LP range optimization for concentrated liquidity
 * - Fee curve configuration
 */

import type {
    VolRegime,
    FeeEstimate,
    VolRegimeClassification,
    FeeCurve,
    ILEstimate,
    LPRangeOptimization,
    FeeCurveConfig,
} from "./types";

// ---------------------------------------------------------------------------
// Volatility regime thresholds (annualized vol)
// ---------------------------------------------------------------------------

const REGIME_THRESHOLDS: Record<VolRegime, { min: number; max: number }> = {
    very_low: { min: 0, max: 0.20 },       // 0-20%
    low: { min: 0.20, max: 0.40 },          // 20-40%
    medium: { min: 0.40, max: 0.70 },       // 40-70%
    high: { min: 0.70, max: 1.20 },         // 70-120%
    extreme: { min: 1.20, max: Infinity },   // 120%+
};

// Default fee curve: regime → fee in basis points
const DEFAULT_FEE_CURVE: Record<VolRegime, number> = {
    very_low: 5,    // 0.05%
    low: 10,        // 0.10%
    medium: 30,     // 0.30%
    high: 60,       // 0.60%
    extreme: 100,   // 1.00%
};

// Default fee curve config
const DEFAULT_CONFIG: FeeCurveConfig = {
    pair: "default",
    baseFee: 5,
    maxFee: 100,
    sensitivity: 0.5,
    smoothing: 20,
};

// ---------------------------------------------------------------------------
// Volatility regime classification
// ---------------------------------------------------------------------------

function classifyRegime(volatility: number): VolRegime {
    if (volatility < REGIME_THRESHOLDS.very_low.max) return "very_low";
    if (volatility < REGIME_THRESHOLDS.low.max) return "low";
    if (volatility < REGIME_THRESHOLDS.medium.max) return "medium";
    if (volatility < REGIME_THRESHOLDS.high.max) return "high";
    return "extreme";
}

function volPercentile(volatility: number): number {
    // Approximate percentile assuming log-normal vol distribution
    // Median crypto vol ~60%, std ~30%
    const median = 0.60;
    const std = 0.30;
    const z = (volatility - median) / std;

    // Simple sigmoid approximation of CDF
    const percentile = 100 / (1 + Math.exp(-1.7 * z));
    return Math.round(Math.min(Math.max(percentile, 0), 100));
}

export async function classifyVolRegime(params: {
    pair: string;
    volatility: number;
    volatility24h?: number;
}): Promise<VolRegimeClassification> {
    const { pair, volatility, volatility24h = volatility } = params;

    return {
        pair,
        regime: classifyRegime(volatility),
        volatility,
        volatility24h,
        percentile: volPercentile(volatility),
        regimeThresholds: REGIME_THRESHOLDS,
        classifiedAt: Date.now(),
    };
}

// ---------------------------------------------------------------------------
// Dynamic fee estimation
// ---------------------------------------------------------------------------

function interpolateFee(volatility: number, config: FeeCurveConfig = DEFAULT_CONFIG): number {
    const regime = classifyRegime(volatility);
    const regimes: VolRegime[] = ["very_low", "low", "medium", "high", "extreme"];
    const idx = regimes.indexOf(regime);

    // Piecewise-linear interpolation between regime midpoints
    const midpoints = regimes.map((r) => {
        const t = REGIME_THRESHOLDS[r];
        return r === "extreme" ? t.min + 0.3 : (t.min + t.max) / 2;
    });
    const fees = regimes.map((r) => DEFAULT_FEE_CURVE[r]);

    // Apply sensitivity scaling
    const scaledFees = fees.map((f) =>
        config.baseFee + (f - config.baseFee) * config.sensitivity * 2,
    );

    // Find interpolation segment
    if (volatility <= midpoints[0]) return Math.max(scaledFees[0], config.baseFee);
    if (volatility >= midpoints[midpoints.length - 1]) return Math.min(scaledFees[scaledFees.length - 1], config.maxFee);

    for (let i = 0; i < midpoints.length - 1; i++) {
        if (volatility >= midpoints[i] && volatility < midpoints[i + 1]) {
            const t = (volatility - midpoints[i]) / (midpoints[i + 1] - midpoints[i]);
            const fee = scaledFees[i] + t * (scaledFees[i + 1] - scaledFees[i]);
            return Math.round(Math.min(Math.max(fee, config.baseFee), config.maxFee) * 100) / 100;
        }
    }

    return DEFAULT_FEE_CURVE[regime];
}

export async function estimateFee(params: {
    pair: string;
    volatility: number;
    config?: FeeCurveConfig;
}): Promise<FeeEstimate> {
    const { pair, volatility, config } = params;

    const regime = classifyRegime(volatility);
    const baseFee = DEFAULT_FEE_CURVE.very_low;
    const dynamicFee = interpolateFee(volatility, config) - baseFee;

    return {
        pair,
        baseFee,
        dynamicFee: Math.max(dynamicFee, 0),
        totalFee: baseFee + Math.max(dynamicFee, 0),
        regime,
        volatility,
        confidence: volatility > 0 ? 85 : 50, // lower confidence without real data
        estimatedAt: Date.now(),
    };
}

// ---------------------------------------------------------------------------
// Fee curve generation
// ---------------------------------------------------------------------------

export async function getFeeCurve(params: {
    pair: string;
    config?: FeeCurveConfig;
}): Promise<FeeCurve> {
    const { pair, config = DEFAULT_CONFIG } = params;

    // Generate curve points across vol range
    const volPoints = [0.05, 0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 1.0, 1.2, 1.5, 2.0];
    const points = volPoints.map((vol) => ({
        vol,
        fee: interpolateFee(vol, config),
    }));

    // Current regime for the pair
    const regime = classifyRegime(config.sensitivity * 0.80); // default to medium assumption

    return {
        pair,
        regime,
        points,
        interpolation: "linear",
        minFee: config.baseFee,
        maxFee: config.maxFee,
    };
}

// ---------------------------------------------------------------------------
// Impermanent loss estimation
// ---------------------------------------------------------------------------

export async function estimateIL(params: {
    pair: string;
    priceChangeRatio: number;
    liquidity?: number;       // USD value of LP position
    dailyVolume?: number;     // USD daily trading volume
    feeBps?: number;          // current fee in basis points
}): Promise<ILEstimate> {
    const {
        pair,
        priceChangeRatio,
        liquidity = 10000,
        dailyVolume = 1000000,
        feeBps = 30,
    } = params;

    // IL formula: IL = 2 * sqrt(r) / (1 + r) - 1, where r = price ratio
    const r = priceChangeRatio;
    const ilFraction = 2 * Math.sqrt(r) / (1 + r) - 1;
    const ilPercent = Math.abs(ilFraction) * 100;

    // Value comparison
    const holdValue = liquidity * (1 + r) / 2; // 50/50 portfolio
    const lpValue = liquidity * Math.sqrt(r) / ((1 + r) / 2) * ((1 + r) / 2);
    // Simplified: lpValue = liquidity * 2 * sqrt(r) / (1 + r)
    const lpValueCorrected = liquidity * 2 * Math.sqrt(r) / (1 + r);
    const ilAbsolute = Math.abs(holdValue - lpValueCorrected);

    // Fee estimation
    const feeRate = feeBps / 10000;
    const lpShare = liquidity / (liquidity + dailyVolume * 0.1); // rough share of pool
    const dailyFees = dailyVolume * feeRate * lpShare;
    const breakEvenDays = dailyFees > 0 ? Math.ceil(ilAbsolute / dailyFees) : Infinity;

    return {
        pair,
        priceChangeRatio,
        ilPercent: Math.round(ilPercent * 100) / 100,
        ilAbsolute: Math.round(ilAbsolute * 100) / 100,
        holdValue: Math.round(holdValue * 100) / 100,
        lpValue: Math.round(lpValueCorrected * 100) / 100,
        feesEarned: Math.round(dailyFees * 30 * 100) / 100,  // 30-day estimate
        netPnl: Math.round((dailyFees * 30 - ilAbsolute) * 100) / 100,
        breakEvenDays: breakEvenDays === Infinity ? -1 : breakEvenDays,
        estimatedAt: Date.now(),
    };
}

// ---------------------------------------------------------------------------
// LP range optimization (concentrated liquidity)
// ---------------------------------------------------------------------------

export async function optimizeLPRange(params: {
    pair: string;
    currentPrice: number;
    volatility: number;
    timeHorizon?: number;    // days
    riskTolerance?: number;  // 0-1, higher = wider range
}): Promise<LPRangeOptimization> {
    const {
        pair,
        currentPrice,
        volatility,
        timeHorizon = 7,
        riskTolerance = 0.5,
    } = params;

    const regime = classifyRegime(volatility);

    // Expected price range based on vol and time horizon
    // Using ±2σ move for the given time horizon
    const dailyVol = volatility / Math.sqrt(365);
    const periodVol = dailyVol * Math.sqrt(timeHorizon);
    const sigmas = 1.5 + riskTolerance * 1.5; // 1.5σ to 3σ based on risk tolerance

    const rangeMultiplier = Math.exp(sigmas * periodVol);
    const recommendedLower = currentPrice / rangeMultiplier;
    const recommendedUpper = currentPrice * rangeMultiplier;
    const rangeWidth = ((recommendedUpper - recommendedLower) / currentPrice) * 100;

    // Capital efficiency vs full range (Uniswap v3 style)
    // Efficiency ≈ sqrt(upper/lower) / (sqrt(upper/lower) - 1)
    const sqrtRatio = Math.sqrt(recommendedUpper / recommendedLower);
    const capitalEfficiency = sqrtRatio / (sqrtRatio - 1);

    // Expected fee APR (simplified)
    const feeBps = interpolateFee(volatility);
    const dailyVolEstimate = currentPrice * 1000000; // placeholder volume
    const expectedAPR = (feeBps / 10000) * 365 * capitalEfficiency * 0.01; // rough estimate

    return {
        pair,
        currentPrice,
        recommendedLower: Math.round(recommendedLower * 100) / 100,
        recommendedUpper: Math.round(recommendedUpper * 100) / 100,
        rangeWidth: Math.round(rangeWidth * 100) / 100,
        expectedAPR: Math.round(expectedAPR * 10000) / 10000,
        capitalEfficiency: Math.round(capitalEfficiency * 100) / 100,
        regime,
        timeHorizon,
        optimizedAt: Date.now(),
    };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const tempest = {
    classifyVolRegime,
    estimateFee,
    getFeeCurve,
    estimateIL,
    optimizeLPRange,
};
