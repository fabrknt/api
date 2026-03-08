# FABRKNT API

Compliance, privacy, and data infrastructure for DeFi — delivered as REST APIs and QuickNode Marketplace add-ons.

## Three Pillars, Five Products

### Compliance

| Product | Endpoint | What it does |
|---------|----------|-------------|
| **Complr** | `POST /api/quicknode/complr/[apiKey]` | Sanctions screening (OFAC, UN, EU, MAS, SFC, FSA), Travel Rule compliance, SAR/STR reporting, audit trails |
| **Accredit** | `POST /api/accredit` | KYC/AML enforcement, jurisdiction-gated access, accredited investor verification, transfer restrictions |
| **Sentinel** | `POST /api/sentinel` | Pre-transaction threat detection (12 patterns), contract security scoring, MEV exposure analysis |

### Privacy

| Product | Endpoint | What it does |
|---------|----------|-------------|
| **Veil** | `POST /api/veil` | ZK compliance proofs, encrypted PII storage, privacy framework assessment (GDPR/APPI/PDPA/CCPA), consent management |

### Data

| Product | Endpoint | What it does |
|---------|----------|-------------|
| **Stratum** | `POST /api/stratum` | Sanctions list aggregation, regulatory update feeds, data pipeline health monitoring |

## API Reference

All endpoints accept JSON-RPC style requests:

```json
{
  "method": "screen_wallet",
  "params": {
    "address": "0x...",
    "jurisdictions": ["MAS", "FSA"]
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
| `check_jurisdiction` | `address`, `jurisdiction`, `protocolType?` | Verify jurisdiction eligibility |
| `verify_accreditation` | `address`, `jurisdiction?` | Check accredited investor status |
| `check_transfer` | `from`, `to`, `jurisdictions?` | Validate transfer restrictions |

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
| `encrypt_data` | `data`, `accessPolicy?`, `expiresInDays?` | Encrypt PII for compliant storage |
| `assess_privacy` | `address`, `frameworks[]`, `dataCategories?` | Privacy framework assessment |
| `record_consent` | `address`, `purpose`, `framework`, `granted?` | Record user consent |
| `get_consent` | `address`, `purpose?` | Retrieve consent records |

### Stratum Methods

| Method | Params | Description |
|--------|--------|-------------|
| `check_sanctions` | `address` | Check address against aggregated sanctions lists |
| `get_sanctions_list` | `listSource?`, `limit?` | Browse sanctions list entries |
| `get_regulatory_updates` | `jurisdiction?`, `impact?`, `limit?` | Latest regulatory changes |
| `get_health` | — | Data pipeline health status |
| `get_feed_status` | `feedId` | Individual feed status |

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
- **Database:** PostgreSQL via Prisma
- **Language:** TypeScript
- **Hosting:** Vercel

## Development

```bash
npm install
cp .env.example .env.local
npm run dev          # http://localhost:3000
npm run db:generate  # Regenerate Prisma client
npm run db:push      # Push schema to database
```

### Environment Variables

```env
DATABASE_URL=postgresql://...
QUICKNODE_PROVISION_USERNAME=your-username
QUICKNODE_PROVISION_PASSWORD=your-password
NEXT_PUBLIC_URL=https://api.fabrknt.com
```

## Architecture

```
src/
  lib/
    complr/          Sanctions screening, Travel Rule, audit trails
    accredit/        KYC enforcement, jurisdiction controls
    sentinel/        Pre-tx threat detection, contract scoring
    veil/            ZK proofs, encrypted storage, privacy compliance
    stratum/         Sanctions aggregation, regulatory feeds
    quicknode/       QuickNode Basic Auth middleware
    db.ts            Prisma client
  app/
    api/
      quicknode/     QuickNode provisioning + Complr customer API
      accredit/      Accredit API
      sentinel/      Sentinel API
      veil/          Veil API
      stratum/       Stratum API
```

Stratum provides the shared data layer — Complr uses `stratum.checkSanctions()` for wallet screening, and other products can tap into Stratum for sanctions data and regulatory feeds.

## Related Repos

| Repo | Description |
|------|-------------|
| [fabrknt/scorecard](https://github.com/fabrknt/scorecard) | DeFi Compliance Scorecard — rates 20 protocols |
| [fabrknt/forge](https://github.com/fabrknt/forge) | Reference app dogfooding all 5 products |
| [fabrknt/website](https://github.com/fabrknt/website) | Landing page at fabrknt.com |

## License

MIT
