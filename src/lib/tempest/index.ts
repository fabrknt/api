/**
 * Tempest — Dynamic AMM Fee Engine.
 *
 * - Volatility regime classification (5 levels)
 * - Dynamic fee estimation with piecewise-linear interpolation (6 breakpoints)
 * - Impermanent loss estimation (full-range + concentrated liquidity)
 * - LP range optimization for concentrated liquidity
 * - Fee curve configuration
 * - Chain-agnostic ChainAdapter interface (solana, evm)
 * - Keeper fail-safe (escalates fees if keeper goes down)
 * - Dust filter (minimum fee threshold)
 * - Momentum boost (up to 50% during vol spikes)
 * - Dynamic keeper rewards
 */

import type {
    VolRegime,
    FeeEstimate,
    VolRegimeClassification,
    FeeCurve,
    ILEstimate,
    LPRangeOptimization,
    FeeCurveConfig,
    OnChainFeeConfig,
    VolState,
    RecommendedRange,
    Chain,
    ChainAdapter,
    KeeperConfig,
    KeeperStatus,
    Regime,
} from "./types";

export { Regime, REGIME_NAMES, REGIME_COLORS } from "./types";

// Import shared pure functions from @fabrknt/tempest-core
import {
    classifyRegime as sdkClassifyRegime,
    interpolateFee as sdkInterpolateFee,
    DEFAULT_FEE_CONFIG as SDK_DEFAULT_FEE_CONFIG,
    estimateIL as sdkEstimateIL,
} from "@fabrknt/tempest-core";

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

// Default fee curve: regime -> fee in basis points
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
// On-chain fee config (6 breakpoints, vol in bps, fee in bps)
// From @fabrknt/tempest-core DEFAULT_FEE_CONFIG
// ---------------------------------------------------------------------------

/**
 * Default on-chain fee config — imported from @fabrknt/tempest-core.
 */
export const DEFAULT_ONCHAIN_FEE_CONFIG: OnChainFeeConfig = SDK_DEFAULT_FEE_CONFIG;

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

/**
 * Classify a volatility reading in bps into a Regime enum value.
 * Delegates to @fabrknt/tempest-core classifyRegime.
 */
export function classifyRegimeBps(volBps: number): number {
    return sdkClassifyRegime(volBps);
}

function volPercentile(volatility: number): number {
    const median = 0.60;
    const std = 0.30;
    const z = (volatility - median) / std;
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
// Piecewise-linear fee interpolation (on-chain format)
// ---------------------------------------------------------------------------

/**
 * Piecewise-linear interpolation of vol (in bps) to fee (in bps).
 * Delegates to @fabrknt/tempest-core interpolateFee.
 */
export function interpolateFeeBps(
    volBps: number,
    config: OnChainFeeConfig = DEFAULT_ONCHAIN_FEE_CONFIG,
): number {
    return sdkInterpolateFee(volBps, config);
}

// ---------------------------------------------------------------------------
// Dynamic fee estimation (original API, preserved)
// ---------------------------------------------------------------------------

function interpolateFee(volatility: number, config: FeeCurveConfig = DEFAULT_CONFIG): number {
    const regime = classifyRegime(volatility);
    const regimes: VolRegime[] = ["very_low", "low", "medium", "high", "extreme"];

    const midpoints = regimes.map((r) => {
        const t = REGIME_THRESHOLDS[r];
        return r === "extreme" ? t.min + 0.3 : (t.min + t.max) / 2;
    });
    const fees = regimes.map((r) => DEFAULT_FEE_CURVE[r]);

    const scaledFees = fees.map((f) =>
        config.baseFee + (f - config.baseFee) * config.sensitivity * 2,
    );

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
        confidence: volatility > 0 ? 85 : 50,
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

    const volPoints = [0.05, 0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 1.0, 1.2, 1.5, 2.0];
    const points = volPoints.map((vol) => ({
        vol,
        fee: interpolateFee(vol, config),
    }));

    const regime = classifyRegime(config.sensitivity * 0.80);

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

/**
 * Estimate IL for concentrated liquidity.
 * Delegates to @fabrknt/tempest-core estimateIL.
 */
export function estimateConcentratedIL(
    volBps: number,
    rangeLower: number,
    rangeUpper: number,
    holdingPeriodDays: number = 30,
): number {
    return sdkEstimateIL(volBps, rangeLower, rangeUpper, holdingPeriodDays);
}

export async function estimateIL(params: {
    pair: string;
    priceChangeRatio: number;
    liquidity?: number;
    dailyVolume?: number;
    feeBps?: number;
}): Promise<ILEstimate> {
    const {
        pair,
        priceChangeRatio,
        liquidity = 10000,
        dailyVolume = 1000000,
        feeBps = 30,
    } = params;

    const r = priceChangeRatio;
    const ilFraction = 2 * Math.sqrt(r) / (1 + r) - 1;
    const ilPercent = Math.abs(ilFraction) * 100;

    const holdValue = liquidity * (1 + r) / 2;
    const lpValueCorrected = liquidity * 2 * Math.sqrt(r) / (1 + r);
    const ilAbsolute = Math.abs(holdValue - lpValueCorrected);

    const feeRate = feeBps / 10000;
    const lpShare = liquidity / (liquidity + dailyVolume * 0.1);
    const dailyFees = dailyVolume * feeRate * lpShare;
    const breakEvenDays = dailyFees > 0 ? Math.ceil(ilAbsolute / dailyFees) : Infinity;

    return {
        pair,
        priceChangeRatio,
        ilPercent: Math.round(ilPercent * 100) / 100,
        ilAbsolute: Math.round(ilAbsolute * 100) / 100,
        holdValue: Math.round(holdValue * 100) / 100,
        lpValue: Math.round(lpValueCorrected * 100) / 100,
        feesEarned: Math.round(dailyFees * 30 * 100) / 100,
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
    timeHorizon?: number;
    riskTolerance?: number;
}): Promise<LPRangeOptimization> {
    const {
        pair,
        currentPrice,
        volatility,
        timeHorizon = 7,
        riskTolerance = 0.5,
    } = params;

    const regime = classifyRegime(volatility);

    const dailyVol = volatility / Math.sqrt(365);
    const periodVol = dailyVol * Math.sqrt(timeHorizon);
    const sigmas = 1.5 + riskTolerance * 1.5;

    const rangeMultiplier = Math.exp(sigmas * periodVol);
    const recommendedLower = currentPrice / rangeMultiplier;
    const recommendedUpper = currentPrice * rangeMultiplier;
    const rangeWidth = ((recommendedUpper - recommendedLower) / currentPrice) * 100;

    const sqrtRatio = Math.sqrt(recommendedUpper / recommendedLower);
    const capitalEfficiency = sqrtRatio / (sqrtRatio - 1);

    const feeBps = interpolateFee(volatility);
    const expectedAPR = (feeBps / 10000) * 365 * capitalEfficiency * 0.01;

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
// Keeper fail-safe system
// ---------------------------------------------------------------------------

const DEFAULT_KEEPER_CONFIG: KeeperConfig = {
    failSafeMultiplier: 2.0,
    heartbeatTimeout: 120,
    dustThreshold: 1,
    maxMomentumBoost: 1.5,
    baseKeeperRewardBps: 5,
};

const keeperState: Map<string, KeeperStatus> = new Map();

/**
 * Record a keeper heartbeat for a pool.
 */
export function keeperHeartbeat(poolId: string): KeeperStatus {
    const now = Date.now();
    const existing = keeperState.get(poolId);

    const status: KeeperStatus = {
        lastHeartbeat: now,
        isResponsive: true,
        currentMultiplier: 1.0,
        rewardAccumulated: existing?.rewardAccumulated || 0,
    };

    keeperState.set(poolId, status);
    return status;
}

/**
 * Check keeper status for a pool.
 * If keeper is unresponsive, the fail-safe escalation multiplier is applied.
 */
export function getKeeperStatus(
    poolId: string,
    config: KeeperConfig = DEFAULT_KEEPER_CONFIG,
): KeeperStatus {
    const status = keeperState.get(poolId);
    const now = Date.now();

    if (!status) {
        return {
            lastHeartbeat: 0,
            isResponsive: false,
            currentMultiplier: config.failSafeMultiplier,
            rewardAccumulated: 0,
        };
    }

    const elapsed = (now - status.lastHeartbeat) / 1000;
    const isResponsive = elapsed < config.heartbeatTimeout;

    let currentMultiplier = 1.0;
    if (!isResponsive) {
        const overduePeriods = Math.floor(elapsed / config.heartbeatTimeout);
        currentMultiplier = Math.min(
            1.0 + (config.failSafeMultiplier - 1.0) * overduePeriods,
            config.failSafeMultiplier * 2,
        );
    }

    return {
        lastHeartbeat: status.lastHeartbeat,
        isResponsive,
        currentMultiplier,
        rewardAccumulated: status.rewardAccumulated,
    };
}

// ---------------------------------------------------------------------------
// Dust filter
// ---------------------------------------------------------------------------

/**
 * Apply dust filter: if the computed fee is below the dust threshold,
 * return the threshold instead.
 */
export function applyDustFilter(
    feeBps: number,
    dustThreshold: number = DEFAULT_KEEPER_CONFIG.dustThreshold,
): number {
    return Math.max(feeBps, dustThreshold);
}

// ---------------------------------------------------------------------------
// Momentum boost
// ---------------------------------------------------------------------------

/**
 * Apply momentum boost during vol spikes.
 * When vol is rising quickly, boost the fee by up to maxMomentumBoost (default 50%).
 */
export function applyMomentumBoost(
    feeBps: number,
    currentVol: number,
    previousVol: number,
    maxBoost: number = DEFAULT_KEEPER_CONFIG.maxMomentumBoost,
): number {
    if (previousVol <= 0) return feeBps;

    const momentum = (currentVol - previousVol) / previousVol;
    if (momentum <= 0) return feeBps;

    const boostFraction = Math.min(momentum, 1.0);
    const boostMultiplier = 1.0 + (maxBoost - 1.0) * boostFraction;

    return feeBps * boostMultiplier;
}

// ---------------------------------------------------------------------------
// Dynamic keeper rewards
// ---------------------------------------------------------------------------

/**
 * Calculate the keeper reward for a crank operation.
 * Rewards scale with vol regime: higher vol = higher reward.
 */
export function calculateKeeperReward(
    regime: VolRegime,
    baseBps: number = DEFAULT_KEEPER_CONFIG.baseKeeperRewardBps,
): number {
    const multipliers: Record<VolRegime, number> = {
        very_low: 0.5,
        low: 0.75,
        medium: 1.0,
        high: 1.5,
        extreme: 2.0,
    };
    return baseBps * (multipliers[regime] || 1.0);
}

/**
 * Record a keeper reward earned.
 */
export function recordKeeperReward(poolId: string, rewardBps: number): void {
    const status = keeperState.get(poolId);
    if (status) {
        status.rewardAccumulated += rewardBps;
    }
}

// ---------------------------------------------------------------------------
// Full fee computation with all modifiers
// ---------------------------------------------------------------------------

/**
 * Compute the final dynamic fee with all modifiers applied:
 * 1. Base piecewise-linear interpolation
 * 2. Keeper fail-safe multiplier
 * 3. Momentum boost
 * 4. Dust filter
 */
export function computeDynamicFee(params: {
    volBps: number;
    previousVolBps?: number;
    poolId?: string;
    feeConfig?: OnChainFeeConfig;
    keeperConfig?: KeeperConfig;
}): { feeBps: number; regime: VolRegime; keeperMultiplier: number; momentumBoost: number } {
    const {
        volBps,
        previousVolBps,
        poolId,
        feeConfig = DEFAULT_ONCHAIN_FEE_CONFIG,
        keeperConfig = DEFAULT_KEEPER_CONFIG,
    } = params;

    // 1. Base fee from piecewise-linear interpolation
    let feeBps = interpolateFeeBps(volBps, feeConfig);

    // 2. Keeper fail-safe
    let keeperMultiplier = 1.0;
    if (poolId) {
        const ks = getKeeperStatus(poolId, keeperConfig);
        keeperMultiplier = ks.currentMultiplier;
        feeBps *= keeperMultiplier;
    }

    // 3. Momentum boost
    let momentumBoost = 1.0;
    if (previousVolBps !== undefined && previousVolBps > 0) {
        const boostedFee = applyMomentumBoost(feeBps, volBps, previousVolBps, keeperConfig.maxMomentumBoost);
        momentumBoost = feeBps > 0 ? boostedFee / feeBps : 1.0;
        feeBps = boostedFee;
    }

    // 4. Dust filter
    feeBps = applyDustFilter(feeBps, keeperConfig.dustThreshold);

    const volAnnualized = volBps / 10000;
    const regime = classifyRegime(volAnnualized);

    return {
        feeBps: Math.round(feeBps * 100) / 100,
        regime,
        keeperMultiplier,
        momentumBoost,
    };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const tempest = {
    // Original API
    classifyVolRegime,
    estimateFee,
    getFeeCurve,
    estimateIL,
    optimizeLPRange,

    // On-chain fee interpolation
    interpolateFeeBps,
    classifyRegimeBps,
    DEFAULT_ONCHAIN_FEE_CONFIG,

    // Concentrated IL
    estimateConcentratedIL,

    // Keeper system
    keeperHeartbeat,
    getKeeperStatus,

    // Fee modifiers
    applyDustFilter,
    applyMomentumBoost,
    calculateKeeperReward,
    recordKeeperReward,

    // Full computation
    computeDynamicFee,
};
