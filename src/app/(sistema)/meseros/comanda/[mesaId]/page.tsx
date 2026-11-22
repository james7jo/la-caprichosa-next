import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  SalonVentasManager,
  type CategoriaVenta,
  type MesaOperacion,
  type PedidoActivo,
  type ProductoVenta,
} from "@/components/ui/SalonVentasManager";

async function ComandaMesaContenido({ mesaId }: { mesaId: string }) {
  await connection();
  const supabase = await createClient();

  const [
    { data: mesasData },
    { data: categoriasData },
    { data: productosData },
    { data: pedidosAbiertosData },
    { data: detallesAbiertosData },
  ] = await Promise.all([
    supabase
      .from("mesas")
      .select(
        "id, numero, nombre, zona, capacidad, estado, habilitada, solo_fin_de_semana, unida_con_id, mesero_actual_id",
      )
      .order("numero", { ascending: true }),
    supabase
      .from("menu_categorias")
      .select("id, nombre, label, emoji")
      .order("orden", { ascending: true }),
    supabase
      .from("menu_items")
      .select(
        "id, nombre, descripcion, categoria, tipo_item, precio_base, guarnicion_incluida, imagen_url, personalizacion, stock_actual, controlar_stock, activo",
      )
      .order("nombre", { ascending: true }),
    supabase
      .from("pedidos")
      .select(
        "id, origen, estado, mesa_id, cliente_nombre, notas, total, created_at",
      )
      .in("estado", ["abierto", "en_cocina", "por_cobrar"])
      .order("created_at", { ascending: false }),
    supabase
      .from("detalle_pedidos")
      .select(
        "id, pedido_id, nombre_item, cantidad, precio_unitario, subtotal, notas_item",
      ),
  ]);

  const detallesPorPedido = new Map<string, PedidoActivo["items"]>();
  (detallesAbiertosData ?? []).forEach((d) => {
    const lista = detallesPorPedido.get(d.pedido_id) ?? [];
    lista.push({
      id: d.id,
      pedido_id: d.pedido_id,
      nombre_item: d.nombre_item || "Ítem",
      cantidad: Number(d.cantidad || 1),
      precio_unitario: Number(d.precio_unitario || 0),
      subtotal: Number(d.subtotal || 0),
      notas_item: d.notas_item,
    });
    detallesPorPedido.set(d.pedido_id, lista);
  });

  const pedidosFormateados: PedidoActivo[] = (pedidosAbiertosData ?? []).map(
    (p) => ({
      id: p.id,
      origen: p.origen,
      estado: p.estado,
      mesa_id: p.mesa_id,
      cliente_nombre: p.cliente_nombre,
      notas: p.notas,
      total: Number(p.total || 0),
      created_at: p.created_at,
      items: detallesPorPedido.get(p.id) ?? [],
    }),
  );

  const mesaElegida = (mesasData ?? []).find((m) => m.id === mesaId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-white/[0.07] bg-stone-900/70 p-4 sm:p-5">
        <div>
          <h1 className="text-xl font-extrabold text-white sm:text-2xl">
            {mesaElegida
              ? `${mesaElegida.nombre || `Mesa ${mesaElegida.numero}`} · Comanda`
              : "Comanda de mesa"}
          </h1>
          <p className="mt-0.5 text-xs text-stone-400 sm:text-sm">
            {mesaElegida
              ? `${mesaElegida.zona} · Estado: ${mesaElegida.estado}`
              : "No se encontró esta mesa en el salón."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/meseros"
            className="inline-flex min-h-[42px] items-center rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-bold text-stone-200 transition hover:bg-white/10"
          >
            Inicio mesero
          </Link>
          <Link
            href="/meseros/mesas"
            className="inline-flex min-h-[42px] items-center rounded-xl border border-amber-400/35 bg-amber-400/15 px-3.5 py-2 text-xs font-extrabold text-amber-200 transition hover:bg-amber-400/25"
          >
            ← Volver a mesas
          </Link>
        </div>
      </div>

      <SalonVentasManager
        mesasIniciales={(mesasData ?? []) as MesaOperacion[]}
        categorias={(categoriasData ?? []) as CategoriaVenta[]}
        productos={(productosData ?? []) as ProductoVenta[]}
        pedidosIniciales={pedidosFormateados}
        ventasHoyBs={0}
        esAdmin={false}
      />
    </div>
  );
}

export default async function ComandaMesaPage({
  params,
}: {
  params: Promise<{ mesaId: string }>;
}) {
  const { mesaId } = await params;

  return (
    <main className="min-h-full bg-stone-950 p-4 text-stone-100 sm:p-6">
      <div className="mx-auto max-w-6xl">
        <Suspense
          fallback={
            <div className="h-64 animate-pulse rounded-3xl bg-stone-900/60" />
          }
        >
          <ComandaMesaContenido mesaId={mesaId} />
        </Suspense>
      </div>
    </main>
  );
}
