# Stratum — Multi-Chain State Primitives

Multi-chain state primitives achieving 800x state reduction through 5 composable patterns. Built for Solana (Anchor) and EVM (Solidity/Foundry).

## Endpoint

```
POST /api/quicknode/stratum/{apiKey}
POST /api/stratum  (standalone)
```

## Primitives

| Primitive | What it does | Solana | EVM |
|-----------|-------------|--------|-----|
| **Bitfield** | Compact bit tracking (claims, spent flags) | 256-byte PDA chunks | `mapping(uint256 => uint256)` |
| **Merkle** | Commit to large datasets in 32 bytes | Custom hash | keccak256 with domain separation |
| **Expiry** | TTL + incentivized cleanup | Rent-based | Deposit-based (ETH deposits, cleaner rewards) |
| **Events** | History summarization without state bloat | `emit!()` macro | LOG events (8-13x cheaper than storage) |
| **Resurrection** | Archive off-chain, restore with proofs | PDA accounts | Merkle + Bitfield tracking |

## Methods

### merkle_build

Build a Merkle tree from a set of leaves.

```json
{
  "method": "merkle_build",
  "params": {
    "leaves": ["leaf0", "leaf1", "leaf2"]
  }
}
```

### merkle_proof

Generate an inclusion proof for a leaf.

```json
{
  "method": "merkle_proof",
  "params": {
    "treeId": "tree_abc",
    "leafIndex": 0
  }
}
```

### merkle_verify

Verify a proof against a root.

```json
{
  "method": "merkle_verify",
  "params": {
    "proof": ["0x..."],
    "root": "0x...",
    "leaf": "0x..."
  }
}
```

### bitfield_create

Create a new bitfield for compact state tracking.

```json
{
  "method": "bitfield_create",
  "params": {
    "capacity": 2048
  }
}
```

### bitfield_set

Set a bit in a bitfield.

```json
{
  "method": "bitfield_set",
  "params": {
    "bitfieldId": "bf_abc",
    "index": 42
  }
}
```

### bitfield_check

Check whether a bit is set.

```json
{
  "method": "bitfield_check",
  "params": {
    "bitfieldId": "bf_abc",
    "index": 42
  }
}
```

## TypeScript Packages

| Package | Description |
|---------|-------------|
| `@stratum/core` | Chain-agnostic MerkleTree, Bitfield, OrderMatcher, types |
| `@stratum/solana` | PDA derivation, OrderBookClient, solanaHash |
| `@stratum/evm` | EvmMerkleTree, event parser, archive manager |

## EVM Gas Benchmarks

| Operation | Naive Approach | Stratum | Savings |
|-----------|---------------|---------|---------|
| 256 boolean sets | 6.0M gas (`mapping(uint256 => bool)`) | 439K gas (Bitfield) | **13.7x** |
| 10 record writes | 1.19M gas (struct per record) | 147K gas (Events) | **8.1x** |
| Merkle verify (100k entries) | N/A | ~6,154 gas | -- |

## Solana State Cost Comparison (10,000 orders)

| Approach | State Size | Rent Cost |
|----------|-----------|-----------|
| Traditional (account per order) | ~2 MB | ~6.9 SOL |
| Stratum-optimized (merkle + bitfield) | ~2.5 KB | ~0.02 SOL |

## Solana Programs

- **airdrop-example** — Merkle tree whitelist + Bitfield claim tracking + Expiry with cleanup rewards
- **stratum-orderbook** — State-optimized on-chain order book using Stratum primitives (99%+ state cost reduction)

## Off-Chain Cranker

OrderStore, OrderMatcher, EpochCranker, SettlementSubmitter for off-chain order matching.

## QuickNode Add-on

**Fabrknt Data Optimization** (`fabrknt-data-optimization`) with Starter (free) and Pro plans.

## Plan Limits

| Plan | Monthly Requests |
|------|-----------------|
| Free | 100 |
| Starter | 1,000 |
| Growth | 10,000 |
| Business | 100,000 |
