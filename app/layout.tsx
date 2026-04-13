import type { Metadata } from "next";
import NavLinks from "./components/nav-links";
import RefreshButton from "./components/refresh-button";
import { RefreshProvider } from "./components/refresh-context";
import LoadingOverlay from "./components/loading-overlay";
import "./globals.css";

export const metadata: Metadata = {
  title: "SEO Tools",
  description: "Unified SEO dashboard for all projects",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-neutral-950 text-neutral-200 min-h-screen">
        <RefreshProvider>
          <nav className="border-b border-neutral-800 bg-neutral-900">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-center justify-between h-14">
                <div className="flex items-center gap-6">
                  <span className="text-white font-bold text-lg">SEO Tools</span>
                  <span className="text-xs font-mono bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded">{process.env.NEXT_PUBLIC_APP_VERSION ?? 'dev'}</span>
                  <NavLinks />
                </div>
                <div className="flex items-center gap-3">
                  <RefreshButton />
                  <span className="text-neutral-500 text-xs hidden sm:block">{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                </div>
              </div>
            </div>
          </nav>
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <LoadingOverlay>{children}</LoadingOverlay>
          </main>
        </RefreshProvider>
      </body>
    </html>
  );
}
