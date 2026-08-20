import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { brand } from "@/lib/config/brand";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: brand.name,
    template: `%s · ${brand.name}`,
  },
  description: brand.tagline,
};

// `viewportFit: "cover"` faz o app encostar nas bordas (as variáveis
// env(safe-area-inset-*) usadas na barra de abas mobile só valem com isso);
// `themeColor` pinta a barra de status do navegador/PWA na cor do shell.
export const viewport: Viewport = {
  themeColor: "#0d1117",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        {children}
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  );
}
