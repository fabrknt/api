# FABRKNT API

Compliance, privacy, DeFi, and data infrastructure for blockchain — delivered as REST APIs and QuickNode Marketplace add-ons.

## Four Pillars, Seven Products

### Compliance

| Product | Endpoint | What it does |
|---------|----------|-------------|
| **Complr** | `POST /api/quicknode/complr/[apiKey]` | Sanctions screening (OFAC, UN, EU, MAS, SFC, FSA), Travel Rule compliance, SAR/STR reporting, audit trails |
| **Accredit** | `POST /api/accredit` | KYC/AML enforcement, jurisdiction-gated access, accredited investor verification, transfer restrictions, Travel Rule checks |
| **Sentinel** | `POST /api/sentinel` | Pre-transaction threat detection (12 patterns), contract security scoring, MEV exposure analysis, DEX swap sandwich detection |

### Privacy

| Product | Endpoint | What it does |
|---------|----------|-------------|
| **Veil** | `POST /api/veil` | ZK compliance proofs, AES-256-GCM encrypted PII storage, privacy framework assessment (GDPR/APPI/PDPA/CCPA), consent management |

### Data

| Product | Endpoint | What it does |
|---------|----------|-------------|
| **Stratum** | `POST /api/stratum` | Live OFAC SDN sanctions feed, sanctions list aggregation, regulatory update feeds, data pipeline health monitoring |

### DeFi

| Product | Endpoint | What it does |
|---------|----------|-------------|
| **Tensor** | `POST /api/tensor` | Portfolio margin engine with Black-Scholes greeks, delta-netting (30%+ margin savings), intent solver for execution optimization |
| **Tempest** | `POST /api/tempest` | Dynamic AMM fee curves (5 vol regimes), impermanent loss estimation, LP range optimization for concentrated liquidity |

## API Reference

All endpoints accept JSON-RPC style requests:

```json
{
  "method": "check_sanctions",
  "params": {
    "address": "0x..."
  }
}
```

### Complr Methods

| Method | Params | Description |
|--------|--------|-------------|
| `screen_wallet` | `address`, `jurisdictions?` | Screen wallet against sanctions lists |
| `screen_pool` | `protocol`, `poolId`, `jurisdictions?` | Check protocol/pool compliance |
| `check_allocation` | `allocations[]` | Portfolio compliance alerts |

### Accredit Methods

| Method | Params | Description |
|--------|--------|-------------|
| `screen_identity` | `address`, `jurisdictions?` | Check KYC verification status |
| `check_jurisdiction` | `address`, `jurisdiction`, `protocolType?`, `exposureUsd?` | Verify jurisdiction eligibility |
| `verify_accreditation` | `address`, `jurisdiction?` | Check accredited investor status |
| `check_transfer` | `from`, `to`, `jurisdictions?`, `amountUsd?` | Validate transfer restrictions + Travel Rule |
| `register_kyc` | `address`, `kycLevel`, `investorType`, `jurisdictions`, `expiresInDays?` | Register KYC record |

### Sentinel Methods

| Method | Params | Description |
|--------|--------|-------------|
| `analyze_transaction` | `from`, `to`, `data?`, `value?`, `chain?` | Detect threats in pending transactions |
| `analyze_contract` | `address`, `chain?` | Security scoring for smart contracts |
| `analyze_mev` | `txHash`, `chain?` | MEV exposure analysis |

### Veil Methods

| Method | Params | Description |
|--------|--------|-------------|
| `generate_proof` | `address`, `proofType`, `claims?` | Generate ZK compliance proof |
| `verify_proof` | `proofId`, `proofHash` | Verify an existing proof |
| `encrypt_data` | `data`, `accessPolicy[]`, `expiresInDays?` | AES-256-GCM encrypt PII for compliant storage |
| `assess_privacy` | `address`, `frameworks[]`, `dataCategories?` | Privacy framework assessment |
| `record_consent` | `address`, `purpose`, `framework`, `granted`, `expiresInDays?` | Record user consent |
| `get_consent` | `address`, `purpose?` | Retrieve consent records |

### Stratum Methods

| Method | Params | Description |
|--------|--------|-------------|
| `check_sanctions` | `address` | Check address against live OFAC SDN + aggregated sanctions lists |
| `get_sanctions_list` | `listSource?`, `limit?` | Browse sanctions list entries |
| `get_regulatory_updates` | `jurisdiction?`, `impact?`, `limit?` | Latest regulatory changes |
| `get_health` | — | Data pipeline health status |
| `get_feed_status` | `feedId` | Individual feed status |

### Tensor Methods

| Method | Params | Description |
|--------|--------|-------------|
| `compute_greeks` | `asset`, `spot`, `strike`, `expiry`, `optionType`, `iv?` | Black-Scholes greeks + theoretical price |
| `calculate_margin` | `positions[]` | Portfolio margin with delta-netting |
| `solve_intent` | `orders[]`, `currentPositions?` | Optimize execution order for a set of orders |
| `analyze_risk` | `positions[]` | Portfolio-level VaR, liquidation price, risk warnings |

#### Position Object

```json
{
  "id": "p1",
  "type": "perp",
  "asset": "ETH",
  "size": 10,
  "entryPrice": 1900,
  "markPrice": 2000,
  "strike": 2100,
  "expiry": 1788220800,
  "optionType": "call"
}
```

`type`: `perp` | `option` | `spot` | `lending`

### Tempest Methods

| Method | Params | Description |
|--------|--------|-------------|
| `estimate_fee` | `pair`, `volatility`, `config?` | Dynamic fee for a trading pair based on volatility |
| `classify_vol_regime` | `pair`, `volatility`, `volatility24h?` | Classify into 5 vol regimes |
| `get_fee_curve` | `pair`, `config?` | Full piecewise-linear fee curve across vol range |
| `estimate_il` | `pair`, `priceChangeRatio`, `liquidity?`, `dailyVolume?`, `feeBps?` | Impermanent loss estimation with fee offset |
| `optimize_lp_range` | `pair`, `currentPrice`, `volatility`, `timeHorizon?`, `riskTolerance?` | LP range recommendation for concentrated liquidity |

#### Volatility Regimes

| Regime | Annualized Vol | Default Fee (bps) |
|--------|---------------|-------------------|
| `very_low` | 0–20% | 5 |
| `low` | 20–40% | 10 |
| `medium` | 40–70% | 30 |
| `high` | 70–120% | 60 |
| `extreme` | 120%+ | 100 |

## QuickNode Marketplace

Complr is available as a QuickNode Marketplace add-on with automatic provisioning.

### Provisioning Lifecycle

| Endpoint | Description |
|----------|-------------|
| `POST /api/quicknode/provision` | Create instance when user adds add-on |
| `POST /api/quicknode/deprovision` | Remove instance when user removes add-on |
| `POST /api/quicknode/update` | Handle plan changes |
| `POST /api/quicknode/deactivate_endpoint` | Deactivate endpoint |

### Plan Limits

| Plan | Monthly Requests |
|------|-----------------|
| Free | 100 |
| Starter | 1,000 |
| Growth | 10,000 |
| Business | 100,000 |

## Tech Stack

- **Framework:** Next.js 16 with App Router
- **Database:** PostgreSQL (Supabase) via Prisma 7
- **Language:** TypeScript
- **Hosting:** Vercel
- **Encryption:** AES-256-GCM (Veil)
- **Sanctions Data:** Live OFAC SDN feed from US Treasury (24h cache)

## Development

```bash
npm install
cp .env.example .env.local
npm run dev          # http://localhost:3000
npm run db:generate  # Regenerate Prisma client
npm run db:push      # Push schema to database
npm test             # Run tests
```

### Environment Variables

```env
DATABASE_URL=postgresql://...
QUICKNODE_PROVISION_USERNAME=your-username
QUICKNODE_PROVISION_PASSWORD=your-password
NEXT_PUBLIC_URL=https://api.fabrknt.com
VEIL_MASTER_KEY=your-encryption-key
```

## Architecture

```
src/
  lib/
    complr/          Sanctions screening, Travel Rule, audit trails
    accredit/        KYC enforcement, jurisdiction controls, Travel Rule
    sentinel/        Pre-tx threat detection, contract scoring, MEV analysis
    veil/            AES-256-GCM encryption, ZK proofs, privacy compliance
    stratum/         Live OFAC SDN feed, regulatory updates, pipeline health
    tensor/          Portfolio margin, Black-Scholes greeks, intent solver
    tempest/         Dynamic AMM fees, IL estimation, LP range optimization
    quicknode/       QuickNode Basic Auth middleware
    db.ts            Prisma client
  app/
    api/
      quicknode/     QuickNode provisioning + Complr customer API
      accredit/      Accredit API
      sentinel/      Sentinel API
      veil/          Veil API
      stratum/       Stratum API
      tensor/        Tensor API
      tempest/       Tempest API
```

Stratum provides the shared data layer — Complr uses `stratum.checkSanctions()` for wallet screening, and other products can tap into Stratum for sanctions data and regulatory feeds.

## Related Repos

| Repo | Description |
|------|-------------|
| [fabrknt/scorecard](https://github.com/fabrknt/scorecard) | DeFi Compliance Scorecard + Products page at fabrknt.com |
| [fabrknt/forge](https://github.com/fabrknt/forge) | Reference app dogfooding all 7 products |

## License

MIT
