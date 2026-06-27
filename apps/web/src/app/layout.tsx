import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import { RecuperacionChunks } from "@/componentes/recuperacion-chunks";
import "./globals.css";

const base = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--fuente-base",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--fuente-mono",
});

export const metadata: Metadata = {
  title: "BM Ingenieros — Sistema de Inventarios",
  description: "Sistema de gestión de inventarios de BM Ingenieros.",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}): React.JSX.Element {
  return (
    <html lang="es" className={`${base.variable} ${mono.variable}`}>
      <body className="min-h-screen antialiased">
        <RecuperacionChunks />
        {children}
      </body>
    </html>
  );
}
