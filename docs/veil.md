# Veil — Privacy Primitives

Chain-agnostic privacy primitives for any blockchain, with optional Solana-specific extensions. NaCl Box encryption, Shamir secret sharing, Noir ZK proofs, encrypted swap orders, and an MCP server for AI agents.

## Endpoint

```
POST /api/quicknode/veil/{apiKey}
POST /api/veil  (standalone)
```

## Packages

| Package | Description |
|---------|-------------|
| `@veil/core` | Chain-agnostic encryption and privacy primitives, plus optional Solana-specific extensions |
| `@veil/orders` | Chain-agnostic encrypted swap order payloads for MEV protection on any DEX |
| `@veil/qn-addon` | Fabrknt Privacy — QuickNode Marketplace REST Add-On serving chain-agnostic privacy primitives |
| `@veil/mcp-server` | MCP server exposing privacy tools for AI agents (chain-agnostic + Solana-specific) |

## Methods

### generate_keypair

Generate a random NaCl Box encryption keypair (Curve25519-XSalsa20-Poly1305).

```json
{
  "method": "generate_keypair",
  "params": {}
}
```

### derive_keypair

Derive a deterministic keypair from a 32-byte seed.

```json
{
  "method": "derive_keypair",
  "params": {
    "seed": "<base64-encoded-32-bytes>"
  }
}
```

### encrypt

Encrypt data using NaCl Box (Curve25519-XSalsa20-Poly1305 authenticated encryption).

```json
{
  "method": "encrypt",
  "params": {
    "plaintext": "<base64>",
    "recipientPublicKey": "<base64>",
    "senderSecretKey": "<base64>",
    "senderPublicKey": "<base64>"
  }
}
```

### decrypt

Decrypt NaCl Box ciphertext.

```json
{
  "method": "decrypt",
  "params": {
    "bytes": "<base64>",
    "senderPublicKey": "<base64>",
    "recipientSecretKey": "<base64>",
    "recipientPublicKey": "<base64>"
  }
}
```

### encrypt_multiple

Encrypt data for multiple recipients at once.

```json
{
  "method": "encrypt_multiple",
  "params": {
    "plaintext": "<base64>",
    "recipientPublicKeys": ["<base64>", "<base64>"],
    "senderSecretKey": "<base64>",
    "senderPublicKey": "<base64>"
  }
}
```

### shamir_split

Split a 32-byte secret into M-of-N Shamir shares.

```json
{
  "method": "shamir_split",
  "params": {
    "secret": "<base64-32-bytes>",
    "threshold": 3,
    "totalShares": 5
  }
}
```

### shamir_combine

Reconstruct a secret from Shamir shares.

```json
{
  "method": "shamir_combine",
  "params": {
    "shares": [
      { "index": 1, "value": "<base64>" },
      { "index": 3, "value": "<base64>" },
      { "index": 5, "value": "<base64>" }
    ]
  }
}
```

### encrypt_order

Encrypt a DEX swap order payload for MEV protection (chain-agnostic).

```json
{
  "method": "encrypt_order",
  "params": {
    "minOutputAmount": "1000000",
    "slippageBps": 50,
    "deadline": 1700000000,
    "solverPublicKey": "<base64>",
    "userSecretKey": "<base64>",
    "userPublicKey": "<base64>"
  }
}
```

### decrypt_order

Decrypt an encrypted swap order payload.

```json
{
  "method": "decrypt_order",
  "params": {
    "bytes": "<base64>",
    "userPublicKey": "<base64>",
    "solverSecretKey": "<base64>",
    "solverPublicKey": "<base64>"
  }
}
```

### compression_estimate

Estimate ZK compression savings (stateless, no RPC needed).

```json
{
  "method": "compression_estimate",
  "params": {
    "size": 4096
  }
}
```

## Chain-Agnostic Modules

- **NaCl Box Encryption** — Curve25519-XSalsa20-Poly1305 authenticated encryption for order payloads, routing hints, and private data
- **Shamir's Secret Sharing** — M-of-N threshold secret splitting for multi-party decryption and escrow
- **Payload Serialization** — Type-safe binary serialization with pre-defined schemas (SWAP_ORDER, RWA_ASSET, RWA_ACCESS_GRANT)
- **Noir ZK Proofs** — Zero-knowledge proofs for swap validity, range checks; chain-agnostic verification
- **Encrypted Swap Orders** — High-level API for encrypting DEX swap orders that solvers can decrypt but MEV searchers cannot

## Solana-Specific Modules

- **ZK Compression** (Light Protocol) — Compress on-chain data for ~99% cost savings, compressed token operations
- **Shielded Transfers** (Privacy Cash) — Private token transfers where amounts and participants are hidden on-chain
- **Arcium MPC Integration** — Encrypted shared state and multi-party computation for dark pools and confidential DeFi

## MCP Server

MCP server exposing Veil privacy tools for AI agents (Claude, GPT, etc.). 14 chain-agnostic tools and 5 Solana-specific tools over stdio transport.

## Solana Apps

5 privacy-focused DeFi applications: confidential swap router, RWA secrets service, umbra (reputation-gated privacy), darkflow (encrypted LP/dark pools), shadowlaunch (private pump.fun purchases).

## Plan Limits

| Plan | Monthly Requests |
|------|-----------------|
| Free | 100 |
| Starter | 1,000 |
| Growth | 10,000 |
| Business | 100,000 |
