import { Suspense } from "react";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  ComprasManager,
  type CompraGastoItem,
  type ItemMenuCorto,
} from "@/components/ui/ComprasManager";

async function ComprasContenido() {
  await connection();
  const supabase = await createClient();

  const [{ data: compras, error: errCompras }, { data: menuItems }] =
    await Promise.all([
      supabase
        .from("compras_gastos")
        .select(
          "id, concepto, categoria_gasto, monto, fecha_compra, menu_item_id, cantidad_sumada, nota",
        )
        .order("fecha_compra", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("menu_items")
        .select("id, nombre, categoria, stock_actual")
        .order("nombre", { ascending: true }),
    ]);

  return (
    <>
      {errCompras && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          No se pudieron cargar las compras: {errCompras.message}
        </div>
      )}

      <ComprasManager
        comprasIniciales={(compras ?? []) as CompraGastoItem[]}
        itemsMenu={(menuItems ?? []) as ItemMenuCorto[]}
        ventasHoyBs={0}
      />
    </>
  );
}

function ComprasSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <div className="lg:col-span-5 h-96 rounded-3xl border border-white/[0.07] bg-stone-900/60 animate-pulse" />
      <div className="lg:col-span-7 h-96 rounded-3xl border border-white/[0.07] bg-stone-900/60 animate-pulse" />
    </div>
  );
}

export default function InventarioComprasPage() {
  return (
    <main className="min-h-full bg-stone-950 text-stone-100 p-4 sm:p-6 md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">
            Compras y gastos
          </h1>
        </div>

        <Suspense fallback={<ComprasSkeleton />}>
          <ComprasContenido />
        </Suspense>
      </div>
    </main>
  );
}
