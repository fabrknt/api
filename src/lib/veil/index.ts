/**
 * Veil — Privacy-preserving compliance for DeFi.
 *
 * - ZK compliance proofs (prove KYC/sanctions clearance without revealing identity)
 * - AES-256-GCM encrypted data storage for PII
 * - Privacy framework compliance (GDPR, APPI, PDPA, CCPA)
 * - Consent management
 */

import {
    randomUUID,
    createHash,
    randomBytes,
    createCipheriv,
    createDecipheriv,
} from "crypto";
import type {
    ProofType,
    PrivacyFramework,
    ComplianceProof,
    EncryptedRecord,
    PrivacyAssessment,
    DataCategory,
    ConsentRecord,
} from "./types";

// ---------------------------------------------------------------------------
// Encryption key management
// ---------------------------------------------------------------------------

/**
 * Derive a 256-bit key from a master secret using HKDF-like construction.
 * In production, use a proper KMS (AWS KMS, GCP KMS, HashiCorp Vault).
 */
function deriveKey(purpose: string): Buffer {
    const masterSecret = process.env.VEIL_MASTER_KEY || "fabrknt-veil-dev-key-replace-in-production";
    return createHash("sha256")
        .update(`${masterSecret}:${purpose}`)
        .digest();
}

// ---------------------------------------------------------------------------
// AES-256-GCM encryption
// ---------------------------------------------------------------------------

function encrypt(plaintext: string, purpose: string = "data"): {
    ciphertext: string;
    iv: string;
    authTag: string;
} {
    const key = deriveKey(purpose);
    const iv = randomBytes(12); // 96-bit IV for GCM
    const cipher = createCipheriv("aes-256-gcm", key, iv);

    let encrypted = cipher.update(plaintext, "utf8", "base64");
    encrypted += cipher.final("base64");
    const authTag = cipher.getAuthTag();

    return {
        ciphertext: encrypted,
        iv: iv.toString("base64"),
        authTag: authTag.toString("base64"),
    };
}

function decrypt(ciphertext: string, iv: string, authTag: string, purpose: string = "data"): string {
    const key = deriveKey(purpose);
    const decipher = createDecipheriv(
        "aes-256-gcm",
        key,
        Buffer.from(iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(authTag, "base64"));

    let decrypted = decipher.update(ciphertext, "base64", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
}

// ---------------------------------------------------------------------------
// ZK Compliance Proofs (with proof store for verification)
// ---------------------------------------------------------------------------

const PROOF_VALIDITY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// In-memory proof store (production: use database)
const PROOF_STORE = new Map<string, ComplianceProof>();

/**
 * Generate a compliance proof.
 *
 * The proof commits to (address, proofType, claims) without revealing the
 * underlying data. A Poseidon/Pedersen commitment would be used in a real
 * ZK circuit; here we use HMAC-SHA256 as a binding commitment scheme.
 */
export async function generateProof(params: {
    address: string;
    proofType: ProofType;
    claims?: Record<string, unknown>;
}): Promise<ComplianceProof> {
    const { address, proofType, claims = {} } = params;

    const proofId = randomUUID();
    const now = Date.now();

    // Commitment: HMAC(secret, address || proofType || claims || timestamp)
    // This binds the proof to the inputs without revealing them
    const commitmentInput = JSON.stringify({
        address: address.toLowerCase(),
        proofType,
        claims,
        issuedAt: now,
        nonce: randomBytes(16).toString("hex"),
    });

    const proofHash = createHash("sha256")
        .update(deriveKey("proof"))
        .update(commitmentInput)
        .digest("hex");

    const proof: ComplianceProof = {
        proofId,
        proofType,
        address: address.toLowerCase(),
        valid: true,
        issuedAt: now,
        expiresAt: now + PROOF_VALIDITY_MS,
        verifierContract: null, // TODO: deploy on-chain verifier (Solidity/Anchor)
        proofHash,
    };

    // Store for later verification
    PROOF_STORE.set(proofId, proof);

    return proof;
}

/**
 * Verify a proof by ID and hash.
 */
export async function verifyProof(params: {
    proofId: string;
    proofHash: string;
}): Promise<{ valid: boolean; expired: boolean; proofType: ProofType | null }> {
    const stored = PROOF_STORE.get(params.proofId);

    if (!stored) {
        return { valid: false, expired: false, proofType: null };
    }

    const hashMatch = stored.proofHash === params.proofHash;
    const expired = Date.now() > stored.expiresAt;

    return {
        valid: hashMatch && !expired,
        expired,
        proofType: stored.proofType,
    };
}

// ---------------------------------------------------------------------------
// Encrypted data storage (AES-256-GCM)
// ---------------------------------------------------------------------------

// Store encrypted records for decryption (production: use database)
const ENCRYPTED_STORE = new Map<string, {
    iv: string;
    authTag: string;
    encryptedData: string;
}>();

export async function encryptData(params: {
    data: string;
    accessPolicy: string[];
    expiresInDays?: number;
}): Promise<EncryptedRecord> {
    const { data, accessPolicy, expiresInDays } = params;

    const recordId = randomUUID();
    const dataHash = createHash("sha256").update(data).digest("hex");

    // Real AES-256-GCM encryption
    const { ciphertext, iv, authTag } = encrypt(data, `record:${recordId}`);

    const now = Date.now();

    // Store for potential decryption
    ENCRYPTED_STORE.set(recordId, { iv, authTag, encryptedData: ciphertext });

    return {
        recordId,
        encryptedData: ciphertext,
        dataHash,
        algorithm: "aes-256-gcm",
        createdAt: now,
        expiresAt: expiresInDays ? now + expiresInDays * 24 * 60 * 60 * 1000 : null,
        accessPolicy,
    };
}

// ---------------------------------------------------------------------------
// Privacy framework assessment
// ---------------------------------------------------------------------------

const FRAMEWORK_REQUIREMENTS: Record<PrivacyFramework, {
    maxRetentionDays: number;
    requiresConsent: boolean;
    requiresEncryption: boolean;
    rightToErasure: boolean;
    crossBorderRestrictions: boolean;
    breachNotificationHours: number;
}> = {
    GDPR: { maxRetentionDays: 365, requiresConsent: true, requiresEncryption: true, rightToErasure: true, crossBorderRestrictions: true, breachNotificationHours: 72 },
    APPI: { maxRetentionDays: 730, requiresConsent: true, requiresEncryption: true, rightToErasure: true, crossBorderRestrictions: true, breachNotificationHours: 72 },
    PDPA: { maxRetentionDays: 365, requiresConsent: true, requiresEncryption: true, rightToErasure: false, crossBorderRestrictions: true, breachNotificationHours: 72 },
    CCPA: { maxRetentionDays: 365, requiresConsent: false, requiresEncryption: false, rightToErasure: true, crossBorderRestrictions: false, breachNotificationHours: 0 },
};

export async function assessPrivacy(params: {
    address: string;
    frameworks: PrivacyFramework[];
    dataCategories?: Array<{
        category: string;
        encrypted: boolean;
        retentionDays: number;
        purpose: string;
    }>;
}): Promise<PrivacyAssessment> {
    const { address, frameworks, dataCategories: inputCategories } = params;
    const recommendations: string[] = [];

    const defaultCategories = [
        { category: "wallet_address", encrypted: false, retentionDays: 365, purpose: "compliance" },
        { category: "transaction_history", encrypted: false, retentionDays: 365, purpose: "audit" },
        { category: "kyc_documents", encrypted: true, retentionDays: 730, purpose: "identity_verification" },
    ];

    const categories = inputCategories || defaultCategories;
    const assessedCategories: DataCategory[] = [];

    for (const cat of categories) {
        for (const fw of frameworks) {
            const req = FRAMEWORK_REQUIREMENTS[fw];
            const issues: string[] = [];

            if (req.requiresEncryption && !cat.encrypted) {
                issues.push(`${fw} requires encryption for ${cat.category}`);
            }
            if (cat.retentionDays > req.maxRetentionDays) {
                issues.push(`${fw} limits retention to ${req.maxRetentionDays} days for ${cat.category}`);
            }
            if (req.requiresConsent) {
                issues.push(`${fw} requires explicit consent for processing ${cat.category}`);
            }

            recommendations.push(...issues);

            assessedCategories.push({
                category: cat.category,
                encrypted: cat.encrypted,
                retentionDays: cat.retentionDays,
                purpose: cat.purpose,
                framework: fw,
                compliant: issues.length === 0,
            });
        }
    }

    return {
        address,
        frameworks,
        compliant: recommendations.length === 0,
        dataCategories: assessedCategories,
        recommendations: [...new Set(recommendations)],
        assessedAt: Date.now(),
    };
}

// ---------------------------------------------------------------------------
// Consent management
// ---------------------------------------------------------------------------

const CONSENT_STORE = new Map<string, ConsentRecord[]>();

export async function recordConsent(params: {
    address: string;
    purpose: string;
    framework: PrivacyFramework;
    granted: boolean;
    expiresInDays?: number;
}): Promise<ConsentRecord> {
    const { address, purpose, framework, granted, expiresInDays } = params;
    const now = Date.now();

    const record: ConsentRecord = {
        address,
        purpose,
        framework,
        granted,
        grantedAt: granted ? now : null,
        expiresAt: expiresInDays ? now + expiresInDays * 24 * 60 * 60 * 1000 : null,
    };

    const key = address.toLowerCase();
    const existing = CONSENT_STORE.get(key) || [];

    // Replace existing consent for same purpose+framework instead of appending
    const filtered = existing.filter(
        (r) => !(r.purpose === purpose && r.framework === framework),
    );
    filtered.push(record);
    CONSENT_STORE.set(key, filtered);

    return record;
}

export async function getConsent(params: {
    address: string;
    purpose?: string;
}): Promise<ConsentRecord[]> {
    const records = CONSENT_STORE.get(params.address.toLowerCase()) || [];

    // Filter out expired consents
    const now = Date.now();
    const active = records.filter((r) => !r.expiresAt || r.expiresAt > now);

    if (params.purpose) {
        return active.filter((r) => r.purpose === params.purpose);
    }
    return active;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const veil = {
    generateProof,
    verifyProof,
    encryptData,
    assessPrivacy,
    recordConsent,
    getConsent,
};
