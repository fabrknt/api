# Sentinel — Pre-Transaction Security

Plug-in pre-transaction threat detection, contract security scoring, and MEV protection for existing DeFi protocols.

## Endpoint

```
POST /api/quicknode/sentinel/{apiKey}
POST /api/sentinel  (standalone)
```

## Methods

### analyze_transaction

Detect threats in a pending transaction before execution.

```json
{
  "method": "analyze_transaction",
  "params": {
    "from": "0xabc...",
    "to": "0xdef...",
    "data": "0x...",
    "value": "1000000000000000000",
    "chain": "ethereum"
  }
}
```

**Parameters:**
- `from` (required) — Sender address
- `to` (required) — Recipient/contract address
- `data` (optional) — Transaction calldata
- `value` (optional) — Transaction value in wei
- `chain` (optional) — `ethereum` or `solana`

**Detection Patterns (12):**
- Known malicious addresses (Ronin, Wormhole, Euler exploiters, Tornado Cash)
- Flash loan signatures
- High-risk function selectors (approve, transferOwnership, upgradeTo, selfdestruct)
- DEX sandwich attack indicators
- Reentrancy patterns
- Unusual value transfers

### analyze_contract

Security scoring for a smart contract address.

```json
{
  "method": "analyze_contract",
  "params": {
    "address": "0x1234...",
    "chain": "ethereum"
  }
}
```

**Parameters:**
- `address` (required) — Contract address
- `chain` (optional) — `ethereum` or `solana`

### analyze_mev

MEV exposure analysis for a submitted transaction.

```json
{
  "method": "analyze_mev",
  "params": {
    "txHash": "0xabc123...",
    "chain": "ethereum"
  }
}
```

**Parameters:**
- `txHash` (required) — Transaction hash
- `chain` (optional) — `ethereum` or `solana`

## Plan Limits

| Plan | Monthly Requests |
|------|-----------------|
| Free | 100 |
| Starter | 1,000 |
| Growth | 10,000 |
| Business | 100,000 |
