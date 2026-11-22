import { createClient } from "@/lib/supabase/client";
import type { MesaSelectorItem } from "@/components/meseros/ModalSelectorMesa";
import type {
  CategoriaComanda,
  PedidoComanda,
  ProductoComanda,
} from "@/components/meseros/ModalMenuComanda";

export type DatosMesasMesero = {
  userId: string;
  mesas: MesaSelectorItem[];
  categorias: CategoriaComanda[];
  productos: ProductoComanda[];
  pedidos: PedidoComanda[];
  error: string | null;
};

export async function obtenerDatosMesasMesero(): Promise<DatosMesasMesero> {
  const supabase = createClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const userId = session?.user?.id ?? "";

  const [
    { data: mData, error: mErr },
    { data: cData },
    { data: pData },
    { data: pedData },
    { data: dData },
  ] = await Promise.all([
    supabase
      .from("mesas")
      .select(
        "id, numero, nombre, zona, estado, habilitada, mesero_actual_id, unida_con_id",
      )
      .order("numero", { ascending: true }),
    supabase
      .from("menu_categorias")
      .select("id, nombre, emoji")
      .order("orden", { ascending: true }),
    supabase
      .from("menu_items")
      .select(
        "id, nombre, categoria, precio_base, imagen_url, personalizacion, stock_actual, controlar_stock, activo",
      )
      .order("nombre", { ascending: true }),
    supabase
      .from("pedidos")
      .select(
        "id, origen, estado, mesa_id, mesero_id, cliente_nombre, total, created_at",
      )
      .in("estado", ["abierto", "en_cocina", "por_cobrar"])
      .order("created_at", { ascending: false }),
    supabase
      .from("detalle_pedidos")
      .select("id, pedido_id, nombre_item, cantidad, subtotal, notas_item"),
  ]);

  if (mErr) {
    return {
      userId,
      mesas: [],
      categorias: [],
      productos: [],
      pedidos: [],
      error: mErr.message,
    };
  }

  const detallesPorPedido = new Map<string, PedidoComanda["items"]>();
  (dData ?? []).forEach((d) => {
    const lista = detallesPorPedido.get(d.pedido_id) ?? [];
    lista.push({
      id: d.id,
      pedido_id: d.pedido_id,
      nombre_item: d.nombre_item || "Ítem",
      cantidad: Number(d.cantidad || 1),
      subtotal: Number(d.subtotal || 0),
      notas_item: d.notas_item,
    });
    detallesPorPedido.set(d.pedido_id, lista);
  });

  const pedidosFormateados: PedidoComanda[] = (pedData ?? []).map((p) => ({
    ...(p as Omit<PedidoComanda, "items">),
    total: Number(p.total || 0),
    items: detallesPorPedido.get(p.id) ?? [],
  }));

  return {
    userId,
    mesas: (mData ?? []) as MesaSelectorItem[],
    categorias: (cData ?? []) as CategoriaComanda[],
    productos: (pData ?? []) as ProductoComanda[],
    pedidos: pedidosFormateados,
    error: null,
  };
}