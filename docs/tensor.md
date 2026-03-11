# Tensor — Unified Margin Engine

Unified margin engine with Greeks-aware portfolio margining across perpetuals, options, spot, and lending. Volatility surface interpolation, intent language for multi-leg trades, solver auctions, and ZK credit scores.

## Endpoint

```
POST /api/quicknode/tensor/{apiKey}
POST /api/tensor  (standalone)
```

## Methods

### compute_greeks

Calculate Black-Scholes greeks and theoretical price for an option, with optional vol surface interpolation.

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

Calculate portfolio margin with delta-netting across positions. Greeks-aware risk engine with gamma and vega charges.

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

### solve_intent

Optimize execution order for a multi-leg trading intent. The solver decomposes intents into optimal execution sequences, ordering hedging legs first to minimize peak margin.

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

## Key Features

- **Portfolio Margining** — Delta-netting across spot, perps, and options reduces margin for hedged positions to near zero
- **Greeks-Aware Risk** — Gamma and vega charges capture non-linear option risk. Theta decay tracked.
- **Volatility Surface** — Bilinear interpolation over moneyness x expiry grid (9 strikes, 4 tenors)
- **Dynamic Gamma Margin** — Gamma margin scales up when realized vol exceeds implied vol (capped at 5x base)
- **Gamma Concentration Limits** — Per-account and per-market gamma limits tiered by investor category (Retail/Qualified/Institutional)
- **Intent Language** — Declarative multi-leg trading intents (delta-neutral spread, covered call) with constraint validation
- **Solver Auctions** — Decentralized intent execution via competitive bidding with collateral staking and slashing
- **ZK Credit Scores** — Privacy-preserving credit tiers (Bronze through Platinum) reducing initial margin by up to 20%
- **Identity-Gated Leverage** — Sovereign reputation tiers map to investor categories (Retail 5x, Qualified 20x, Institutional 50x)
- **374 tests** (249 Rust + 125 TypeScript), all passing

## Chain-Agnostic Core

Core algorithm crates (`tensor-types`, `tensor-math`, `tensor-intents`, `tensor-solver`) are chain-agnostic with an `anchor` feature flag controlling Solana dependencies.

## Keeper Bots

- **Crank Bot** — Settles expired solver auctions and refreshes stale margin accounts
- **Vol Surface Keeper** — Reads oracle variance, builds vol surfaces, updates on-chain
- **Liquidation Bot** — Scans for undercollateralized accounts and liquidates them

## QuickNode Add-on

**Fabrknt Margin Engine** (`fabrknt-margin-engine`) with endpoints for margin calculations, Greeks computation, and multi-leg trading intents.

## Plan Limits

| Plan | Monthly Requests |
|------|-----------------|
| Free | 100 |
| Starter | 1,000 |
| Growth | 10,000 |
| Business | 100,000 |
