# Stratum — Sanctions Data & Regulatory Feeds

Plug-in live OFAC SDN sanctions feed, sanctions list aggregation, and regulatory update feeds for existing DeFi protocols.

## Endpoint

```
POST /api/quicknode/stratum/{apiKey}
POST /api/stratum  (standalone)
```

## Methods

### check_sanctions

Check an address against live OFAC SDN and aggregated sanctions lists.

```json
{
  "method": "check_sanctions",
  "params": {
    "address": "0x1234..."
  }
}
```

**Parameters:**
- `address` (required) — Wallet address (Ethereum or Bitcoin)

**Response:**
```json
{
  "result": {
    "address": "0x1234...",
    "sanctioned": false,
    "lists": [],
    "checkedAt": "2026-03-09T12:00:00Z"
  }
}
```

**Data Source:** Live OFAC SDN feed from US Treasury (`sdn.csv`), cached for 24 hours.

### get_sanctions_list

Browse sanctions list entries.

```json
{
  "method": "get_sanctions_list",
  "params": {
    "listSource": "OFAC",
    "limit": 50
  }
}
```

**Parameters:**
- `listSource` (optional) — Filter by list source: `OFAC`, `UN`, `EU`
- `limit` (optional) — Number of entries to return

### get_regulatory_updates

Get latest regulatory changes affecting DeFi protocols.

```json
{
  "method": "get_regulatory_updates",
  "params": {
    "jurisdiction": "MAS",
    "impact": "high",
    "limit": 10
  }
}
```

**Parameters:**
- `jurisdiction` (optional) — `MAS`, `SFC`, `FSA`, or `FATF`
- `impact` (optional) — `high`, `medium`, `low`
- `limit` (optional) — Number of updates to return

### get_health

Check data pipeline health status.

```json
{
  "method": "get_health",
  "params": {}
}
```

### get_feed_status

Check status of an individual data feed.

```json
{
  "method": "get_feed_status",
  "params": {
    "feedId": "ofac-sdn"
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
