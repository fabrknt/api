# Tempest — Volatility-Responsive Dynamic Fee Hook

Uniswap v4 hook that dynamically adjusts swap fees based on real-time realized volatility. Protects LPs during vol spikes and attracts volume during calm markets. Chain-agnostic core SDK with EVM and Solana adapters.

## Endpoint

```
POST /api/quicknode/tempest/{apiKey}
POST /api/tempest  (standalone)
```

## Methods

### estimate_fee

Calculate dynamic fee for a trading pair based on current volatility.

```json
{
  "method": "estimate_fee",
  "params": {
    "pair": "SOL/USDC",
    "volatility": 0.55
  }
}
```

**Parameters:**
- `pair` (required) — Trading pair (e.g., `SOL/USDC`, `ETH/USDT`)
- `volatility` (required) — Annualized volatility (0-2+)
- `config` (optional) — Custom fee curve configuration

### classify_vol_regime

Classify current volatility into one of 5 regimes.

```json
{
  "method": "classify_vol_regime",
  "params": {
    "pair": "SOL/USDC",
    "volatility": 0.55,
    "volatility24h": 0.48
  }
}
```

**Volatility Regimes:**

| Regime | Vol Range (bps) | Annualized | Fee Range (bps) | Rationale |
|--------|----------------|------------|-----------------|-----------|
| `very_low` | 0-2000 | < 20% | 5-10 | Attract volume in calm markets |
| `low` | 2000-3500 | 20-35% | 10-30 | Standard competitive fee |
| `normal` | 3500-5000 | 35-50% | 30-60 | Moderate LP compensation |
| `high` | 5000-7500 | 50-75% | 60-150 | Compensate LPs for IL risk |
| `extreme` | > 7500 | > 75% | 150-500 | Circuit breaker / LP protection |

### get_fee_curve

Get the full piecewise-linear fee curve across the volatility range.

```json
{
  "method": "get_fee_curve",
  "params": {
    "pair": "SOL/USDC"
  }
}
```

### estimate_il

Estimate impermanent loss for a concentrated liquidity position.

```json
{
  "method": "estimate_il",
  "params": {
    "pair": "SOL/USDC",
    "priceChangeRatio": 0.3,
    "liquidity": 1000000,
    "dailyVolume": 5000000,
    "feeBps": 30
  }
}
```

### optimize_lp_range

Get LP range recommendation for concentrated liquidity positions based on current volatility.

```json
{
  "method": "optimize_lp_range",
  "params": {
    "pair": "SOL/USDC",
    "currentPrice": 150,
    "volatility": 0.55,
    "timeHorizon": 7,
    "riskTolerance": "medium"
  }
}
```

## Resilience Mechanisms

- **Keeper Fail-Safe** — If no volatility update within `staleFeeThreshold` (default 1 hour), fees automatically escalate to cap (500 bps) to protect LPs
- **Dust Trade Filter** — Per-pool `minSwapSize` prevents vol manipulation via tiny swaps
- **Momentum Adjustment** — Fee boosted up to 50% when current vol exceeds 7-day EMA
- **Dynamic Keeper Rewards** — Reward scales with gas price to ensure keeper profitability at any congestion level

## SDK Packages

| Package | Description |
|---------|-------------|
| `@fabrknt/tempest-core` | Chain-agnostic types, algorithms, and client (zero dependencies) |
| `@fabrknt/tempest-evm` | EVM adapter implementing ChainAdapter via viem |
| `@fabrknt/tempest-solana` | Solana adapter scaffold (awaiting program deployment) |
| `@fabrknt/tempest-qn-addon` | QuickNode Marketplace add-on (`fabrknt-dynamic-fees`) |

## Contracts

- **TickObserver** — Gas-optimized circular buffer (4 obs/slot, 1024 capacity)
- **VolatilityEngine** — Annualized realized vol, regime classification, EMA smoothing
- **FeeCurve** — Piecewise linear vol-to-fee mapping with 6 governance-adjustable control points
- **TempestHook** — Main Uniswap v4 hook (afterInitialize, beforeSwap, afterSwap, updateVolatility)

## QuickNode Add-on

**Fabrknt Dynamic Fees** (`fabrknt-dynamic-fees`) with endpoints for volatility computation, regime classification, fee calculation, fee simulation, LP range, and IL estimation.

## Plan Limits

| Plan | Monthly Requests |
|------|-----------------|
| Free | 100 |
| Starter | 1,000 |
| Growth | 10,000 |
| Business | 100,000 |
