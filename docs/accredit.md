# Accredit — KYC/AML Enforcement

Plug-in KYC/AML enforcement, jurisdiction-gated access, and accredited investor verification for existing DeFi protocols.

## Endpoint

```
POST /api/quicknode/accredit/{apiKey}
POST /api/accredit  (standalone)
```

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

**Parameters:**
- `address` (required) — Wallet address
- `jurisdictions` (optional) — Jurisdiction filter

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

**Parameters:**
- `address` (required) — Wallet address
- `jurisdiction` (required) — `MAS`, `SFC`, or `FSA`
- `protocolType` (optional) — Protocol classification

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

Validate transfer restrictions and Travel Rule compliance.

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

**Parameters:**
- `from` (required) — Sender address
- `to` (required) — Recipient address
- `jurisdictions` (optional) — Applicable jurisdictions
- `amountUsd` (optional) — Transfer amount for Travel Rule threshold checks

### register_kyc

Register a KYC record for an address.

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

**Parameters:**
- `address` (required) — Wallet address
- `kycLevel` (required) — KYC verification level (1-3)
- `investorType` (required) — `retail`, `professional`, or `accredited`
- `jurisdictions` (required) — Verified jurisdictions
- `expiresInDays` (optional) — Expiry period

## Plan Limits

| Plan | Monthly Requests |
|------|-----------------|
| Free | 100 |
| Starter | 1,000 |
| Growth | 10,000 |
| Business | 100,000 |
