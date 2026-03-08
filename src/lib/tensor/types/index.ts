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
}

export interface Greeks {
    delta: number;
    gamma: number;
    theta: number;        // per day
    vega: number;
    rho: number;
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
