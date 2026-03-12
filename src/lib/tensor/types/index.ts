export type OptionType = "call" | "put";
export type PositionType = "perp" | "option" | "spot" | "lending";

export interface Position {
    id: string;
    type: PositionType;
    asset: string;
    size: number;         // positive = long, negative = short
    entryPrice: number;
    markPrice: number;
    // Option-specific
    strike?: number;
    expiry?: number;      // unix timestamp
    optionType?: OptionType;
    // Extended fields (from @tensor/core)
    side?: "long" | "short";
    instrumentType?: string;
}

export interface Greeks {
    delta: number;
    gamma: number;
    theta: number;        // per day
    vega: number;
    rho?: number;
}

export interface MarginResult {
    initialMargin: number;
    maintenanceMargin: number;
    portfolioMargin: number;       // after delta-netting
    marginSaved: number;           // savings from netting
    marginSavedPct: number;        // percentage saved
    positions: PositionMargin[];
    netDelta: number;
    netGamma: number;
}

export interface PositionMargin {
    id: string;
    asset: string;
    type: PositionType;
    isolatedMargin: number;
    greeks: Greeks;
}

export interface GreeksResult {
    asset: string;
    spot: number;
    strike: number;
    expiry: number;
    optionType: OptionType;
    iv: number;
    greeks: Greeks;
    theoreticalPrice: number;
    timeToExpiry: number;  // in years
    calculatedAt: number;
}

export interface IntentOrder {
    id: string;
    type: PositionType;
    asset: string;
    side: "buy" | "sell";
    size: number;
    urgency: "low" | "medium" | "high";
}

export interface IntentSolution {
    orders: IntentOrder[];
    executionSequence: string[];  // order IDs in optimal sequence
    estimatedSlippage: number;
    estimatedGas: number;
    marginImpact: number;         // change in portfolio margin
    recommendation: string;
    solvedAt: number;
}

export interface RiskAnalysis {
    portfolioValue: number;
    totalMargin: number;
    marginRatio: number;          // margin / portfolio value
    maxDrawdown: number;          // estimated max drawdown at 99% VaR
    liquidationPrice: number | null;
    riskLevel: "safe" | "moderate" | "elevated" | "danger";
    warnings: string[];
    analyzedAt: number;
}

// ---------------------------------------------------------------------------
// Types re-exported from @tensor/core
// ---------------------------------------------------------------------------

import type {
    VolSurface as SdkVolSurface,
    SolverBid as SdkSolverBid,
    SolverEntry as SdkSolverEntry,
    GammaLimits as SdkGammaLimits,
    HealthStatus as SdkHealthStatus,
    HealthResult as SdkHealthResult,
    NettingGroup as SdkNettingGroup,
    DeltaNetResult as SdkDeltaNetResult,
} from "@tensor/core";

// Re-export types from SDK — these are structurally identical
export type VolSurface = SdkVolSurface;
export type SolverBid = SdkSolverBid;
export type SolverEntry = SdkSolverEntry;
export type GammaLimits = SdkGammaLimits;
export type HealthStatus = SdkHealthStatus;
export type HealthResult = SdkHealthResult;
export type NettingGroup = SdkNettingGroup;
export type DeltaNetResult = SdkDeltaNetResult;

/**
 * On-chain vol surface format (IV in bps, fixed-size arrays).
 */
export interface OnChainVolSurface {
    vol_surface: number[][];       // IV in bps (e.g. 3000 = 30%)
    moneyness_nodes: number[];     // 1e6 fixed-point
    expiry_days: number[];
    node_count: number;
    expiry_count: number;
}

export interface BidEvaluation {
    shouldBid: boolean;
    bidPrice: number;
    expectedProfit: number;
    reason: string;
}

export interface AuctionResult {
    winner: SolverBid | null;
    ranked: SolverBid[];
    isProfitable: boolean;
}
