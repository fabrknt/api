export type VolRegime = "very_low" | "low" | "medium" | "high" | "extreme";

export interface FeeEstimate {
    pair: string;
    baseFee: number;           // basis points
    dynamicFee: number;        // basis points (adjusted for vol)
    totalFee: number;          // basis points
    regime: VolRegime;
    volatility: number;        // annualized vol
    confidence: number;        // 0-100
    estimatedAt: number;
}

export interface VolRegimeClassification {
    pair: string;
    regime: VolRegime;
    volatility: number;        // annualized
    volatility24h: number;     // 24h realized vol
    percentile: number;        // historical vol percentile (0-100)
    regimeThresholds: Record<VolRegime, { min: number; max: number }>;
    classifiedAt: number;
}

export interface FeeCurve {
    pair: string;
    regime: VolRegime;
    points: { vol: number; fee: number }[];  // piecewise-linear curve
    interpolation: "linear";
    minFee: number;            // basis points
    maxFee: number;            // basis points
}

export interface ILEstimate {
    pair: string;
    priceChangeRatio: number;  // e.g. 1.5 = 50% price increase
    ilPercent: number;         // impermanent loss as percentage
    ilAbsolute: number;        // IL in USD for given liquidity
    holdValue: number;         // value if held
    lpValue: number;           // value if provided liquidity
    feesEarned: number;        // estimated fees to offset IL
    netPnl: number;            // fees - IL
    breakEvenDays: number;     // days of fees to offset IL
    estimatedAt: number;
}

export interface LPRangeOptimization {
    pair: string;
    currentPrice: number;
    recommendedLower: number;
    recommendedUpper: number;
    rangeWidth: number;        // as percentage
    expectedAPR: number;       // estimated fee APR
    capitalEfficiency: number; // vs full range
    regime: VolRegime;
    timeHorizon: number;       // days
    optimizedAt: number;
}

export interface FeeCurveConfig {
    pair: string;
    baseFee: number;           // basis points at very_low vol
    maxFee: number;            // basis points at extreme vol
    sensitivity: number;       // 0-1, how responsive to vol changes
    smoothing: number;         // EMA periods for vol calculation
}

// ---------------------------------------------------------------------------
// On-chain types — re-exported from @tempest/core
// ---------------------------------------------------------------------------

import {
    Regime,
    REGIME_NAMES,
    REGIME_COLORS,
} from "@tempest/core";

import type {
    VolState,
    FeeConfig,
    PoolInfo,
    VolSample,
    RecommendedRange,
} from "@tempest/core";

export { Regime, REGIME_NAMES, REGIME_COLORS };
export type { VolState, PoolInfo, VolSample, RecommendedRange };
export type OnChainFeeConfig = FeeConfig;

// ---------------------------------------------------------------------------
// Chain adapter types (from @tempest/core)
// ---------------------------------------------------------------------------

export type Chain = "solana" | "evm";

export interface ChainAdapter {
    readonly chain: Chain;
    getVolState(poolId: string): Promise<VolState>;
    getCurrentFee(poolId: string): Promise<number>;
    getRecommendedRange(poolId: string, currentTick: number): Promise<RecommendedRange>;
    getObservationCount(poolId: string): Promise<number>;
    isPoolInitialized(poolId: string): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Keeper types
// ---------------------------------------------------------------------------

export interface KeeperConfig {
    /** Fee escalation multiplier when keeper is unresponsive */
    failSafeMultiplier: number;
    /** Seconds before keeper is considered unresponsive */
    heartbeatTimeout: number;
    /** Minimum fee to apply when dust filter is active (bps) */
    dustThreshold: number;
    /** Maximum momentum boost multiplier (e.g. 1.5 = up to 50% boost) */
    maxMomentumBoost: number;
    /** Base keeper reward in bps */
    baseKeeperRewardBps: number;
}

export interface KeeperStatus {
    lastHeartbeat: number;
    isResponsive: boolean;
    currentMultiplier: number;
    rewardAccumulated: number;
}
