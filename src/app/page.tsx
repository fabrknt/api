export default function Home() {
    return (
        <main style={{ fontFamily: "system-ui", padding: "4rem", color: "#fff", background: "#050a0e", minHeight: "100vh" }}>
            <h1 style={{ fontSize: "2rem", fontWeight: 900 }}>FABRKNT API</h1>
            <p style={{ color: "#64748b", marginTop: "0.5rem" }}>Compliance infrastructure for DeFi.</p>
            <div style={{ marginTop: "2rem", color: "#94a3b8", fontSize: "0.875rem" }}>
                <p><strong>Complr</strong> — Sanctions screening &amp; compliance scoring</p>
                <p><strong>Sentinel</strong> — Transaction security validation</p>
            </div>
        </main>
    );
}
