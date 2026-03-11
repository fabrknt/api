/**
 * Sentinel — Pre-transaction security analysis for DeFi.
 *
 * - Transaction threat detection (reentrancy, flash loans, sandwich, MEV)
 * - Contract security scoring with bytecode analysis
 * - MEV exposure analysis
 * - Expanded known-malicious address database
 * - EVM patterns EVM-001 through EVM-009 (reentrancy, flash loan, front-running,
 *   unauthorized access, proxy manipulation, selfdestruct abuse,
 *   approval exploitation, oracle manipulation, governance manipulation)
 * - Flashbots / MEV-Share bundle management
 * - Simulation sandbox (EVM + Solana)
 * - Honeypot analysis
 * - Oracle registry (Chainlink Feed Registry resolution)
 * - Bytecode opcode scanning
 */

import type {
    ThreatType,
    RiskLevel,
    ThreatDetection,
    TransactionAnalysis,
    ContractAnalysis,
    MevAnalysis,
    PatternId,
    Severity,
    SecurityWarning,
    SimulationConfig,
    SimulationResult,
    StateChange,
    BalanceChange,
    BytecodeAnalysis,
    FlashbotsNetwork,
    FlashbotsBundle,
    MevShareBundle,
    BundleResult,
    BundleStatusResponse,
    HoneypotAnalysis,
} from "./types";

// ---------------------------------------------------------------------------
// Known malicious addresses (expanded database)
// ---------------------------------------------------------------------------

const KNOWN_MALICIOUS = new Map<string, { reason: string; severity: number }>([
    // Ronin Bridge Exploiter (Lazarus Group)
    ["0x098b716b8aaf21512996dc57eb0615e2383e2f96", { reason: "Ronin Bridge exploit — Lazarus Group", severity: 100 }],
    // Wormhole Exploiter
    ["0x629e7da20197a5429d30da36e77d06cdf796b71a", { reason: "Wormhole bridge exploit", severity: 100 }],
    // Nomad Bridge Exploiter
    ["0x56d8b635a7c88fd1104d23d632af40c1c3aac4e3", { reason: "Nomad Bridge exploit", severity: 95 }],
    // Euler Finance Exploiter
    ["0xb66cd966670d962c227b3eaba30a872dbfb995db", { reason: "Euler Finance exploit", severity: 95 }],
    // Mango Markets Exploiter
    ["0x67b77b12e8e83bff5e0e24c1e3d7b3ea5c5adba9", { reason: "Mango Markets manipulation", severity: 90 }],
    // Multichain Exploiter
    ["0x48bef6bd05bd23b5e6f0617e9812b2447406e1e2", { reason: "Multichain exploit", severity: 95 }],
    // Tornado Cash (main router)
    ["0xd90e2f925da726b50c4ed8d0fb90ad053324f31b", { reason: "Tornado Cash — OFAC sanctioned", severity: 80 }],
    ["0x722122df12d4e14e13ac3b6895a86e84145b6967", { reason: "Tornado Cash — OFAC sanctioned", severity: 80 }],
    ["0x8589427373d6d84e98730d7795d8f6f8731fda16", { reason: "Tornado Cash — OFAC sanctioned", severity: 80 }],
    // Known phishing contracts
    ["0x0000000000000000000000000000000000000000", { reason: "Null address — likely burn or error", severity: 30 }],
]);

// ---------------------------------------------------------------------------
// Function selectors database
// ---------------------------------------------------------------------------

const FLASH_LOAN_SIGNATURES = new Map<string, string>([
    ["0xab9c4b5d", "Aave V2 flashLoan"],
    ["0x5cffe9de", "Balancer flashLoan"],
    ["0xd9d98ce4", "dYdX callFunction"],
    ["0x7b007d50", "Aave V3 flashLoan"],
    ["0xb1cba3b2", "MakerDAO flash mint"],
]);

const HIGH_RISK_SELECTORS = new Map<string, { type: ThreatType; description: string; riskAdd: number }>([
    ["0x095ea7b3", { type: "access_control", description: "Token approval — check amount", riskAdd: 10 }],
    ["0xa22cb465", { type: "access_control", description: "setApprovalForAll — grants full NFT access", riskAdd: 25 }],
    ["0x42842e0e", { type: "access_control", description: "safeTransferFrom", riskAdd: 5 }],
    ["0x23b872dd", { type: "access_control", description: "transferFrom", riskAdd: 5 }],
    ["0xf2fde38b", { type: "access_control", description: "transferOwnership — admin function", riskAdd: 40 }],
    ["0x8da5cb5b", { type: "access_control", description: "owner() query", riskAdd: 0 }],
    ["0x715018a6", { type: "access_control", description: "renounceOwnership — irreversible", riskAdd: 30 }],
    ["0x3659cfe6", { type: "proxy_manipulation", description: "upgradeTo — proxy upgrade", riskAdd: 35 }],
    ["0x4f1ef286", { type: "proxy_manipulation", description: "upgradeToAndCall — proxy upgrade with call", riskAdd: 40 }],
    ["0x8f283970", { type: "proxy_manipulation", description: "changeAdmin — proxy admin change", riskAdd: 35 }],
    ["0x7eff275e", { type: "proxy_manipulation", description: "changeProxyAdmin", riskAdd: 35 }],
]);

// DEX router selectors (potential sandwich targets)
const DEX_SWAP_SELECTORS = new Set([
    "0x38ed1739", // swapExactTokensForTokens (Uniswap V2)
    "0x8803dbee", // swapTokensForExactTokens
    "0x7ff36ab5", // swapExactETHForTokens
    "0x18cbafe5", // swapExactTokensForETH
    "0x5ae401dc", // multicall (Uniswap V3)
    "0xac9650d8", // multicall (Uniswap V3 alt)
    "0x04e45aaf", // exactInputSingle (Uniswap V3)
    "0xb858183f", // exactInput (Uniswap V3)
    "0x414bf389", // exactInputSingle (Uniswap V3 legacy)
    "0x022c0d9f", // Uniswap V2 swap
    "0xc04b8d59", // exactInput (V3 alt)
]);

// Known flash loan provider addresses (from @sentinel/core evm-detector.ts)
const FLASH_LOAN_PROVIDERS = new Set([
    "0x7d2768de32b0b80b7a3454c06bdac94a69ddc7a9", // AAVE V2
    "0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2", // AAVE V3
    "0x6bdba7d04b19e8f1b7841bbe7313c0c8a69c5eaa", // dYdX
    "0x1eb4cf3a948e7d72a198fe073ccb8c7a948cd853", // Euler
    "0x5c69bee701ef814a2b6a3edd4b1652cb9cc5aa6f", // Uniswap V2 Factory (flash swaps)
    "0xba12222222228d8ba445958a75a0704d566bf2c8", // Balancer Vault
]);

// Known DEX router addresses
const DEX_ROUTERS = new Set([
    "0x7a250d5630b4cf539739df2c5dacb4c659f2488d", // Uniswap V2 Router
    "0xe592427a0aece92de3edee1f18e0157c05861564", // Uniswap V3 Router
    "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45", // Uniswap V3 Router02
    "0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f", // SushiSwap Router
    "0x1111111254eeb25477b68fb85ed929f73a960582", // 1inch V5
    "0x1111111254fb6c44bac0bed2854e76f90643097d", // 1inch V4
    "0xdef1c0ded9bec7f1a1670819833240f027b25eff", // 0x Exchange Proxy
]);

// Known oracle addresses — Chainlink mainnet price feeds
const ORACLE_CONTRACTS = new Set([
    "0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419", // ETH/USD
    "0x986b5e1e1755e3c2440e960477f25201b0a8bbd4", // USDC/ETH
    "0x2c1d072e956affc0d435cb7ac38ef18d24d9127c", // LINK/USD
    "0xf4030086522a5beea4988f8ca5b36dbc97bee88c", // BTC/USD
    "0x3e7d1eab13ad0104d2750b8863b489d65364e32d", // USDT/USD
    "0x8fffffd4afb6115b954bd326cbe7b4ba576818f6", // USDC/USD
    "0xaed0c38402a5d19df6e4c03f4e2dced6e29c1ee9", // DAI/USD
    "0xcfe54b5cd566ab89272946f602d76ea879cab4a8", // stETH/USD
    "0x547a514d5e3769680ce22b2361c10ea13619e8a9", // AAVE/USD
]);

// Governance selectors
const GOVERNANCE_SELECTORS = new Set([
    "0xda95691a", // propose
    "0x56781388", // castVote
    "0x7b3c71d3", // castVoteWithReason
    "0xfe0d94c1", // execute
    "0xddf0b009", // queue
    "0x5c19a95c", // delegate
]);

// Oracle price read selectors
const ORACLE_SELECTORS = new Set([
    "0xfeaf968c", // latestRoundData (Chainlink)
    "0x50d25bcd", // latestAnswer
    "0x0902f1ac", // getReserves (Uniswap V2)
    "0x883bdbfd", // observe (Uniswap V3)
    "0x3850c7bd", // slot0
]);

// ---------------------------------------------------------------------------
// Transaction analysis
// ---------------------------------------------------------------------------

export async function analyzeTransaction(params: {
    from: string;
    to: string;
    data?: string;
    value?: string;
    chain?: string;
}): Promise<TransactionAnalysis> {
    const { from, to, data = "0x", value = "0", chain = "ethereum" } = params;
    const threats: ThreatDetection[] = [];
    let riskScore = 0;

    const fromLower = from.toLowerCase();
    const toLower = to.toLowerCase();

    // 1. Check known malicious addresses
    const maliciousTo = KNOWN_MALICIOUS.get(toLower);
    if (maliciousTo) {
        threats.push({
            type: "rug_pull",
            confidence: 95,
            description: `Destination: ${maliciousTo.reason}`,
            recommendation: "Do not proceed with this transaction",
            patternId: "EVM-004",
        });
        riskScore += maliciousTo.severity;
    }

    const maliciousFrom = KNOWN_MALICIOUS.get(fromLower);
    if (maliciousFrom) {
        threats.push({
            type: "rug_pull",
            confidence: 90,
            description: `Sender flagged: ${maliciousFrom.reason}`,
            recommendation: "Investigate sender history before accepting funds",
        });
        riskScore += Math.floor(maliciousFrom.severity * 0.5);
    }

    // 2. Function selector analysis
    const selector = data.slice(0, 10);

    // Flash loan detection (EVM-002)
    const flashLoan = FLASH_LOAN_SIGNATURES.get(selector);
    if (flashLoan) {
        threats.push({
            type: "flash_loan",
            confidence: 90,
            description: `Flash loan detected: ${flashLoan}`,
            recommendation: "Verify flash loan is part of expected protocol interaction",
            patternId: "EVM-002",
        });
        riskScore += 30;
    }

    // Flash loan provider interaction
    if (FLASH_LOAN_PROVIDERS.has(toLower)) {
        threats.push({
            type: "flash_loan",
            confidence: 80,
            description: `Interaction with flash loan provider: ${to}`,
            recommendation: "Review full transaction path for exploitation patterns",
            patternId: "EVM-002",
        });
        riskScore += 20;
    }

    // High-risk function detection (EVM-004, EVM-005)
    const highRisk = HIGH_RISK_SELECTORS.get(selector);
    if (highRisk && highRisk.riskAdd > 0) {
        if (selector === "0x095ea7b3" && data.length >= 74) {
            const amount = data.slice(34, 74);
            if (amount === "f".repeat(40) || BigInt("0x" + amount) > BigInt("0xffffffffffffffffffffffff")) {
                threats.push({
                    type: "approval_exploitation",
                    confidence: 85,
                    description: "Unlimited token approval — attacker can drain all tokens",
                    recommendation: "Set a specific approval amount instead of unlimited",
                    patternId: "EVM-007",
                });
                riskScore += 25;
            } else {
                threats.push({
                    type: highRisk.type,
                    confidence: 50,
                    description: highRisk.description,
                    recommendation: "Verify the spender address and approval amount",
                });
                riskScore += highRisk.riskAdd;
            }
        } else {
            threats.push({
                type: highRisk.type,
                confidence: 70,
                description: highRisk.description,
                recommendation: "Verify this is an expected administrative action",
                patternId: highRisk.type === "proxy_manipulation" ? "EVM-005" : "EVM-004",
            });
            riskScore += highRisk.riskAdd;
        }
    }

    // 3. DEX swap sandwich vulnerability (EVM-003)
    if (DEX_SWAP_SELECTORS.has(selector)) {
        threats.push({
            type: "sandwich",
            confidence: 60,
            description: "DEX swap detected — vulnerable to sandwich attacks in public mempool",
            recommendation: "Use Flashbots Protect, MEV Blocker, or a private mempool",
            patternId: "EVM-003",
        });
        riskScore += 15;

        const valueWei = BigInt(value || "0");
        if (valueWei > BigInt("1000000000000000000")) {
            threats.push({
                type: "front_running",
                confidence: 50,
                description: "High-value swap — elevated front-running risk",
                recommendation: "Consider splitting into smaller transactions or using limit orders",
                patternId: "EVM-003",
            });
            riskScore += 10;
        }
    }

    // 4. Governance action detection (EVM-009)
    if (GOVERNANCE_SELECTORS.has(selector)) {
        threats.push({
            type: "governance_manipulation",
            confidence: 40,
            description: "Governance action detected — verify authorization and quorum",
            recommendation: "Ensure proper governance procedures are followed",
            patternId: "EVM-009",
        });
        riskScore += 10;

        // Check if combined with flash loan
        if (FLASH_LOAN_PROVIDERS.has(fromLower)) {
            threats.push({
                type: "governance_manipulation",
                confidence: 90,
                description: "Governance action from flash loan provider address — possible flash loan governance attack",
                recommendation: "Block this transaction immediately",
                patternId: "EVM-009",
            });
            riskScore += 50;
        }
    }

    // 5. Oracle read in same tx as swap (EVM-008)
    if (ORACLE_SELECTORS.has(selector) || ORACLE_CONTRACTS.has(toLower)) {
        threats.push({
            type: "oracle_manipulation",
            confidence: 30,
            description: "Oracle price read detected — verify not combined with price-moving operations",
            recommendation: "Use TWAP oracles or Chainlink for manipulation resistance",
            patternId: "EVM-008",
        });
        riskScore += 5;
    }

    // 6. High value transfer check
    const valueWei = BigInt(value || "0");
    if (valueWei > BigInt("100000000000000000000")) {
        threats.push({
            type: "price_manipulation",
            confidence: 40,
            description: `Very high value transfer: ${Number(valueWei / BigInt("1000000000000000000"))} ETH`,
            recommendation: "Verify the destination and amount carefully before proceeding",
        });
        riskScore += 15;
    } else if (valueWei > BigInt("10000000000000000000")) {
        threats.push({
            type: "price_manipulation",
            confidence: 30,
            description: `High value transfer: ${Number(valueWei / BigInt("1000000000000000000"))} ETH`,
            recommendation: "Verify the destination and amount before proceeding",
        });
        riskScore += 5;
    }

    // 7. Complex calldata analysis
    if (data.length > 1000) {
        threats.push({
            type: "unchecked_external_call",
            confidence: 30,
            description: "Unusually large calldata — may contain multiple delegatecalls or complex logic",
            recommendation: "Simulate transaction before signing",
        });
        riskScore += 10;
    }

    // 8. Gas analysis
    const estimatedGas = data.length > 10 ? Math.max(21000, data.length * 16) : 21000;
    const gasWarning = estimatedGas > 500000
        ? "Unusually high gas consumption — may indicate complex or recursive operations"
        : estimatedGas > 300000
            ? "Moderately high gas — verify expected contract interaction"
            : null;

    if (estimatedGas > 500000) riskScore += 10;
    else if (estimatedGas > 300000) riskScore += 5;

    const riskLevel: RiskLevel =
        riskScore >= 80 ? "critical" :
        riskScore >= 60 ? "high" :
        riskScore >= 40 ? "medium" :
        riskScore >= 20 ? "low" : "safe";

    return {
        from,
        to,
        value,
        chain,
        riskLevel,
        riskScore: Math.min(riskScore, 100),
        threats,
        gasAnalysis: { estimatedGas, gasWarning },
        simulationResult: "unknown",
        analyzedAt: Date.now(),
    };
}

// ---------------------------------------------------------------------------
// Contract analysis
// ---------------------------------------------------------------------------

// Known verified contracts (expanded)
const KNOWN_CONTRACTS = new Map<string, { name: string; verified: boolean; proxy: boolean }>([
    // Uniswap
    ["0x7a250d5630b4cf539739df2c5dacb4c659f2488d", { name: "Uniswap V2 Router", verified: true, proxy: false }],
    ["0xe592427a0aece92de3edee1f18e0157c05861564", { name: "Uniswap V3 Router", verified: true, proxy: false }],
    ["0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45", { name: "Uniswap V3 Router02", verified: true, proxy: false }],
    // Aave
    ["0x7d2768de32b0b80b7a3454c06bdac94a69ddc7a9", { name: "Aave V2 Lending Pool", verified: true, proxy: true }],
    ["0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2", { name: "Aave V3 Pool", verified: true, proxy: true }],
    // Compound
    ["0x3d9819210a31b4961b30ef54be2aed79b9c9cd3b", { name: "Compound Comptroller", verified: true, proxy: true }],
    // OpenSea
    ["0x00000000000000adc04c56bf30ac9d3c0aaf14dc", { name: "Seaport 1.5", verified: true, proxy: false }],
    // WETH
    ["0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", { name: "WETH9", verified: true, proxy: false }],
    // Chainlink Feed Registry
    ["0x47fb2585d2c56fe188d0e6ec628a38b74fceeedf", { name: "Chainlink Feed Registry", verified: true, proxy: false }],
]);

export async function analyzeContract(params: {
    address: string;
    chain?: string;
}): Promise<ContractAnalysis> {
    const { address, chain = "ethereum" } = params;
    const vulnerabilities: ThreatDetection[] = [];
    let riskScore = 0;
    const addrLower = address.toLowerCase();

    // Check known malicious
    const malicious = KNOWN_MALICIOUS.get(addrLower);
    if (malicious) {
        vulnerabilities.push({
            type: "rug_pull",
            confidence: 95,
            description: `Known malicious: ${malicious.reason}`,
            recommendation: "Do not interact with this contract",
        });
        riskScore += malicious.severity;
    }

    // Check known verified contracts
    const known = KNOWN_CONTRACTS.get(addrLower);
    const verified = known?.verified ?? false;
    const isProxy = known?.proxy ?? false;
    const name = known?.name ?? null;

    if (!known) {
        vulnerabilities.push({
            type: "access_control",
            confidence: 40,
            description: "Contract not in verified registry — exercise caution",
            recommendation: "Verify source code on block explorer before interacting",
        });
        riskScore += 15;
    }

    if (!verified) {
        vulnerabilities.push({
            type: "access_control",
            confidence: 60,
            description: "Contract source code is not verified",
            recommendation: "Unverified contracts may contain hidden functionality",
        });
        riskScore += 25;
    }

    if (isProxy) {
        vulnerabilities.push({
            type: "proxy_manipulation",
            confidence: 40,
            description: "Contract uses upgradeable proxy pattern",
            recommendation: "Verify proxy admin and implementation are trusted — admin can change behavior",
            patternId: "EVM-005",
        });
        riskScore += 15;
    }

    const riskLevel: RiskLevel =
        riskScore >= 80 ? "critical" :
        riskScore >= 60 ? "high" :
        riskScore >= 40 ? "medium" :
        riskScore >= 20 ? "low" : "safe";

    return {
        address,
        chain,
        verified,
        riskLevel,
        riskScore: Math.min(riskScore, 100),
        vulnerabilities,
        metadata: {
            name,
            compiler: known ? "solidity" : null,
            proxy: isProxy,
            upgradeableProxy: isProxy,
        },
        analyzedAt: Date.now(),
    };
}

// ---------------------------------------------------------------------------
// MEV analysis
// ---------------------------------------------------------------------------

export async function analyzeMev(params: {
    txHash: string;
    chain?: string;
}): Promise<MevAnalysis> {
    const { txHash, chain = "ethereum" } = params;

    return {
        txHash,
        chain,
        mevDetected: false,
        mevType: null,
        estimatedExtraction: null,
        recommendation: chain === "ethereum"
            ? "Use Flashbots Protect (rpc.flashbots.net) or MEV Blocker (rpc.mevblocker.io) for MEV protection"
            : chain === "solana"
                ? "Use Jito block engine or priority fees for MEV protection on Solana"
                : "Consider private mempool solutions for MEV-sensitive transactions",
    };
}

// ---------------------------------------------------------------------------
// EVM pattern detection (EVM-005 through EVM-009)
// ---------------------------------------------------------------------------

/**
 * Detect proxy manipulation patterns (EVM-005).
 * Flags upgradeTo, upgradeToAndCall, changeAdmin, changeProxyAdmin calls.
 */
export function detectProxyManipulation(params: {
    selectors: string[];
    targets: string[];
}): SecurityWarning[] {
    const warnings: SecurityWarning[] = [];
    const proxySelectors = new Set(["0x3659cfe6", "0x4f1ef286", "0x8f283970", "0x7eff275e"]);
    const multicallSelectors = new Set(["0xac9650d8", "0x252dba42"]);

    let upgradeCount = 0;
    let hasMulticall = false;

    for (let i = 0; i < params.selectors.length; i++) {
        if (proxySelectors.has(params.selectors[i])) upgradeCount++;
        if (multicallSelectors.has(params.selectors[i])) hasMulticall = true;
    }

    if (upgradeCount >= 2) {
        warnings.push({
            patternId: "EVM-005",
            severity: "critical",
            message: `${upgradeCount} proxy upgrade operations in a single transaction. Possible coordinated contract takeover.`,
            timestamp: Date.now(),
        });
    }

    if (upgradeCount > 0 && hasMulticall) {
        warnings.push({
            patternId: "EVM-005",
            severity: "alert",
            message: "Proxy upgrade bundled inside multicall/aggregate. Upgrade may be obscured within batch operation.",
            timestamp: Date.now(),
        });
    }

    return warnings;
}

/**
 * Detect selfdestruct / delegatecall abuse patterns (EVM-006).
 */
export function detectSelfdestructAbuse(params: {
    calldata: string[];
}): SecurityWarning[] {
    const warnings: SecurityWarning[] = [];

    for (const data of params.calldata) {
        const hex = data.startsWith("0x") ? data.slice(2) : data;

        if (hex.length <= 4 && hex.startsWith("ff")) {
            warnings.push({
                patternId: "EVM-006",
                severity: "critical",
                message: "Transaction contains potential selfdestruct operation. Contract may be permanently destroyed.",
                timestamp: Date.now(),
            });
        }

        if (hex.slice(0, 2) === "f4" || hex.slice(0, 8).startsWith("f4")) {
            warnings.push({
                patternId: "EVM-006",
                severity: "alert",
                message: "Delegatecall detected. Verify implementation contract safety.",
                timestamp: Date.now(),
            });
        }
    }

    return warnings;
}

/**
 * Detect token approval exploitation patterns (EVM-007).
 */
export function detectApprovalExploitation(params: {
    selectors: string[];
    calldata: string[];
}): SecurityWarning[] {
    const warnings: SecurityWarning[] = [];
    const UNLIMITED_APPROVE_PREFIX = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

    let approvalCount = 0;
    let hasTransferFrom = false;

    for (let i = 0; i < params.selectors.length; i++) {
        const selector = params.selectors[i];
        const data = (params.calldata[i] || "").replace("0x", "").toLowerCase();

        if (selector === "0x095ea7b3" || selector === "0x39509351") {
            approvalCount++;

            // Check unlimited approval
            if (data.length >= 72 && data.slice(72).startsWith(UNLIMITED_APPROVE_PREFIX.slice(0, 56))) {
                warnings.push({
                    patternId: "EVM-007",
                    severity: "warning",
                    message: "Unlimited token approval detected. Consider using exact amounts.",
                    timestamp: Date.now(),
                });
            }
        }

        if (selector === "0x23b872dd") {
            hasTransferFrom = true;
        }
    }

    // Approve-then-transferFrom pattern
    if (approvalCount > 0 && hasTransferFrom) {
        warnings.push({
            patternId: "EVM-007",
            severity: "alert",
            message: "Approve followed by immediate transferFrom detected. Possible token drain pattern.",
            timestamp: Date.now(),
        });
    }

    if (approvalCount >= 3) {
        warnings.push({
            patternId: "EVM-007",
            severity: "alert",
            message: `${approvalCount} token approvals in a single transaction. Possible batch approval phishing.`,
            timestamp: Date.now(),
        });
    }

    return warnings;
}

/**
 * Detect oracle manipulation patterns (EVM-008).
 */
export function detectOracleManipulation(params: {
    selectors: string[];
    targets: string[];
    oracleAddresses?: string[];
}): SecurityWarning[] {
    const warnings: SecurityWarning[] = [];

    const oracleSet = new Set(ORACLE_CONTRACTS);
    for (const addr of params.oracleAddresses || []) {
        oracleSet.add(addr.toLowerCase());
    }

    const oracleReadIndices: number[] = [];
    const swapIndices: number[] = [];

    for (let i = 0; i < params.selectors.length; i++) {
        const selector = params.selectors[i];
        const target = params.targets[i]?.toLowerCase() || "";

        if (ORACLE_SELECTORS.has(selector) || oracleSet.has(target)) {
            oracleReadIndices.push(i);
        }

        if (DEX_SWAP_SELECTORS.has(selector) || DEX_ROUTERS.has(target)) {
            swapIndices.push(i);
        }
    }

    // Swap before oracle read
    for (const oracleIdx of oracleReadIndices) {
        const precedingSwap = swapIndices.some((s) => s < oracleIdx);
        const followingSwap = swapIndices.some((s) => s > oracleIdx);

        if (precedingSwap && followingSwap) {
            warnings.push({
                patternId: "EVM-008",
                severity: "critical",
                message: "Oracle read sandwiched between swap operations. Classic price oracle manipulation pattern.",
                timestamp: Date.now(),
            });
            break;
        }

        if (precedingSwap) {
            warnings.push({
                patternId: "EVM-008",
                severity: "critical",
                message: "DEX swap precedes oracle price read. Possible TWAP/spot price manipulation.",
                timestamp: Date.now(),
            });
            break;
        }
    }

    return warnings;
}

/**
 * Detect governance manipulation patterns (EVM-009).
 */
export function detectGovernanceManipulation(params: {
    selectors: string[];
    targets: string[];
}): SecurityWarning[] {
    const warnings: SecurityWarning[] = [];

    let hasFlashLoan = false;
    let hasGovernanceAction = false;
    let hasDelegation = false;
    let hasVote = false;
    let hasExecute = false;

    for (let i = 0; i < params.selectors.length; i++) {
        const selector = params.selectors[i];
        const target = params.targets[i]?.toLowerCase() || "";

        if (FLASH_LOAN_PROVIDERS.has(target) || selector === "0x5cffe9de" || selector === "0xe0232b42") {
            hasFlashLoan = true;
        }

        if (GOVERNANCE_SELECTORS.has(selector)) {
            hasGovernanceAction = true;
        }

        if (selector === "0x5c19a95c") hasDelegation = true;
        if (selector === "0x56781388" || selector === "0x7b3c71d3") hasVote = true;
        if (selector === "0xfe0d94c1") hasExecute = true;
    }

    if (hasFlashLoan && hasGovernanceAction) {
        warnings.push({
            patternId: "EVM-009",
            severity: "critical",
            message: "Flash loan combined with governance action. Possible flash loan governance attack (e.g. Beanstalk-style).",
            timestamp: Date.now(),
        });
    }

    if (hasDelegation && hasVote) {
        warnings.push({
            patternId: "EVM-009",
            severity: "alert",
            message: "Token delegation and vote cast in same transaction. Voting power may have been acquired for this vote.",
            timestamp: Date.now(),
        });
    }

    if (hasDelegation && hasVote && hasExecute) {
        warnings.push({
            patternId: "EVM-009",
            severity: "critical",
            message: "Delegate + vote + execute in a single transaction. Governance manipulation attack pattern.",
            timestamp: Date.now(),
        });
    }

    return warnings;
}

// ---------------------------------------------------------------------------
// Simulation sandbox
// ---------------------------------------------------------------------------

/**
 * Simulate an EVM transaction via eth_call.
 */
export async function simulateEvmTransaction(params: {
    to: string;
    data: string;
    from?: string;
    value?: string;
    rpcUrl: string;
}): Promise<SimulationResult> {
    const { to, data, from = "0x0000000000000000000000000000000000000000", rpcUrl } = params;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);

        const call = {
            to,
            data: data.startsWith("0x") ? data : `0x${data}`,
            from,
            ...(params.value ? { value: params.value } : {}),
        };

        // eth_call
        const response = await fetch(rpcUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "eth_call",
                params: [call, "latest"],
            }),
            signal: controller.signal,
        });
        clearTimeout(timeout);

        const result = await response.json() as { result?: string; error?: { message: string; data?: string } };

        if (result.error) {
            return {
                success: false,
                chain: "evm",
                error: result.error.message,
                revertReason: result.error.data || undefined,
            };
        }

        // eth_estimateGas
        const gasResponse = await fetch(rpcUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: 2,
                method: "eth_estimateGas",
                params: [call],
            }),
        });
        const gasResult = await gasResponse.json() as { result?: string };
        const gasUsed = gasResult.result ? parseInt(gasResult.result, 16) : 0;

        return {
            success: true,
            chain: "evm",
            gasUsed,
            stateChanges: [],
            balanceChanges: [],
            logs: [],
        };
    } catch (error: any) {
        return {
            success: false,
            chain: "evm",
            error: `EVM simulation failed: ${error.message}`,
        };
    }
}

/**
 * Simulate a Solana transaction via simulateTransaction RPC.
 */
export async function simulateSolanaTransaction(params: {
    serializedTx: string;
    rpcUrl: string;
}): Promise<SimulationResult> {
    const { serializedTx, rpcUrl } = params;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);

        const response = await fetch(rpcUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "simulateTransaction",
                params: [serializedTx, {
                    encoding: "base64",
                    sigVerify: false,
                    replaceRecentBlockhash: true,
                }],
            }),
            signal: controller.signal,
        });
        clearTimeout(timeout);

        const result = await response.json() as { result?: { value: { err: any; logs?: string[]; unitsConsumed?: number } } };
        const value = result.result?.value;

        if (!value) {
            return { success: false, chain: "solana", error: "No simulation result" };
        }

        return {
            success: !value.err,
            chain: "solana",
            computeUnitsUsed: value.unitsConsumed || 0,
            logs: value.logs || [],
            error: value.err ? JSON.stringify(value.err) : undefined,
            stateChanges: [],
            balanceChanges: [],
        };
    } catch (error: any) {
        return {
            success: false,
            chain: "solana",
            error: `Solana simulation failed: ${error.message}`,
        };
    }
}

/**
 * Analyze honeypot by comparing buy and sell simulation results.
 */
export function analyzeHoneypot(
    buyResult: SimulationResult,
    sellResult: SimulationResult,
): HoneypotAnalysis {
    if (buyResult.success && !sellResult.success) {
        return {
            isHoneypot: true,
            buyTax: 0,
            sellTax: 100,
            reason: sellResult.revertReason || sellResult.error || "Sell transaction reverted",
        };
    }

    // Analyze balance changes for hidden taxes
    const buyTax = estimateTaxFromChanges(buyResult.balanceChanges);
    const sellTax = estimateTaxFromChanges(sellResult.balanceChanges);

    if (sellTax > 50) {
        return {
            isHoneypot: true,
            buyTax,
            sellTax,
            reason: `Sell tax of ${sellTax}% detected. Likely honeypot.`,
        };
    }

    return { isHoneypot: false, buyTax, sellTax };
}

function estimateTaxFromChanges(changes?: BalanceChange[]): number {
    if (!changes || changes.length === 0) return 0;

    let maxDelta = BigInt(0);
    let actualReceived = BigInt(0);

    for (const change of changes) {
        const delta = BigInt(change.delta);
        if (delta > maxDelta) maxDelta = delta;
        if (delta > 0) actualReceived += delta;
    }

    if (maxDelta === BigInt(0)) return 0;
    return Math.max(0, Math.min(100, Number(((maxDelta - actualReceived) * BigInt(100)) / maxDelta)));
}

// ---------------------------------------------------------------------------
// Bytecode analysis
// ---------------------------------------------------------------------------

/**
 * Analyze contract bytecode for dangerous opcodes.
 * Fetches bytecode via eth_getCode and scans for DELEGATECALL, SELFDESTRUCT, CREATE2.
 */
export async function analyzeBytecode(params: {
    contractAddress: string;
    rpcUrl: string;
}): Promise<BytecodeAnalysis> {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(params.rpcUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "eth_getCode",
                params: [params.contractAddress, "latest"],
            }),
            signal: controller.signal,
        });
        clearTimeout(timeout);

        const result = await response.json() as { result?: string };

        if (!result.result || result.result === "0x") {
            return { hasDelegatecall: false, hasSelfDestruct: false, hasCreate2: false, codeSize: 0, isProxy: false };
        }

        const bytecode = result.result.slice(2);
        const codeSize = bytecode.length / 2;

        const hasDelegatecall = bytecodeContainsOpcode(bytecode, "f4");
        const hasSelfDestruct = bytecodeContainsOpcode(bytecode, "ff");
        const hasCreate2 = bytecodeContainsOpcode(bytecode, "f5");

        // EIP-1967 implementation slot or EIP-1167 minimal proxy
        const isProxy = hasDelegatecall && (
            bytecode.includes("360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc") ||
            bytecode.startsWith("363d3d373d3d3d363d73")
        );

        return { hasDelegatecall, hasSelfDestruct, hasCreate2, codeSize, isProxy };
    } catch {
        return { hasDelegatecall: false, hasSelfDestruct: false, hasCreate2: false, codeSize: 0, isProxy: false };
    }
}

/**
 * Scan bytecode for a specific opcode, skipping PUSH data to avoid false positives.
 */
function bytecodeContainsOpcode(bytecode: string, opcode: string): boolean {
    const hex = bytecode.toLowerCase();
    let i = 0;

    while (i < hex.length) {
        const op = hex.slice(i, i + 2);

        if (op === opcode) return true;

        // PUSH1-PUSH32: skip the pushed data bytes
        const opNum = parseInt(op, 16);
        if (opNum >= 0x60 && opNum <= 0x7f) {
            const pushBytes = opNum - 0x5f;
            i += 2 + pushBytes * 2;
        } else {
            i += 2;
        }
    }

    return false;
}

// ---------------------------------------------------------------------------
// Flashbots bundle management
// ---------------------------------------------------------------------------

const FLASHBOTS_RELAY_URLS: Record<string, string> = {
    mainnet: "https://relay.flashbots.net",
    goerli: "https://relay-goerli.flashbots.net",
    sepolia: "https://relay-sepolia.flashbots.net",
};

/**
 * Send a Flashbots bundle to the relay for inclusion in a specific block.
 */
export async function sendFlashbotsBundle(params: {
    bundle: FlashbotsBundle;
    network?: string;
    authSignerAddress?: string;
    authSignature?: string;
}): Promise<BundleResult> {
    const { bundle, network = "mainnet", authSignerAddress, authSignature } = params;
    const relayUrl = FLASHBOTS_RELAY_URLS[network] || FLASHBOTS_RELAY_URLS.mainnet;

    const payload = {
        jsonrpc: "2.0",
        id: 1,
        method: "eth_sendBundle",
        params: [{
            txs: bundle.transactions,
            blockNumber: `0x${bundle.blockNumber.toString(16)}`,
            ...(bundle.minTimestamp && { minTimestamp: bundle.minTimestamp }),
            ...(bundle.maxTimestamp && { maxTimestamp: bundle.maxTimestamp }),
            ...(bundle.revertingTxHashes && { revertingTxHashes: bundle.revertingTxHashes }),
        }],
    };

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (authSignerAddress && authSignature) {
        headers["X-Flashbots-Signature"] = `${authSignerAddress}:${authSignature}`;
    }

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);

        const response = await fetch(relayUrl, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
            signal: controller.signal,
        });
        clearTimeout(timeout);

        const data = await response.json() as { result?: { bundleHash?: string }; error?: { message: string } };

        if (data.error) {
            return { bundleId: "", accepted: false, error: data.error.message };
        }

        return {
            bundleId: data.result?.bundleHash || "",
            accepted: true,
        };
    } catch (error: any) {
        return { bundleId: "", accepted: false, error: error.message };
    }
}

/**
 * Send a bundle via MEV-Share for private order flow with configurable privacy hints.
 */
export async function sendMevShareBundle(params: {
    bundle: MevShareBundle;
    network?: string;
    authSignerAddress?: string;
    authSignature?: string;
}): Promise<BundleResult> {
    const { bundle, network = "mainnet", authSignerAddress, authSignature } = params;
    const relayUrl = FLASHBOTS_RELAY_URLS[network] || FLASHBOTS_RELAY_URLS.mainnet;

    const payload = {
        jsonrpc: "2.0",
        id: 1,
        method: "mev_sendBundle",
        params: [{
            version: "v0.1",
            inclusion: {
                block: `0x${bundle.blockNumber.toString(16)}`,
                maxBlock: `0x${(bundle.blockNumber + 25).toString(16)}`,
            },
            body: bundle.transactions.map((tx) => ({ tx, canRevert: false })),
            ...(bundle.privacy && {
                privacy: {
                    ...(bundle.privacy.hints && { hints: bundle.privacy.hints }),
                    ...(bundle.privacy.builders && { builders: bundle.privacy.builders }),
                },
            }),
            ...(bundle.validity && { validity: bundle.validity }),
        }],
    };

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (authSignerAddress && authSignature) {
        headers["X-Flashbots-Signature"] = `${authSignerAddress}:${authSignature}`;
    }

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);

        const response = await fetch(relayUrl, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
            signal: controller.signal,
        });
        clearTimeout(timeout);

        const data = await response.json() as { result?: { bundleHash?: string } | string; error?: { message: string } };

        if (data.error) {
            return { bundleId: "", accepted: false, error: data.error.message };
        }

        const bundleId = typeof data.result === "string"
            ? data.result
            : data.result?.bundleHash || "";

        return { bundleId, accepted: true };
    } catch (error: any) {
        return { bundleId: "", accepted: false, error: error.message };
    }
}

/**
 * Send a single private transaction via Flashbots Protect.
 */
export async function sendPrivateTransaction(params: {
    signedTx: string;
    maxBlockNumber: number;
    network?: string;
}): Promise<BundleResult> {
    const { signedTx, maxBlockNumber, network = "mainnet" } = params;
    const relayUrl = FLASHBOTS_RELAY_URLS[network] || FLASHBOTS_RELAY_URLS.mainnet;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);

        const response = await fetch(relayUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "eth_sendPrivateTransaction",
                params: [{
                    tx: signedTx,
                    maxBlockNumber: `0x${maxBlockNumber.toString(16)}`,
                }],
            }),
            signal: controller.signal,
        });
        clearTimeout(timeout);

        const data = await response.json() as { result?: string; error?: { message: string } };

        if (data.error) {
            return { bundleId: "", accepted: false, error: data.error.message };
        }

        return { bundleId: data.result || "", accepted: true };
    } catch (error: any) {
        return { bundleId: "", accepted: false, error: error.message };
    }
}

/**
 * Get the status of a previously submitted bundle.
 */
export async function getBundleStatus(params: {
    bundleId: string;
    network?: string;
}): Promise<BundleStatusResponse> {
    const { bundleId, network = "mainnet" } = params;
    const relayUrl = FLASHBOTS_RELAY_URLS[network] || FLASHBOTS_RELAY_URLS.mainnet;

    try {
        const response = await fetch(relayUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "flashbots_getBundleStatsV2",
                params: [{ bundleHash: bundleId, blockNumber: "latest" }],
            }),
        });

        const data = await response.json() as { result?: { sealedByBuildersAt?: { blockNumber: number }[] } };

        if (data.result?.sealedByBuildersAt?.length) {
            return {
                status: "landed",
                landedBlock: data.result.sealedByBuildersAt[0]?.blockNumber,
            };
        }

        return { status: "pending" };
    } catch {
        return { status: "pending" };
    }
}

// ---------------------------------------------------------------------------
// Oracle registry (Chainlink Feed Registry resolution)
// ---------------------------------------------------------------------------

const FEED_REGISTRY = "0x47Fb2585D2C56Fe188D0E6ec628a38b74fCeeeDf";
const GET_FEED_SELECTOR = "0x9a6fc8f5";

/**
 * Resolve an oracle feed address from the Chainlink Feed Registry.
 */
export async function resolveOracleFromRegistry(
    rpcUrl: string,
    base: string,
    quote: string,
): Promise<string | null> {
    const baseParam = base.toLowerCase().replace("0x", "").padStart(64, "0");
    const quoteParam = quote.toLowerCase().replace("0x", "").padStart(64, "0");
    const calldata = GET_FEED_SELECTOR + baseParam + quoteParam;

    try {
        const response = await fetch(rpcUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "eth_call",
                params: [{ to: FEED_REGISTRY, data: calldata }, "latest"],
            }),
        });

        if (!response.ok) return null;

        const data = await response.json() as { result?: string; error?: any };
        if (data.error || !data.result || data.result === "0x") return null;

        const hex = data.result.replace("0x", "");
        if (hex.length < 64) return null;

        const addressHex = hex.slice(24, 64);
        if (addressHex === "0".repeat(40)) return null;

        return "0x" + addressHex;
    } catch {
        return null;
    }
}

/**
 * Batch-resolve multiple oracle feeds from the registry.
 */
export async function resolveOracleBatch(
    rpcUrl: string,
    pairs: Array<{ base: string; quote: string }>,
): Promise<Map<string, string>> {
    const results = new Map<string, string>();

    const resolved = await Promise.allSettled(
        pairs.map(async ({ base, quote }) => {
            const feed = await resolveOracleFromRegistry(rpcUrl, base, quote);
            return { key: `${base.toLowerCase()}-${quote.toLowerCase()}`, feed };
        }),
    );

    for (const result of resolved) {
        if (result.status === "fulfilled" && result.value.feed) {
            results.set(result.value.key, result.value.feed);
        }
    }

    return results;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const sentinel = {
    // Original API
    analyzeTransaction,
    analyzeContract,
    analyzeMev,

    // EVM pattern detection (EVM-005 through EVM-009)
    detectProxyManipulation,
    detectSelfdestructAbuse,
    detectApprovalExploitation,
    detectOracleManipulation,
    detectGovernanceManipulation,

    // Simulation sandbox
    simulateEvmTransaction,
    simulateSolanaTransaction,
    analyzeHoneypot,

    // Bytecode analysis
    analyzeBytecode,

    // Flashbots / MEV-Share
    sendFlashbotsBundle,
    sendMevShareBundle,
    sendPrivateTransaction,
    getBundleStatus,

    // Oracle registry
    resolveOracleFromRegistry,
    resolveOracleBatch,
};
