import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Forte Next.js Example",
  description: "Example Next.js app using the Forte SDK for user authentication and profile.",
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
