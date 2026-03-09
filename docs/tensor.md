# Tensor — Portfolio Margin Engine

Plug-in portfolio margin with Black-Scholes greeks, delta-netting (30%+ margin savings), and intent solver for execution optimization.

## Endpoint

```
POST /api/quicknode/tensor/{apiKey}
POST /api/tensor  (standalone)
```

## Methods

### compute_greeks

Calculate Black-Scholes greeks and theoretical price for an option.

```json
{
  "method": "compute_greeks",
  "params": {
    "asset": "ETH",
    "spot": 2000,
    "strike": 2100,
    "expiry": 1788220800,
    "optionType": "call",
    "iv": 0.8
  }
}
```

**Parameters:**
- `asset` (required) — Asset symbol
- `spot` (required) — Current spot price
- `strike` (required) — Strike price
- `expiry` (required) — Expiry timestamp (Unix seconds)
- `optionType` (required) — `call` or `put`
- `iv` (optional) — Implied volatility (default: 0.8 = 80% annualized)

**Response:**
```json
{
  "result": {
    "asset": "ETH",
    "greeks": {
      "delta": 0.42,
      "gamma": 0.0012,
      "theta": -4.5,
      "vega": 8.2,
      "rho": 0.15
    },
    "theoreticalPrice": 185.30
  }
}
```

### calculate_margin

Calculate portfolio margin with delta-netting across positions.

```json
{
  "method": "calculate_margin",
  "params": {
    "positions": [
      { "id": "p1", "type": "perp", "asset": "ETH", "size": 10, "entryPrice": 1900, "markPrice": 2000 },
      { "id": "p2", "type": "option", "asset": "ETH", "size": -5, "entryPrice": 200, "markPrice": 185, "strike": 2100, "expiry": 1788220800, "optionType": "call" }
    ]
  }
}
```

**Position types:** `perp`, `option`, `spot`, `lending`

**Margin rates:**
| Type | Initial | Maintenance |
|------|---------|-------------|
| Perp | 10% | 5% |
| Option | 15% | 10% |
| Spot | 100% | 100% |
| Lending | 20% | 15% |

### solve_intent

Optimize execution order for a set of orders to minimize margin impact.

```json
{
  "method": "solve_intent",
  "params": {
    "orders": [
      { "id": "o1", "asset": "ETH", "side": "buy", "size": 5, "price": 2000, "type": "limit" },
      { "id": "o2", "asset": "BTC", "side": "sell", "size": 0.5, "price": 60000, "type": "limit" }
    ],
    "currentPositions": []
  }
}
```

### analyze_risk

Portfolio-level risk analysis with VaR estimation and liquidation prices.

```json
{
  "method": "analyze_risk",
  "params": {
    "positions": [
      { "id": "p1", "type": "perp", "asset": "ETH", "size": 10, "entryPrice": 1900, "markPrice": 2000 }
    ]
  }
}
```

## Plan Limits

| Plan | Monthly Requests |
|------|-----------------|
| Free | 100 |
| Starter | 1,000 |
| Growth | 10,000 |
| Business | 100,000 |
