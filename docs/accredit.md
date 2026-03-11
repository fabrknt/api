# Accredit — On-Chain KYC/AML Enforcement

Chain-agnostic KYC/AML compliance infrastructure. On-chain transfer enforcement, compliant DEX routing, asset wrapping, and multi-provider KYC integration as reusable building blocks for regulated token applications.

## Endpoint

```
POST /api/quicknode/accredit/{apiKey}
POST /api/accredit  (standalone)
```

## Architecture

Four layers:

- **Core Layer** — Chain-agnostic compliance types and logic. KYC levels, jurisdiction checks, trade limits, whitelist/blacklist management.
- **Routing Layer** — Compliance-aware DEX aggregation. Routes filtered through audited, whitelisted pools. Jupiter integration (Solana). Optional ZK proof support.
- **Wrapper Layer** — Compliant asset wrapping. Wraps tokens (e.g., USDC, SOL) into KYC-gated Token-2022 equivalents (cUSDC, cSOL) with 1:1 backing.
- **Identity Layer** — Multi-provider KYC integration (Civic Pass, World ID) with aggregation strategies. Institutional compliance dashboard.

## Methods

### screen_identity

Check KYC verification status for an address.

```json
{
  "method": "screen_identity",
  "params": {
    "address": "0x1234...",
    "jurisdictions": ["MAS", "SFC"]
  }
}
```

### check_jurisdiction

Verify whether an address is eligible to transact in a jurisdiction.

```json
{
  "method": "check_jurisdiction",
  "params": {
    "address": "0x1234...",
    "jurisdiction": "MAS",
    "protocolType": "exchange"
  }
}
```

### verify_accreditation

Check accredited investor status.

```json
{
  "method": "verify_accreditation",
  "params": {
    "address": "0x1234...",
    "jurisdiction": "MAS"
  }
}
```

### check_transfer

Validate transfer restrictions and Travel Rule compliance via Token-2022 transfer hooks.

```json
{
  "method": "check_transfer",
  "params": {
    "from": "0xabc...",
    "to": "0xdef...",
    "jurisdictions": ["MAS", "FSA"],
    "amountUsd": 5000
  }
}
```

### register_kyc

Register a KYC record for an address with tiered levels.

```json
{
  "method": "register_kyc",
  "params": {
    "address": "0x1234...",
    "kycLevel": 2,
    "investorType": "accredited",
    "jurisdictions": ["MAS"],
    "expiresInDays": 365
  }
}
```

### check_route_compliance

Verify a DEX route passes only through audited, whitelisted pools.

```json
{
  "method": "check_route_compliance",
  "params": {
    "route": ["pool_1", "pool_2", "pool_3"]
  }
}
```

## Solana Programs

| Program | ID | Description |
|---------|----|-------------|
| Transfer Hook | `5DLH...gSL` | Token-2022 transfer hook — KYC enforcement on every transfer |
| Compliant Registry | `66tK...nYA` | On-chain registry of audited DEX pools for route verification |
| Compliant Wrapper | `CWRPx...j1L` | KYC-gated asset wrapping (deposit USDC, receive cUSDC) |
| Sovereign | -- | Universal identity and multi-dimensional reputation |

## KYC Levels

| Level | Description | Per-Transaction Limit |
|-------|-------------|----------------------|
| Basic | Email + phone verification | 100,000 JPY |
| Standard | Government ID document | 10,000,000 JPY |
| Enhanced | Video call + address proof | 100,000,000 JPY |
| Institutional | Corporate KYC/KYB | Unlimited |

## KYC Providers

- **Civic Pass** — On-chain gateway tokens for liveness, ID verification, and uniqueness
- **World ID** — ZK proof-of-personhood via Worldcoin API
- **Provider Aggregator** — Multi-provider consensus with strategies: `any`, `all`, `majority`, `highest`

## Sovereign Identity

Universal identity and multi-dimensional reputation protocol:
- 5 reputation dimensions: Trading, Civic, Developer, Infra, Creator
- Tiered progression: Bronze, Silver, Gold, Platinum, Diamond
- Creator DAO extension and Admission Market extension

## TypeScript Packages

| Package | Description | Chain |
|---------|-------------|-------|
| `@accredit/core` | Shared type definitions (enums, interfaces, constants) | Agnostic |
| `@accredit/sdk` | PDA derivation, KycClient, RegistryClient, WrapperClient | Solana |
| `@accredit/router` | ComplianceAwareRouter, Jupiter integration, ZK proofs | Solana |
| `@accredit/kyc-providers` | Multi-provider KYC integration (Civic, Worldcoin) | Agnostic |
| `@accredit/institutional-ui` | Institutional compliance dashboard (React) | Solana |

## QuickNode Add-on

**Fabrknt On-Chain Compliance** (`fabrknt-onchain-compliance`) with Starter (free, route compliance + trust assessment) and Pro ($49/mo, all endpoints including on-chain KYC/identity reads).

## Plan Limits

| Plan | Monthly Requests |
|------|-----------------|
| Free | 100 |
| Starter | 1,000 |
| Growth | 10,000 |
| Business | 100,000 |
