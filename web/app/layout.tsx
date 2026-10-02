import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SITE, SITE_URL } from "@/lib/site";
import NavBar from "@/components/nav/NavBar";
import Footer from "@/components/nav/Footer";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // metadataBase resolves every relative metadata URL below -- including the
  // generated app/opengraph-image.tsx -- into the absolute URL that social
  // and messaging clients require. Without it Next emits a relative og:image
  // and previews silently render blank.
  metadataBase: new URL(SITE_URL),
  // `default` is required alongside `template`; the template applies to
  // CHILD segments only, so each tab's page.tsx sets a bare title
  // ("Strategies") and gets the suffix added here.
  title: { default: SITE.name, template: `%s · ${SITE.name}` },
  description: SITE.tagline,
  // Declared once on the root layout so every route inherits a valid card;
  // the per-tab `title` flows through the template above, and the OG image
  // is picked up automatically from app/opengraph-image.tsx.
  openGraph: {
    type: "website",
    siteName: SITE.name,
    title: { default: SITE.name, template: `%s · ${SITE.name}` },
    description: SITE.tagline,
    url: SITE_URL,
    locale: "en_CA",
  },
  twitter: {
    card: "summary_large_image",
    title: { default: SITE.name, template: `%s · ${SITE.name}` },
    description: SITE.tagline,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
    >
      <body className="flex min-h-full flex-col bg-background font-sans text-foreground antialiased">
        <NavBar />
        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-8 sm:px-6">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
