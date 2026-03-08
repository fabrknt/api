export const metadata = {
    title: "FABRKNT API",
    description: "Complr, Sentinel, and QuickNode Marketplace provisioning",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    );
}
