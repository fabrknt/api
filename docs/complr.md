# Complr — Sanctions Screening & Compliance

Plug-in sanctions screening, Travel Rule compliance, and SAR/STR reporting for existing DeFi protocols.

## Endpoint

```
POST /api/quicknode/complr/{apiKey}
POST /api/complr  (standalone)
```

## Methods

### screen_wallet

Screen a wallet address against OFAC, UN, EU, and APAC sanctions lists.

```json
{
  "method": "screen_wallet",
  "params": {
    "address": "0x1234...",
    "jurisdictions": ["MAS", "SFC", "FSA"]
  }
}
```

**Parameters:**
- `address` (required) — Wallet address to screen
- `jurisdictions` (optional) — Filter by jurisdiction: `MAS`, `SFC`, `FSA`

**Response:**
```json
{
  "result": {
    "address": "0x1234...",
    "sanctioned": false,
    "riskLevel": "low",
    "lists": [],
    "jurisdictions": ["MAS", "SFC", "FSA"]
  }
}
```

### screen_pool

Check a protocol pool for compliance readiness.

```json
{
  "method": "screen_pool",
  "params": {
    "protocol": "jupiter",
    "poolId": "SOL-USDC",
    "jurisdictions": ["MAS"]
  }
}
```

**Parameters:**
- `protocol` (required) — Protocol name
- `poolId` (required) — Pool identifier
- `jurisdictions` (optional) — Jurisdiction filter

### check_allocation

Check a portfolio allocation for compliance alerts.

```json
{
  "method": "check_allocation",
  "params": {
    "allocations": [
      { "protocol": "jupiter", "pool": "SOL-USDC", "percentage": 40 },
      { "protocol": "raydium", "pool": "SOL-USDT", "percentage": 60 }
    ]
  }
}
```

**Parameters:**
- `allocations` (required) — Array of allocation objects with `protocol`, `pool`, `percentage`

## Plan Limits

| Plan | Monthly Requests |
|------|-----------------|
| Free | 100 |
| Starter | 1,000 |
| Growth | 10,000 |
| Business | 100,000 |
