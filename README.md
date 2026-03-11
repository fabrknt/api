# FABRKNT API

Plug-in compliance for DeFi protocols serving TradFi — delivered as REST APIs and QuickNode Marketplace add-ons. No rebuilds required.

## Seven Plug-in Products

### Compliance

| Product | Endpoint | What it does |
|---------|----------|-------------|
| **Complr** | `POST /api/quicknode/complr/[apiKey]` | AI-powered compliance engine (MAS, SFC, FSA), OFAC/TRM Labs/Chainalysis screening, Travel Rule, SAR/STR generation, confidence scoring, human-in-the-loop review queue |
| **Accredit** | `POST /api/accredit` | On-chain KYC/AML enforcement via Token-2022 transfer hooks, compliant DEX routing, asset wrapping (cUSDC/cSOL), multi-provider KYC (Civic, World ID), Sovereign identity |
| **Sentinel** | `POST /api/sentinel` | Pre-transaction security analysis (17 patterns: 8 Solana + 9 EVM), simulation sandbox, execution pattern builders (DCA, grid, rebalance), Jito + Flashbots bundle management |

### Privacy

| Product | Endpoint | What it does |
|---------|----------|-------------|
| **Veil** | `POST /api/veil` | Chain-agnostic NaCl Box encryption, Shamir secret sharing, Noir ZK proofs, encrypted swap orders for MEV protection, MCP server for AI agents, 5 Solana privacy apps |

### Data

| Product | Endpoint | What it does |
|---------|----------|-------------|
| **Stratum** | `POST /api/stratum` | Multi-chain state primitives (800x state reduction): Bitfield, Merkle, Expiry, Events, Resurrection. Solana (Anchor) + EVM (Solidity/Foundry) |

### DeFi

| Product | Endpoint | What it does |
|---------|----------|-------------|
| **Tensor** | `POST /api/tensor` | Unified margin engine with Greeks-aware portfolio margining, vol surface interpolation, intent language, solver auctions, ZK credit scores, identity-gated leverage |
| **Tempest** | `POST /api/tempest` | Uniswap v4 volatility-responsive dynamic fee hook with keeper, staleness fail-safe, dust filter, momentum adjustment, chain-agnostic core SDK |

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
| `screen_wallet` | `address`, `jurisdictions?`, `chain?` | Screen wallet against OFAC/TRM Labs/Chainalysis (multi-chain, auto-detect) |
| `check_transaction` | `transactionId`, `senderWallet`, `recipientWallet`, `amount`, `currency`, `chain?` | Single transaction compliance check across MAS/SFC/FSA |
| `check_batch` | `transactions[]` | Batch check up to 50 transactions in parallel |
| `query` | `question`, `jurisdiction?` | Regulatory knowledge base query with AI-powered answers |
| `query_confident` | `question`, `jurisdiction?` | Query with confidence scoring, citations, hallucination detection |
| `generate_report` | `transactionId`, `jurisdiction`, `reportType` | Auto-draft SAR/STR in regulator-specific formats |
| `analyze_obligations` | `document`, `jurisdiction?` | Extract structured obligations from regulatory documents |

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
| `analyze_transaction` | `transaction`, `mode?`, `riskTolerance?` | Detect threats using 17 patterns (8 Solana + 9 EVM) |
| `simulate_transaction` | `transaction`, `rpcUrl?` | Pre-execution simulation with automatic fallback |
| `build_pattern` | `pattern`, `params` | Build execution plans (batch payout, DCA, grid, rebalance, vesting) |
| `submit_bundle` | `chain`, `transactions`, `blockNumber?` | Submit atomic bundles via Jito (Solana) or Flashbots (EVM) |

### Veil Methods

| Method | Params | Description |
|--------|--------|-------------|
| `generate_keypair` | -- | Generate random NaCl Box encryption keypair |
| `derive_keypair` | `seed` | Derive deterministic keypair from 32-byte seed |
| `encrypt` | `plaintext`, `recipientPublicKey`, `senderSecretKey`, `senderPublicKey` | NaCl Box encrypt |
| `decrypt` | `bytes`, `senderPublicKey`, `recipientSecretKey`, `recipientPublicKey` | NaCl Box decrypt |
| `encrypt_multiple` | `plaintext`, `recipientPublicKeys[]`, `senderSecretKey`, `senderPublicKey` | Encrypt for multiple recipients |
| `shamir_split` | `secret`, `threshold`, `totalShares` | Split secret into M-of-N Shamir shares |
| `shamir_combine` | `shares[]` | Reconstruct secret from Shamir shares |
| `encrypt_order` | `minOutputAmount`, `slippageBps`, `deadline`, `solverPublicKey`, `userSecretKey`, `userPublicKey` | Encrypt DEX swap order for MEV protection |
| `decrypt_order` | `bytes`, `userPublicKey`, `solverSecretKey`, `solverPublicKey` | Decrypt encrypted swap order |

### Stratum Methods

| Method | Params | Description |
|--------|--------|-------------|
| `merkle_build` | `leaves[]` | Build a Merkle tree from a set of leaves |
| `merkle_proof` | `treeId`, `leafIndex` | Generate an inclusion proof for a leaf |
| `merkle_verify` | `proof[]`, `root`, `leaf` | Verify a proof against a root |
| `bitfield_create` | `capacity` | Create a new bitfield for compact state tracking |
| `bitfield_set` | `bitfieldId`, `index` | Set a bit in a bitfield |
| `bitfield_check` | `bitfieldId`, `index` | Check whether a bit is set |

### Tensor Methods

| Method | Params | Description |
|--------|--------|-------------|
| `compute_greeks` | `asset`, `spot`, `strike`, `expiry`, `optionType`, `iv?` | Black-Scholes greeks with optional vol surface interpolation |
| `calculate_margin` | `positions[]` | Greeks-aware portfolio margin with delta-netting, gamma/vega charges |
| `solve_intent` | `orders[]`, `currentPositions?` | Decompose multi-leg intents into optimal execution sequences |
| `analyze_risk` | `positions[]` | Portfolio-level VaR, liquidation price, gamma concentration limits |

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

| Regime | Annualized Vol | Fee Range (bps) |
|--------|---------------|-----------------|
| `very_low` | < 20% | 5-10 |
| `low` | 20-35% | 10-30 |
| `normal` | 35-50% | 30-60 |
| `high` | 50-75% | 60-150 |
| `extreme` | > 75% | 150-500 |

## QuickNode Marketplace

All 7 products are available as QuickNode Marketplace add-ons with automatic provisioning.

### Customer API

Each provisioned add-on gets a unique API key. Use it to call the product API:

```
POST /api/quicknode/{product}/{apiKey}
```

Where `{product}` is one of: `complr`, `accredit`, `sentinel`, `veil`, `stratum`, `tensor`, `tempest`.

### Provisioning Lifecycle

| Endpoint | Description |
|----------|-------------|
| `POST /api/quicknode/provision` | Create instance when user adds add-on (pass `product` field) |
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
- **Encryption:** NaCl Box / Curve25519-XSalsa20-Poly1305 (Veil)
- **Sanctions Data:** Multi-provider (OFAC SDN, TRM Labs, Chainalysis)

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
    complr/          AI compliance engine (MAS/SFC/FSA), screening, SAR/STR, confidence scoring
    accredit/        On-chain KYC enforcement, transfer hooks, compliant routing, asset wrapping
    sentinel/        17-pattern threat detection, simulation sandbox, execution patterns, bundles
    veil/            NaCl encryption, Shamir sharing, ZK proofs, encrypted orders, MCP server
    stratum/         Multi-chain state primitives: Merkle, Bitfield, Expiry, Events, Resurrection
    tensor/          Unified margin engine, Greeks, vol surface, intents, solver auctions
    tempest/         Uniswap v4 dynamic fee hook, keeper, vol regimes, LP optimization
    quicknode/       QuickNode Basic Auth middleware
    db.ts            Prisma client
  app/
    api/
      quicknode/     QuickNode provisioning + multi-product customer API
      accredit/      Accredit API
      sentinel/      Sentinel API
      veil/          Veil API
      stratum/       Stratum API
      tensor/        Tensor API
      tempest/       Tempest API
```

Each product is a standalone service that works independently or together. Stratum provides state primitives (Merkle, Bitfield) used by other products for data integrity. Complr handles off-chain compliance while Accredit handles on-chain enforcement.

## Documentation

Per-product user documentation with request/response examples:

| Product | Docs |
|---------|------|
| Complr | [docs/complr.md](docs/complr.md) |
| Accredit | [docs/accredit.md](docs/accredit.md) |
| Sentinel | [docs/sentinel.md](docs/sentinel.md) |
| Veil | [docs/veil.md](docs/veil.md) |
| Stratum | [docs/stratum.md](docs/stratum.md) |
| Tensor | [docs/tensor.md](docs/tensor.md) |
| Tempest | [docs/tempest.md](docs/tempest.md) |

## Related Repos

| Repo | Description |
|------|-------------|
| [fabrknt/scorecard](https://github.com/fabrknt/scorecard) | DeFi Compliance Readiness dashboard at fabrknt.com |
| [fabrknt/forge](https://github.com/fabrknt/forge) | Reference app showing all 7 Fabrknt plug-ins in action |

## License

MIT
