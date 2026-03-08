export default function Home() {
    return (
        <main style={{ fontFamily: "system-ui, sans-serif", padding: "4rem", color: "#fff", background: "#050a0e", minHeight: "100vh" }}>
            <h1 style={{ fontSize: "2rem", fontWeight: 900 }}>FABRKNT API</h1>
            <p style={{ color: "#64748b", marginTop: "0.5rem" }}>Compliance, privacy, and data infrastructure for DeFi.</p>

            <div style={{ marginTop: "2.5rem", display: "flex", gap: "2rem", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: "200px" }}>
                    <h2 style={{ fontSize: "0.75rem", fontWeight: 700, color: "#22d3ee", letterSpacing: "0.1em", textTransform: "uppercase" }}>Compliance</h2>
                    <div style={{ marginTop: "0.75rem", color: "#94a3b8", fontSize: "0.875rem", lineHeight: 1.8 }}>
                        <p><strong style={{ color: "#60a5fa" }}>Complr</strong> — Sanctions screening, Travel Rule, audit trails</p>
                        <p><strong style={{ color: "#4ade80" }}>Accredit</strong> — KYC/AML enforcement, jurisdiction controls</p>
                        <p><strong style={{ color: "#fb923c" }}>Sentinel</strong> — Pre-tx threat detection, MEV analysis</p>
                    </div>
                </div>

                <div style={{ flex: 1, minWidth: "200px" }}>
                    <h2 style={{ fontSize: "0.75rem", fontWeight: 700, color: "#f87171", letterSpacing: "0.1em", textTransform: "uppercase" }}>Privacy</h2>
                    <div style={{ marginTop: "0.75rem", color: "#94a3b8", fontSize: "0.875rem", lineHeight: 1.8 }}>
                        <p><strong style={{ color: "#f87171" }}>Veil</strong> — ZK compliance proofs, encrypted storage, GDPR/APPI</p>
                    </div>
                </div>

                <div style={{ flex: 1, minWidth: "200px" }}>
                    <h2 style={{ fontSize: "0.75rem", fontWeight: 700, color: "#a855f7", letterSpacing: "0.1em", textTransform: "uppercase" }}>Data</h2>
                    <div style={{ marginTop: "0.75rem", color: "#94a3b8", fontSize: "0.875rem", lineHeight: 1.8 }}>
                        <p><strong style={{ color: "#a855f7" }}>Stratum</strong> — Sanctions aggregation, regulatory feeds, pipeline health</p>
                    </div>
                </div>
            </div>

            <div style={{ marginTop: "2.5rem", borderTop: "1px solid #1e293b", paddingTop: "1.5rem" }}>
                <h2 style={{ fontSize: "0.75rem", fontWeight: 700, color: "#475569", letterSpacing: "0.1em", textTransform: "uppercase" }}>Endpoints</h2>
                <div style={{ marginTop: "0.75rem", color: "#64748b", fontSize: "0.8rem", fontFamily: "monospace", lineHeight: 1.8 }}>
                    <p>POST /api/quicknode/complr/[apiKey] — Complr via QuickNode</p>
                    <p>POST /api/accredit — KYC &amp; jurisdiction checks</p>
                    <p>POST /api/sentinel — Transaction security analysis</p>
                    <p>POST /api/veil — Privacy proofs &amp; encryption</p>
                    <p>POST /api/stratum — Data feeds &amp; sanctions</p>
                </div>
            </div>
        </main>
    );
}
