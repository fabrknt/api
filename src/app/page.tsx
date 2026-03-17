export default function Home() {
    return (
        <main style={{ fontFamily: "system-ui, sans-serif", padding: "4rem", color: "#fff", background: "#050a0e", minHeight: "100vh" }}>
            <h1 style={{ fontSize: "2rem", fontWeight: 900 }}>FABRKNT API</h1>
            <p style={{ color: "#64748b", marginTop: "0.5rem" }}>Plug-in compliance for existing DeFi protocols. No rebuilds required.</p>
            <p style={{ color: "#475569", marginTop: "0.25rem", fontSize: "0.8rem" }}>npm: <a href="https://www.npmjs.com/search?q=%40fabrknt" style={{ color: "#22d3ee" }}>@fabrknt/*-core</a> · <a href="https://fabrknt.com/products" style={{ color: "#22d3ee" }}>Products &amp; Pricing</a> · <a href="https://forge.fabrknt.com" style={{ color: "#22d3ee" }}>Forge (Reference App)</a></p>

            <div style={{ marginTop: "2.5rem", display: "flex", gap: "2rem", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: "200px" }}>
                    <h2 style={{ fontSize: "0.75rem", fontWeight: 700, color: "#22d3ee", letterSpacing: "0.1em", textTransform: "uppercase" }}>Compliance</h2>
                    <div style={{ marginTop: "0.75rem", color: "#94a3b8", fontSize: "0.875rem", lineHeight: 1.8 }}>
                        <p><strong style={{ color: "#60a5fa" }}>Complr</strong> — AI compliance (MAS/SFC/FSA), multi-provider screening, confidence scoring</p>
                        <p><strong style={{ color: "#4ade80" }}>Accredit</strong> — On-chain KYC via transfer hooks, compliant routing, asset wrapping</p>
                        <p><strong style={{ color: "#fb923c" }}>Sentinel</strong> — 17-pattern detection, simulation sandbox, Jito + Flashbots bundles</p>
                    </div>
                </div>

                <div style={{ flex: 1, minWidth: "200px" }}>
                    <h2 style={{ fontSize: "0.75rem", fontWeight: 700, color: "#f87171", letterSpacing: "0.1em", textTransform: "uppercase" }}>Privacy</h2>
                    <div style={{ marginTop: "0.75rem", color: "#94a3b8", fontSize: "0.875rem", lineHeight: 1.8 }}>
                        <p><strong style={{ color: "#f87171" }}>Veil</strong> — NaCl encryption, Shamir sharing, Noir ZK proofs, MCP server</p>
                    </div>
                </div>

                <div style={{ flex: 1, minWidth: "200px" }}>
                    <h2 style={{ fontSize: "0.75rem", fontWeight: 700, color: "#a855f7", letterSpacing: "0.1em", textTransform: "uppercase" }}>Data</h2>
                    <div style={{ marginTop: "0.75rem", color: "#94a3b8", fontSize: "0.875rem", lineHeight: 1.8 }}>
                        <p><strong style={{ color: "#a855f7" }}>Stratum</strong> — Multi-chain state primitives: Merkle, Bitfield, Expiry, Events</p>
                    </div>
                </div>

                <div style={{ flex: 1, minWidth: "200px" }}>
                    <h2 style={{ fontSize: "0.75rem", fontWeight: 700, color: "#f59e0b", letterSpacing: "0.1em", textTransform: "uppercase" }}>DeFi</h2>
                    <div style={{ marginTop: "0.75rem", color: "#94a3b8", fontSize: "0.875rem", lineHeight: 1.8 }}>
                        <p><strong style={{ color: "#fbbf24" }}>Tensor</strong> — Unified margin engine, vol surface, solver auctions, ZK credit</p>
                        <p><strong style={{ color: "#38bdf8" }}>Tempest</strong> — Uniswap v4 dynamic fee hook, keeper fail-safe, LP protection</p>
                    </div>
                </div>
            </div>

            <div style={{ marginTop: "2.5rem", borderTop: "1px solid #1e293b", paddingTop: "1.5rem" }}>
                <h2 style={{ fontSize: "0.75rem", fontWeight: 700, color: "#475569", letterSpacing: "0.1em", textTransform: "uppercase" }}>Endpoints</h2>
                <div style={{ marginTop: "0.75rem", color: "#64748b", fontSize: "0.8rem", fontFamily: "monospace", lineHeight: 1.8 }}>
                    <p>POST /api/complr — Sanctions screening &amp; compliance · <span style={{ color: "#475569" }}>npm: @fabrknt/complr-core</span></p>
                    <p>POST /api/accredit — KYC &amp; jurisdiction checks · <span style={{ color: "#475569" }}>npm: @fabrknt/accredit-core</span></p>
                    <p>POST /api/sentinel — Transaction security analysis · <span style={{ color: "#475569" }}>npm: @fabrknt/sentinel-core</span></p>
                    <p>POST /api/veil — Privacy proofs &amp; encryption · <span style={{ color: "#475569" }}>npm: @fabrknt/veil-core</span></p>
                    <p>POST /api/stratum — Data feeds &amp; sanctions · <span style={{ color: "#475569" }}>npm: @fabrknt/stratum-core</span></p>
                    <p>POST /api/tensor — Portfolio margin &amp; greeks · <span style={{ color: "#475569" }}>npm: @fabrknt/tensor-core</span></p>
                    <p>POST /api/tempest — Dynamic fees &amp; LP optimization · <span style={{ color: "#475569" }}>npm: @fabrknt/tempest-core</span></p>
                </div>
            </div>
        </main>
    );
}
