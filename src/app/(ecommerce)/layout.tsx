import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "La Caprichosa · Grill & Burger | Menú y Pedidos",
  description:
    "Explora nuestra carta de parrilla, hamburguesas, guarniciones y bebidas. Arma tu pedido y envíalo directo por WhatsApp.",
};

export default function EcommerceLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-stone-950 text-stone-100 selection:bg-amber-400 selection:text-stone-950">
      {children}
    </div>
  );
}
