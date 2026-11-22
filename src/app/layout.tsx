import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sistema Restaurante",
  description: "Parrilla & Hamburguesas · Gestión y operación",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased bg-stone-950 text-stone-100">
        {children}
      </body>
    </html>
  );
}
