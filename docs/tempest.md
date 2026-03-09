# Tempest — Dynamic AMM Fee Engine

Plug-in dynamic AMM fee curves, impermanent loss estimation, and LP range optimization for concentrated liquidity.

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

| Regime | Annualized Vol | Default Fee (bps) |
|--------|---------------|-------------------|
| `very_low` | 0–20% | 5 |
| `low` | 20–40% | 10 |
| `medium` | 40–70% | 30 |
| `high` | 70–120% | 60 |
| `extreme` | 120%+ | 100 |

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

Estimate impermanent loss with fee offset for a given price change.

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

**Parameters:**
- `pair` (required) — Trading pair
- `priceChangeRatio` (required) — Expected price change (e.g., 0.3 = 30%)
- `liquidity` (optional) — Pool liquidity in USD
- `dailyVolume` (optional) — Daily trading volume in USD
- `feeBps` (optional) — Fee in basis points

### optimize_lp_range

Get LP range recommendation for concentrated liquidity positions.

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

**Parameters:**
- `pair` (required) — Trading pair
- `currentPrice` (required) — Current price
- `volatility` (required) — Annualized volatility
- `timeHorizon` (optional) — Holding period in days (default: 7)
- `riskTolerance` (optional) — `conservative`, `medium`, `aggressive`

## Plan Limits

| Plan | Monthly Requests |
|------|-----------------|
| Free | 100 |
| Starter | 1,000 |
| Growth | 10,000 |
| Business | 100,000 |
