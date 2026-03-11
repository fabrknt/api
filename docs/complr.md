# Complr — AI-Powered Compliance Infrastructure

AI-powered compliance infrastructure for the digital asset industry. Chain-agnostic platform covering MAS (Singapore), SFC (Hong Kong), and FSA (Japan) with a core compliance engine, SDK for exchanges/VASPs, regulated yield platform demo, and production-grade hardening.

## Endpoint

```
POST /api/quicknode/complr/{apiKey}
POST /api/complr  (standalone)
```

## Methods

### screen_wallet

Screen a wallet address against OFAC SDN, TRM Labs, Chainalysis, and custom sanctions lists. Multi-chain support with auto-detection of address formats (Ethereum/EVM, Solana, Bitcoin).

```json
{
  "method": "screen_wallet",
  "params": {
    "address": "0x1234...",
    "jurisdictions": ["MAS", "SFC", "FSA"],
    "chain": "ethereum"
  }
}
```

**Parameters:**
- `address` (required) — Wallet address to screen
- `jurisdictions` (optional) — Filter by jurisdiction: `MAS`, `SFC`, `FSA`
- `chain` (optional) — `ethereum`, `solana`, `bitcoin` (auto-detected if omitted)

**Response:**
```json
{
  "result": {
    "address": "0x1234...",
    "sanctioned": false,
    "riskLevel": "low",
    "riskScore": 10,
    "lists": [],
    "jurisdictions": ["MAS", "SFC", "FSA"],
    "providers": ["OFAC", "TRM Labs"]
  }
}
```

### check_transaction

Single transaction compliance check across all 3 jurisdictions simultaneously.

```json
{
  "method": "check_transaction",
  "params": {
    "transactionId": "tx_001",
    "timestamp": "2026-03-11T00:00:00Z",
    "senderWallet": "0xabc...",
    "recipientWallet": "0xdef...",
    "amount": "10000",
    "currency": "USDC",
    "chain": "ethereum"
  }
}
```

### check_batch

Batch compliance check for up to 50 transactions in parallel.

```json
{
  "method": "check_batch",
  "params": {
    "transactions": [
      { "transactionId": "tx_001", "senderWallet": "0xabc...", "recipientWallet": "0xdef...", "amount": "10000", "currency": "USDC" }
    ]
  }
}
```

### query

Regulatory knowledge base query. Ask natural language questions about crypto regulations and get jurisdiction-specific answers grounded in actual regulatory text.

```json
{
  "method": "query",
  "params": {
    "question": "What is the Travel Rule threshold in Singapore?",
    "jurisdiction": "MAS"
  }
}
```

### query_confident

Query with confidence scoring and citation verification to mitigate LLM hallucination risk.

```json
{
  "method": "query_confident",
  "params": {
    "question": "What are KYC requirements for exchanges in Hong Kong?",
    "jurisdiction": "SFC"
  }
}
```

**Response includes:**
- `answer` — The LLM response
- `confidence` — `{ score, level: "high"|"medium"|"low"|"very_low", factors }`
- `citations` — `[{ documentTitle, verified, relevanceScore }]`
- `warnings` — Hallucination detection flags
- `disclaimer` — Legal disclaimer

### generate_report

Auto-draft Suspicious Transaction Reports in regulator-specific formats (FSA STR, MAS STR, SFC STR). All reports are auto-submitted to a human review queue.

```json
{
  "method": "generate_report",
  "params": {
    "transactionId": "tx_001",
    "jurisdiction": "MAS",
    "reportType": "STR"
  }
}
```

### analyze_obligations

Feed in regulatory documents and get structured, actionable obligations with thresholds, penalties, and suggested controls.

```json
{
  "method": "analyze_obligations",
  "params": {
    "document": "...",
    "jurisdiction": "FSA"
  }
}
```

## Key Features

- **AI-Powered Regulatory Queries** — Natural language questions with jurisdiction-specific answers
- **Transaction Compliance** — Single and batch checks across MAS, SFC, FSA simultaneously
- **Wallet Risk Screening** — Multi-chain, multi-provider (OFAC SDN, TRM Labs, Chainalysis) with auto-detection
- **SAR/STR Generation** — Auto-draft reports in regulator-specific formats
- **Human-in-the-Loop Review Queue** — All high-risk AI decisions auto-submitted for human approval
- **Confidence Scoring** — Structured confidence metadata with citation verification and hallucination detection
- **External Intelligence** — Pluggable TRM Labs and Chainalysis KYT integration with caching and retry
- **Semantic Search** — TF-IDF index for regulatory document retrieval
- **Multi-Tenant Isolation** — Organizations with per-key and org-wide rate limiting
- **SDK** — `@complr/sdk` npm package with TypeScript-first client, webhook support, retry logic
- **289 tests** across 23 test files

## QuickNode Add-on

**Fabrknt Off-Chain Compliance** (`fabrknt-offchain-compliance`) with Starter (free) and Pro ($99/month) plans.

## Plan Limits

| Plan | Monthly Requests |
|------|-----------------|
| Free | 100 |
| Starter | 1,000 |
| Growth | 10,000 |
| Business | 100,000 |
