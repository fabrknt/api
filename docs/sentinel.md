# Sentinel — DeFi Security Infrastructure

Chain-agnostic DeFi security infrastructure. Transaction security analysis with 17 pattern detectors, pre-execution simulation sandbox, execution pattern builders, and atomic bundle management (Jito + Flashbots).

## Endpoint

```
POST /api/quicknode/sentinel/{apiKey}
POST /api/sentinel  (standalone)
```

## Methods

### analyze_transaction

Detect threats in a pending transaction before execution using 17 pattern detectors across Solana and EVM.

```json
{
  "method": "analyze_transaction",
  "params": {
    "transaction": {
      "id": "tx1",
      "chain": "evm",
      "status": "pending",
      "instructions": [
        { "programId": "0xContract", "keys": [], "data": "0x12345678" }
      ]
    },
    "mode": "block",
    "riskTolerance": "strict"
  }
}
```

**Parameters:**
- `transaction` (required) — Transaction object with chain, instructions
- `chain` (required in transaction) — `evm` or `solana`
- `mode` (optional) — `block` or `warn`
- `riskTolerance` (optional) — `strict`, `moderate`, `permissive`

### Solana Patterns (P-101 - P-108)

| Pattern | ID | Severity |
|---------|----|----------|
| Mint authority kill | P-101 | Critical |
| Freeze authority kill | P-102 | Critical |
| Signer mismatch | P-103 | Warning |
| Dangerous account close | P-104 | Alert |
| Malicious Transfer Hook | P-105 | Critical |
| Unexpected hook execution | P-106 | Alert |
| Hook reentrancy | P-107 | Critical |
| Excessive hook accounts | P-108 | Warning |

### EVM Patterns (EVM-001 - EVM-009)

| Pattern | ID | Severity |
|---------|----|----------|
| Reentrancy attack | EVM-001 | Critical |
| Flash loan attack | EVM-002 | Critical |
| Front-running / sandwich | EVM-003 | Alert |
| Unauthorized access | EVM-004 | Warning/Critical |
| Price manipulation | EVM-005 | Critical |
| Proxy upgrade | EVM-006 | Alert |
| Approval abuse | EVM-007 | Warning |
| Honeypot token | EVM-008 | Critical |
| Governance attack | EVM-009 | Alert |

### simulate_transaction

Pre-execution simulation with automatic fallback.

```json
{
  "method": "simulate_transaction",
  "params": {
    "transaction": { "id": "tx1", "chain": "evm", "instructions": [...] },
    "rpcUrl": "https://eth-mainnet.example.com"
  }
}
```

- **EVM**: `eth_call` -> `eth_estimateGas` -> `trace_call` (Parity) -> `debug_traceCall` (Geth)
- **Solana**: `simulateTransaction` with post-simulation account state comparison

Features: revert reason decoding, bytecode opcode scanning, EIP-1167/EIP-1967 proxy detection, honeypot analysis, state change tracking.

### build_pattern

Build execution plans for common DeFi operations.

| Pattern | Description |
|---------|-------------|
| Batch Payout | Optimized multi-recipient payout batching |
| Recurring Payment | Payment schedule builder |
| Token Vesting | Cliff + linear vesting schedule |
| Grid Trading | Buy/sell grid level planning |
| DCA | Dollar-cost averaging schedule |
| Rebalance | Portfolio rebalancing with drift detection |

### submit_bundle

Submit atomic transaction bundles via Jito (Solana) or Flashbots (EVM).

```json
{
  "method": "submit_bundle",
  "params": {
    "chain": "evm",
    "transactions": ["0xSignedTx1"],
    "blockNumber": 19000000
  }
}
```

**EVM bundles** use Flashbots/MEV-Share with full AuthSigner protocol (EIP-191 signing).
**Solana bundles** use Jito Block Engine with tip management and region routing.

## Oracle Registry

Dynamic oracle feed resolution via Chainlink Feed Registry for price manipulation detection (EVM-005).

## QuickNode Add-on

**Fabrknt DeFi Toolkit** (`fabrknt-defi-toolkit`) with Starter (guard, simulation, patterns) and Pro (all + bundle submission) plans.

| Feature | Starter | Pro |
|---------|---------|-----|
| Guard (17 patterns) | Yes | Yes |
| Simulation sandbox | Yes | Yes |
| Execution patterns | Yes | Yes |
| Bundle submission | No | Yes |
| Rate limit | 100 req/min | 200 req/min |

## Tests

185 tests passing (151 core + 34 add-on).

## Plan Limits

| Plan | Monthly Requests |
|------|-----------------|
| Free | 100 |
| Starter | 1,000 |
| Growth | 10,000 |
| Business | 100,000 |
