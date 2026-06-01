import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Forte Frontend (Website) Example",
  description:
    "A Forte website (frontend only) that signs users in with the Forte SDK and calls a separate Forte service for everything that needs the server-side API.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-100">
        {children}
      </body>
    </html>
  );
}
