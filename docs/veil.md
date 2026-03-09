# Veil — Privacy-Preserving Compliance

Plug-in ZK compliance proofs, AES-256-GCM encrypted PII storage, and privacy framework assessment for existing DeFi protocols.

## Endpoint

```
POST /api/quicknode/veil/{apiKey}
POST /api/veil  (standalone)
```

## Methods

### generate_proof

Generate a ZK compliance proof for an address.

```json
{
  "method": "generate_proof",
  "params": {
    "address": "0x1234...",
    "proofType": "kyc_verified",
    "claims": { "jurisdiction": "MAS", "level": 2 }
  }
}
```

**Parameters:**
- `address` (required) — Wallet address
- `proofType` (required) — `kyc_verified`, `accredited`, `sanctions_clear`, `jurisdiction_eligible`
- `claims` (optional) — Additional claims to include in the proof

### verify_proof

Verify an existing compliance proof.

```json
{
  "method": "verify_proof",
  "params": {
    "proofId": "proof_abc123",
    "proofHash": "0x..."
  }
}
```

### encrypt_data

AES-256-GCM encrypt PII for compliant storage.

```json
{
  "method": "encrypt_data",
  "params": {
    "data": { "name": "John Doe", "nationality": "SG" },
    "accessPolicy": ["compliance_officer", "regulator"],
    "expiresInDays": 365
  }
}
```

### assess_privacy

Assess compliance with privacy frameworks (GDPR, APPI, PDPA, CCPA).

```json
{
  "method": "assess_privacy",
  "params": {
    "address": "0x1234...",
    "frameworks": ["GDPR", "APPI"],
    "dataCategories": ["identity", "transaction"]
  }
}
```

### record_consent

Record user consent for data processing.

```json
{
  "method": "record_consent",
  "params": {
    "address": "0x1234...",
    "purpose": "kyc_verification",
    "framework": "GDPR",
    "granted": true,
    "expiresInDays": 365
  }
}
```

### get_consent

Retrieve consent records for an address.

```json
{
  "method": "get_consent",
  "params": {
    "address": "0x1234...",
    "purpose": "kyc_verification"
  }
}
```

## Plan Limits

| Plan | Monthly Requests |
|------|-----------------|
| Free | 100 |
| Starter | 1,000 |
| Growth | 10,000 |
| Business | 100,000 |
