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
// Vol surface types (from @tensor/core)
// ---------------------------------------------------------------------------

/**
 * Vol surface: IV values indexed [expiry_bucket][moneyness_node], annualized.
 * 9 moneyness nodes x 4 expiry buckets.
 */
export interface VolSurface {
    surface: number[][];           // [expiry][moneyness], annualized (e.g. 0.30 = 30%)
    moneyness_nodes: number[];     // strike/spot ratios (e.g. 0.7, 0.8, ..., 1.2)
    expiry_days: number[];         // expiry bucket boundaries in days
}

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

// ---------------------------------------------------------------------------
// Solver types (from @tensor/core)
// ---------------------------------------------------------------------------

export interface SolverBid {
    solver: string;
    bid_price: number;
    bid_timestamp: string;
    is_active: boolean;
}

export interface SolverEntry {
    solver: string;
    stake: number;
    total_fills: number;
    total_volume: number;
    slash_count: number;
    is_active: boolean;
    registered_at: string;
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

// ---------------------------------------------------------------------------
// Gamma limits (from @tensor/core)
// ---------------------------------------------------------------------------

export interface GammaLimits {
    /** Max absolute gamma notional per account (0 = unlimited) */
    max_account_gamma_notional: number;
    /** Max absolute gamma notional per market (0 = unlimited) */
    max_market_gamma_notional: number;
}

// ---------------------------------------------------------------------------
// Health types (from @tensor/core)
// ---------------------------------------------------------------------------

export type HealthStatus = "healthy" | "warning" | "critical" | "liquidatable";

export interface HealthResult {
    equity: number;
    total_maintenance_margin: number;
    margin_ratio: number;
    liquidation_distance: number;
    health: HealthStatus;
}

// ---------------------------------------------------------------------------
// Delta-netting types (from @tensor/core)
// ---------------------------------------------------------------------------

export interface NettingGroup {
    asset: string;
    long_delta: number;
    short_delta: number;
    net_delta: number;
    margin_reduction: number;
}

export interface DeltaNetResult {
    gross_margin: number;
    netted_margin: number;
    savings: number;
    savings_pct: number;
    netting_groups: NettingGroup[];
}
