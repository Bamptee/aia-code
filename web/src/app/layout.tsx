import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/lib/theme/ThemeProvider";
import { themeScript } from "@/lib/theme/script";
import { AppLayout } from "@/components/shell/AppLayout";
import { ToastProvider } from "@/components/primitives/Toast";
import { ApiProviders } from "@/lib/api/Providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AIA Workspace",
  description: "AI-driven story workspace for solo product development",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    /*
     * suppressHydrationWarning : nécessaire car le script inline peut modifier
     * `data-theme` ou `data-accent` AVANT React hydration, créant un mismatch
     * légitime entre le HTML SSR (data-theme="dark") et le DOM client (peut être
     * "light" si user pref). C'est le pattern standard Next.js pour theme switching.
     */
    <html
      lang="fr"
      data-theme="dark"
      data-accent="neutral"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full">
        <ApiProviders>
          <ThemeProvider>
            <ToastProvider>
              <AppLayout>{children}</AppLayout>
            </ToastProvider>
          </ThemeProvider>
        </ApiProviders>
      </body>
    </html>
  );
}
