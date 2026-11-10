import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "600", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "OverCity Streetwear",
  description: "Catálogos de camisas y camisillas de OverCity Streetwear.",
  openGraph: {
    title: "OverCity Streetwear",
    description: "Catálogos de camisas y camisillas de OverCity Streetwear.",
    type: "website",
    locale: "es_CO",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: extensiones del navegador inyectan atributos en <html>
    // antes de hidratar; solo afecta a los atributos de este elemento, no a sus hijos.
    <html
      lang="es"
      suppressHydrationWarning
      className={`${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
