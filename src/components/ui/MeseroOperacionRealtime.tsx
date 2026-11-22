"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  agregarItemAPedido,
  cobrarPedido,
  type SeleccionPersonalizacion,
} from "@/actions/ventas-mesas.actions";
import type { GrupoPersonalizacion } from "@/actions/menu.actions";

export type MesaRT = {
  id: string;
  numero: number;
  nombre?: string | null;
  zona: string;
  capacidad: number;
  estado: "disponible" | "ocupada" | "sucia";
  habilitada: boolean;
  mesero_actual_id?: string | null;
  unida_con_id?: string | null;
};

export type CategoriaRT = {
  id: string;
  nombre: string;
  label: string;
  emoji: string;
};

export type ProductoRT = {
  id: string;
  nombre: string;
  descripcion: string;
  categoria: string;
  precio_base: number;
  imagen_url?: string | null;
  personalizacion?: GrupoPersonalizacion[] | null;
  stock_actual: number;
  controlar_stock: boolean;
  activo: boolean;
};

export type DetalleRT = {
  id: string;
  pedido_id: string;
  nombre_item: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  notas_item?: string | null;
};

export type PedidoRT = {
  id: string;
  origen: "salon" | "mostrador" | "ecommerce";
  estado: "abierto" | "en_cocina" | "por_cobrar" | "pagado" | "cancelado";
  mesa_id?: string | null;
  mesero_id?: string | null;
  cliente_nombre?: string | null;
  total: number;
  created_at: string;
  items: DetalleRT[];
};

const ESTADO_PEDIDO: Record<string, { texto: string; clase: string }> = {
  abierto: { texto: "Abierto", clase: "bg-sky-400/15 text-sky-300" },
  en_cocina: { texto: "En cocina", clase: "bg-amber-400/15 text-amber-300" },
  por_cobrar: {
    texto: "Por cobrar",
    clase: "bg-emerald-400/15 text-emerald-300",
  },
};

const METODOS_COBRO = [
  { id: "efectivo", etiqueta: "Efectivo", icono: "💵" },
  { id: "qr", etiqueta: "QR", icono: "📱" },
  { id: "transferencia", etiqueta: "Transferencia", icono: "🏦" },
  { id: "tarjeta", etiqueta: "Tarjeta", icono: "💳" },
] as const;

const inputCls =
  "w-full rounded-xl border border-white/10 bg-stone-950 px-3.5 py-3 text-sm text-white placeholder:text-stone-500 focus:border-amber-400/60 focus:outline-none";

function formatHoraBoliviaCorta(iso: string) {
  return new Intl.DateTimeFormat("es-BO", {
    timeZone: "America/La_Paz",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

function nombreMesa(m: Pick<MesaRT, "nombre" | "numero">) {
  return m.nombre || `Mesa ${m.numero}`;
}

export function MeseroOperacionRealtime({
  userId,
  operacionAbierta,
  mesasIniciales,
  categorias,
  productos,
  pedidosIniciales,
  modoInicial = "dashboard",
}: {
  userId: string;
  operacionAbierta: boolean;
  mesasIniciales: MesaRT[];
  categorias: CategoriaRT[];
  productos: ProductoRT[];
  pedidosIniciales: PedidoRT[];
  modoInicial?: "dashboard" | "mesas" | "llevar";
}) {
  const router = useRouter();
  const [mesas, setMesas] = useState<MesaRT[]>(mesasIniciales);
  const [pedidos, setPedidos] = useState<PedidoRT[]>(pedidosIniciales);

  const [modalActivo, setModalActivo] = useState<
    null | "selector_mesa" | "comanda"
  >(
    modoInicial === "mesas"
      ? "selector_mesa"
      : modoInicial === "llevar"
        ? "comanda"
        : null,
  );

  const [zonaElegida, setZonaElegida] = useState<string>("");
  const [mesaComanda, setMesaComanda] = useState<MesaRT | null>(null);
  const [esLlevar, setEsLlevar] = useState(modoInicial === "llevar");
  const [pedidoLlevarId, setPedidoLlevarId] = useState<string | null>(null);
  const [clienteLlevar, setClienteLlevar] = useState("");

  // En celular el pedido y el menú se alternan; en PC van lado a lado
  const [verTicketMovil, setVerTicketMovil] = useState(false);

  const [mostrarCuentaParaPagar, setMostrarCuentaParaPagar] = useState(false);
  const [metodoCobro, setMetodoCobro] = useState<
    "efectivo" | "qr" | "transferencia" | "tarjeta"
  >("efectivo");
  const [propinaBs, setPropinaBs] = useState("0");

  const [catFiltro, setCatFiltro] = useState("Todas");
  const [busqueda, setBusqueda] = useState("");
  const [prodSel, setProdSel] = useState<ProductoRT | null>(null);
  const [cantidad, setCantidad] = useState(1);
  const [radioSel, setRadioSel] = useState<Record<string, string>>({});
  const [checksSel, setChecksSel] = useState<Record<string, string[]>>({});
  const [notaItem, setNotaItem] = useState("");

  const [aviso, setAviso] = useState<{
    tipo: "ok" | "error";
    texto: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  const refrescarTodoRT = useCallback(async () => {
    const supabase = createClient();
    const [{ data: mData }, { data: pData }, { data: dData }] =
      await Promise.all([
        supabase
          .from("mesas")
          .select(
            "id, numero, nombre, zona, capacidad, estado, habilitada, mesero_actual_id, unida_con_id",
          )
          .order("numero", { ascending: true }),
        supabase
          .from("pedidos")
          .select(
            "id, origen, estado, mesa_id, mesero_id, cliente_nombre, total, created_at",
          )
          .in("estado", ["abierto", "en_cocina", "por_cobrar"])
          .order("created_at", { ascending: false }),
        supabase
          .from("detalle_pedidos")
          .select(
            "id, pedido_id, nombre_item, cantidad, precio_unitario, subtotal, notas_item",
          ),
      ]);

    const mapaItems = new Map<string, DetalleRT[]>();
    (dData ?? []).forEach((d) => {
      const arr = mapaItems.get(d.pedido_id) ?? [];
      arr.push({
        id: d.id,
        pedido_id: d.pedido_id,
        nombre_item: d.nombre_item || "Ítem",
        cantidad: Number(d.cantidad || 1),
        precio_unitario: Number(d.precio_unitario || 0),
        subtotal: Number(d.subtotal || 0),
        notas_item: d.notas_item,
      });
      mapaItems.set(d.pedido_id, arr);
    });

    if (mData) setMesas(mData as MesaRT[]);
    if (pData) {
      setPedidos(
        (pData as Omit<PedidoRT, "items">[]).map((p) => ({
          ...p,
          total: Number(p.total || 0),
          items: mapaItems.get(p.id) ?? [],
        })),
      );
    }
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const canal = supabase
      .channel("mesero-operacion-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "mesas" },
        () => {
          refrescarTodoRT();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pedidos" },
        () => {
          refrescarTodoRT();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "detalle_pedidos" },
        () => {
          refrescarTodoRT();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [refrescarTodoRT]);

  // Los avisos se ocultan solos
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(
      () => setAviso(null),
      aviso.tipo === "ok" ? 3500 : 6000,
    );
    return () => clearTimeout(t);
  }, [aviso]);

  // Bloquea el scroll del fondo con un modal abierto
  useEffect(() => {
    if (!modalActivo) return;
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previo;
    };
  }, [modalActivo]);

  const zonas = Array.from(
    new Set(mesas.filter((m) => m.habilitada).map((m) => m.zona || "Salón")),
  );

  const misMesasActivas = mesas.filter(
    (m) =>
      m.habilitada &&
      m.estado === "ocupada" &&
      !m.unida_con_id &&
      m.mesero_actual_id === userId,
  );

  const pedidoActivoActual: PedidoRT | null = esLlevar
    ? (pedidos.find((p) => p.id === pedidoLlevarId) ?? null)
    : mesaComanda
      ? (pedidos.find(
          (p) =>
            p.mesa_id === mesaComanda.id &&
            ["abierto", "en_cocina", "por_cobrar"].includes(p.estado),
        ) ?? null)
      : null;

  const totalItemsPedido = (pedidoActivoActual?.items ?? []).reduce(
    (s, it) => s + it.cantidad,
    0,
  );

  function verificarOperacionAntesDeAbrir() {
    if (!operacionAbierta) {
      setAviso({
        tipo: "error",
        texto: "Primero toca INICIAR OPERACIÓN para poder tomar pedidos.",
      });
      return false;
    }
    setAviso(null);
    return true;
  }

  function abrirModalMesas() {
    if (!verificarOperacionAntesDeAbrir()) return;
    setZonaElegida(zonas[0] ?? "");
    setModalActivo("selector_mesa");
  }

  function abrirComandaDeMesa(mesa: MesaRT) {
    if (!verificarOperacionAntesDeAbrir()) return;
    if (mesa.estado === "sucia") {
      setAviso({ tipo: "error", texto: `${nombreMesa(mesa)} está sucia.` });
      return;
    }
    setEsLlevar(false);
    setPedidoLlevarId(null);
    setMesaComanda(mesa);
    setProdSel(null);
    setMostrarCuentaParaPagar(false);
    setVerTicketMovil(false);
    setModalActivo("comanda");
  }

  function abrirModalParaLlevar(pedidoId?: string) {
    if (!verificarOperacionAntesDeAbrir()) return;
    setEsLlevar(true);
    setMesaComanda(null);
    setPedidoLlevarId(pedidoId ?? null);
    setClienteLlevar("");
    setProdSel(null);
    setMostrarCuentaParaPagar(false);
    setVerTicketMovil(false);
    setModalActivo("comanda");
  }

  function cerrarComanda() {
    setModalActivo(null);
    setProdSel(null);
    setMostrarCuentaParaPagar(false);
    setVerTicketMovil(false);
  }

  function seleccionarProducto(prod: ProductoRT) {
    setProdSel(prod);
    setCantidad(1);
    setNotaItem("");
    const r: Record<string, string> = {};
    const c: Record<string, string[]> = {};
    (prod.personalizacion ?? []).forEach((g) => {
      if (g.tipo === "radio" && g.opciones[0])
        r[g.titulo] = g.opciones[0].nombre;
      if (g.tipo === "checkbox") c[g.titulo] = [];
    });
    setRadioSel(r);
    setChecksSel(c);
  }

  function calcularExtras(prod: ProductoRT): SeleccionPersonalizacion[] {
    const extras: SeleccionPersonalizacion[] = [];
    (prod.personalizacion ?? []).forEach((g) => {
      if (g.tipo === "radio") {
        const s = radioSel[g.titulo];
        if (s) {
          const op = g.opciones.find((o) => o.nombre === s);
          extras.push({
            grupo: g.titulo,
            seleccion: s,
            extraBs: Number(op?.precioExtra || 0),
          });
        }
      } else {
        const arr = checksSel[g.titulo] ?? [];
        if (arr.length > 0) {
          const ex = arr.reduce((sum, n) => {
            const op = g.opciones.find((o) => o.nombre === n);
            return sum + Number(op?.precioExtra || 0);
          }, 0);
          extras.push({ grupo: g.titulo, seleccion: arr, extraBs: ex });
        }
      }
    });
    return extras;
  }

  function handleAgregarItem() {
    if (!prodSel) return;
    const extras = calcularExtras(prodSel);

    startTransition(async () => {
      const res = await agregarItemAPedido({
        pedidoId: pedidoActivoActual?.id ?? null,
        mesaId: esLlevar ? null : (mesaComanda?.id ?? null),
        clienteNombre: esLlevar ? clienteLlevar : null,
        menuItemId: prodSel.id,
        cantidad,
        personalizaciones: extras,
        notasItem: notaItem,
      });

      if (res?.error) {
        setAviso({ tipo: "error", texto: res.error });
        return;
      }

      if (esLlevar && res?.pedidoId) {
        setPedidoLlevarId(res.pedidoId);
      }

      setProdSel(null);
      setAviso({ tipo: "ok", texto: "Agregado a la orden." });
      await refrescarTodoRT();
      router.refresh();
    });
  }

  function handleCobrarCuenta() {
    if (!pedidoActivoActual) return;
    startTransition(async () => {
      const res = await cobrarPedido(
        pedidoActivoActual.id,
        metodoCobro,
        Number(propinaBs) || 0,
      );
      if (res?.error) {
        setAviso({ tipo: "error", texto: res.error });
        return;
      }
      cerrarComanda();
      setPropinaBs("0");
      setAviso({ tipo: "ok", texto: "Cuenta cobrada y cerrada." });
      await refrescarTodoRT();
      router.refresh();
    });
  }

  const mesasDeZona = mesas.filter(
    (m) => m.habilitada && (!zonaElegida || m.zona === zonaElegida),
  );

  const productosVisibles = productos.filter((p) => {
    if (!p.activo) return false;
    const okCat = catFiltro === "Todas" || p.categoria === catFiltro;
    const q = busqueda.trim().toLowerCase();
    const okQ = !q || p.nombre.toLowerCase().includes(q);
    return okCat && okQ;
  });

  const precioLineaEstimado = prodSel
    ? (Number(prodSel.precio_base || 0) +
        calcularExtras(prodSel).reduce(
          (s, e) => s + Number(e.extraBs || 0),
          0,
        )) *
      cantidad
    : 0;

  /* ───────────── Panel del pedido ───────────── */
  const ticket = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <div>
          <h4 className="text-sm font-extrabold text-white">Pedido actual</h4>
          <p className="text-[11px] text-stone-400">
            {pedidoActivoActual?.created_at
              ? `Desde las ${formatHoraBoliviaCorta(pedidoActivoActual.created_at)}`
              : "Aún sin productos"}
          </p>
        </div>
        {pedidoActivoActual && ESTADO_PEDIDO[pedidoActivoActual.estado] && (
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${ESTADO_PEDIDO[pedidoActivoActual.estado].clase}`}
          >
            {ESTADO_PEDIDO[pedidoActivoActual.estado].texto}
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
        {esLlevar && !pedidoActivoActual && (
          <input
            value={clienteLlevar}
            onChange={(e) => setClienteLlevar(e.target.value)}
            placeholder="Nombre o referencia (opcional)"
            className={`${inputCls} mb-3`}
          />
        )}

        {!pedidoActivoActual || pedidoActivoActual.items.length === 0 ? (
          <div className="grid place-items-center rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center">
            <span className="text-3xl">🧾</span>
            <p className="mt-2 text-sm font-bold text-stone-200">
              Todavía no hay nada pedido
            </p>
            <p className="mt-0.5 text-xs text-stone-500">
              Elige un producto del menú para empezar.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-white/[0.06]">
            {pedidoActivoActual.items.map((it) => (
              <li key={it.id} className="flex items-start gap-3 py-2.5">
                <span className="grid h-7 min-w-7 place-items-center rounded-lg bg-amber-400/15 px-1.5 text-xs font-black text-amber-300">
                  {it.cantidad}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-snug text-white">
                    {it.nombre_item}
                  </p>
                  {it.notas_item && (
                    <p className="mt-0.5 text-[11px] text-amber-300/80">
                      {it.notas_item}
                    </p>
                  )}
                </div>
                {mostrarCuentaParaPagar && (
                  <span className="text-sm font-bold tabular-nums text-stone-200">
                    {Number(it.subtotal).toFixed(2)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {pedidoActivoActual && pedidoActivoActual.items.length > 0 && (
        <div className="space-y-3 border-t border-white/[0.08] bg-stone-950/60 p-4">
          {!mostrarCuentaParaPagar ? (
            <button
              type="button"
              onClick={() => setMostrarCuentaParaPagar(true)}
              className="w-full rounded-2xl border border-emerald-400/40 bg-emerald-400/10 py-3.5 text-sm font-extrabold text-emerald-300 transition hover:bg-emerald-400/20 active:scale-[0.98]"
            >
              Pedir cuenta y cobrar
            </button>
          ) : (
            <>
              <div className="flex items-end justify-between">
                <span className="text-xs font-semibold text-stone-400">
                  Total de la cuenta
                </span>
                <span className="text-2xl font-black tabular-nums text-amber-300">
                  Bs {Number(pedidoActivoActual.total).toFixed(2)}
                </span>
              </div>

              <div>
                <p className="mb-1.5 text-[11px] font-semibold text-stone-400">
                  Método de pago
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {METODOS_COBRO.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMetodoCobro(m.id)}
                      className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition active:scale-95 ${
                        metodoCobro === m.id
                          ? "bg-amber-400 text-stone-950"
                          : "border border-white/10 bg-stone-900 text-stone-300 hover:border-white/25"
                      }`}
                    >
                      <span>{m.icono}</span>
                      {m.etiqueta}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-[11px] font-semibold text-stone-400">
                  Propina (Bs)
                </p>
                <div className="flex items-center gap-1.5">
                  {["0", "5", "10"].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setPropinaBs(v)}
                      className={`rounded-lg px-3 py-2 text-xs font-bold transition active:scale-95 ${
                        propinaBs === v
                          ? "bg-emerald-400 text-stone-950"
                          : "border border-white/10 bg-stone-900 text-stone-300"
                      }`}
                    >
                      {v === "0" ? "Sin" : v}
                    </button>
                  ))}
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.5"
                    value={propinaBs}
                    onChange={(e) => setPropinaBs(e.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-white/10 bg-stone-900 px-3 py-2 text-right text-sm font-bold tabular-nums text-white focus:border-amber-400/60 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMostrarCuentaParaPagar(false)}
                  className="rounded-2xl border border-white/15 px-4 py-3.5 text-xs font-bold text-stone-300 hover:bg-white/5"
                >
                  Volver
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={handleCobrarCuenta}
                  className="flex-1 rounded-2xl bg-gradient-to-r from-emerald-400 to-teal-500 py-3.5 text-sm font-black text-stone-950 shadow-lg shadow-emerald-500/20 transition active:scale-[0.98] disabled:opacity-50"
                >
                  {isPending ? "Cobrando..." : "Confirmar cobro"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );

  /* ───────────── Panel del menú ───────────── */
  const menu = prodSel ? (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b border-white/[0.07] px-4 py-3">
        <button
          type="button"
          onClick={() => setProdSel(null)}
          className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-base font-bold text-white transition active:scale-90"
          aria-label="Volver al menú"
        >
          ←
        </button>
        <div className="min-w-0">
          <p className="truncate text-base font-extrabold text-white">
            {prodSel.nombre}
          </p>
          <p className="text-xs tabular-nums text-stone-400">
            Bs {Number(prodSel.precio_base).toFixed(2)} · {prodSel.categoria}
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        {prodSel.descripcion && (
          <p className="text-sm leading-relaxed text-stone-400">
            {prodSel.descripcion}
          </p>
        )}

        {(prodSel.personalizacion ?? []).map((g) => (
          <div key={g.titulo} className="space-y-2">
            <p className="text-sm font-extrabold text-amber-300">
              {g.titulo}
              <span className="ml-2 text-[11px] font-medium text-stone-500">
                {g.tipo === "radio" ? "Elige una" : "Elige las que quieras"}
              </span>
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {g.tipo === "radio"
                ? g.opciones.map((op) => {
                    const activo = radioSel[g.titulo] === op.nombre;
                    return (
                      <label
                        key={op.nombre}
                        className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 text-sm transition active:scale-[0.98] ${
                          activo
                            ? "border-amber-400 bg-amber-400/10 text-white"
                            : "border-white/10 bg-stone-950 text-stone-300 hover:border-white/25"
                        }`}
                      >
                        <input
                          type="radio"
                          name={g.titulo}
                          checked={activo}
                          onChange={() =>
                            setRadioSel((prev) => ({
                              ...prev,
                              [g.titulo]: op.nombre,
                            }))
                          }
                          className="h-4 w-4 accent-amber-400"
                        />
                        <span className="flex-1 font-semibold">
                          {op.nombre}
                        </span>
                        {Number(op.precioExtra || 0) > 0 && (
                          <span className="text-xs font-bold tabular-nums text-amber-300">
                            +{Number(op.precioExtra).toFixed(2)}
                          </span>
                        )}
                      </label>
                    );
                  })
                : g.opciones.map((op) => {
                    const selArr = checksSel[g.titulo] ?? [];
                    const checked = selArr.includes(op.nombre);
                    return (
                      <label
                        key={op.nombre}
                        className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 text-sm transition active:scale-[0.98] ${
                          checked
                            ? "border-amber-400 bg-amber-400/10 text-white"
                            : "border-white/10 bg-stone-950 text-stone-300 hover:border-white/25"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setChecksSel((prev) => {
                              const prevList = prev[g.titulo] ?? [];
                              return {
                                ...prev,
                                [g.titulo]: checked
                                  ? prevList.filter((x) => x !== op.nombre)
                                  : [...prevList, op.nombre],
                              };
                            })
                          }
                          className="h-4 w-4 accent-amber-400"
                        />
                        <span className="flex-1 font-semibold">
                          {op.nombre}
                        </span>
                        {Number(op.precioExtra || 0) > 0 && (
                          <span className="text-xs font-bold tabular-nums text-amber-300">
                            +{Number(op.precioExtra).toFixed(2)}
                          </span>
                        )}
                      </label>
                    );
                  })}
            </div>
          </div>
        ))}

        <div className="space-y-2">
          <p className="text-sm font-extrabold text-white">Nota para cocina</p>
          <input
            value={notaItem}
            onChange={(e) => setNotaItem(e.target.value)}
            placeholder="Ej. sin ají, bien cocido"
            className={inputCls}
          />
        </div>
      </div>

      <div className="flex items-center gap-3 border-t border-white/[0.08] bg-stone-950/70 p-4">
        <div className="flex items-center rounded-2xl border border-white/10 bg-stone-900">
          <button
            type="button"
            onClick={() => setCantidad((c) => Math.max(1, c - 1))}
            className="grid h-12 w-12 place-items-center text-xl font-black text-white active:scale-90"
            aria-label="Menos"
          >
            −
          </button>
          <span className="w-8 text-center text-base font-black tabular-nums text-white">
            {cantidad}
          </span>
          <button
            type="button"
            onClick={() => setCantidad((c) => c + 1)}
            className="grid h-12 w-12 place-items-center text-xl font-black text-white active:scale-90"
            aria-label="Más"
          >
            +
          </button>
        </div>
        <button
          type="button"
          disabled={isPending}
          onClick={handleAgregarItem}
          className="flex h-12 flex-1 items-center justify-between rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 px-5 text-sm font-black text-stone-950 shadow-lg shadow-amber-500/20 transition active:scale-[0.98] disabled:opacity-50"
        >
          <span>{isPending ? "Guardando..." : "Añadir a la orden"}</span>
          <span className="tabular-nums">
            Bs {precioLineaEstimado.toFixed(2)}
          </span>
        </button>
      </div>
    </div>
  ) : (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-3 border-b border-white/[0.07] p-4">
        <div className="relative">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-500">
            🔍
          </span>
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar plato, soda o extra"
            className={`${inputCls} pl-10`}
          />
        </div>
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {["Todas", ...categorias.map((c) => c.nombre)].map((c) => {
            const emoji = categorias.find((x) => x.nombre === c)?.emoji;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setCatFiltro(c)}
                className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold transition active:scale-95 ${
                  catFiltro === c
                    ? "bg-amber-400 text-stone-950"
                    : "border border-white/10 bg-stone-950 text-stone-300 hover:border-white/25"
                }`}
              >
                {emoji ? `${emoji} ` : ""}
                {c}
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {productosVisibles.length === 0 ? (
          <div className="grid place-items-center py-14 text-center">
            <span className="text-3xl">🍽️</span>
            <p className="mt-2 text-sm font-bold text-stone-200">
              No encontramos productos
            </p>
            <p className="text-xs text-stone-500">
              Prueba con otra categoría o borra la búsqueda.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {productosVisibles.map((p) => {
              const sinStock = p.controlar_stock && p.stock_actual <= 0;
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={sinStock || isPending}
                  onClick={() => seleccionarProducto(p)}
                  className={`group flex items-center gap-3 rounded-2xl border p-2.5 text-left transition active:scale-[0.98] ${
                    sinStock
                      ? "cursor-not-allowed border-white/5 bg-stone-950/40 opacity-50"
                      : "border-white/10 bg-stone-950 hover:border-amber-400/50"
                  }`}
                >
                  <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-stone-900 text-2xl">
                    {p.imagen_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.imagen_url}
                        alt={p.nombre}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      "🍽️"
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-bold leading-snug text-white">
                      {p.nombre}
                    </p>
                    <p className="mt-0.5 text-sm font-extrabold tabular-nums text-amber-300">
                      Bs {Number(p.precio_base).toFixed(2)}
                    </p>
                    {p.controlar_stock && (
                      <p
                        className={`text-[11px] font-semibold ${
                          sinStock
                            ? "text-rose-400"
                            : p.stock_actual <= 5
                              ? "text-orange-300"
                              : "text-stone-500"
                        }`}
                      >
                        {sinStock ? "Agotado" : `${p.stock_actual} disponibles`}
                      </p>
                    )}
                  </div>
                  {!sinStock && (
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-400/15 text-lg font-black text-amber-300 transition group-hover:bg-amber-400 group-hover:text-stone-950">
                      +
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* ───────── Aviso flotante ───────── */}
      {aviso && (
        <div className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex justify-center px-4">
          <div
            role="status"
            className={`pointer-events-auto flex w-full max-w-lg items-start gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold shadow-2xl backdrop-blur-xl ${
              aviso.tipo === "ok"
                ? "border-emerald-400/40 bg-emerald-950/90 text-emerald-100"
                : "border-rose-400/40 bg-rose-950/90 text-rose-100"
            }`}
          >
            <span className="mt-px">{aviso.tipo === "ok" ? "✅" : "⛔"}</span>
            <p className="flex-1 leading-snug">{aviso.texto}</p>
            <button
              type="button"
              onClick={() => setAviso(null)}
              className="text-xs font-bold opacity-70 hover:opacity-100"
              aria-label="Cerrar aviso"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ───────── Acciones rápidas ───────── */}
      {modoInicial === "dashboard" && (
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <button
            type="button"
            onClick={abrirModalMesas}
            className={`flex min-h-[112px] flex-col justify-between rounded-3xl p-4 text-left transition active:scale-[0.97] sm:min-h-[128px] sm:p-5 ${
              operacionAbierta
                ? "bg-gradient-to-br from-amber-400 to-orange-500 text-stone-950 shadow-lg shadow-amber-500/20 hover:brightness-110"
                : "border border-white/10 bg-stone-900 text-stone-500"
            }`}
          >
            <span className="text-3xl">🪑</span>
            <div>
              <p className="text-base font-black sm:text-lg">Mesas</p>
              <p className="text-xs font-semibold opacity-75">
                Elegir sector y mesa
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => abrirModalParaLlevar()}
            className={`flex min-h-[112px] flex-col justify-between rounded-3xl border p-4 text-left transition active:scale-[0.97] sm:min-h-[128px] sm:p-5 ${
              operacionAbierta
                ? "border-white/15 bg-stone-900 text-white hover:border-amber-400/60"
                : "border-white/10 bg-stone-900 text-stone-500"
            }`}
          >
            <span className="text-3xl">🛍️</span>
            <div>
              <p className="text-base font-black sm:text-lg">Para llevar</p>
              <p
                className={`text-xs font-semibold ${
                  operacionAbierta ? "text-stone-400" : "text-stone-600"
                }`}
              >
                Pedido directo
              </p>
            </div>
          </button>
        </div>
      )}

      {/* ───────── Mis mesas ───────── */}
      <section className="space-y-4 rounded-3xl border border-white/[0.07] bg-stone-900/70 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-extrabold text-white sm:text-lg">
              Mis mesas
              <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-xs font-bold text-stone-300">
                {misMesasActivas.length}
              </span>
            </h2>
            <p className="text-xs text-stone-400">
              Toca una mesa para añadir algo o cobrar.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2.5 py-1 text-[11px] font-bold text-emerald-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            En vivo
          </span>
        </div>

        {misMesasActivas.length === 0 ? (
          <div className="grid place-items-center rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center">
            <span className="text-3xl">🪑</span>
            <p className="mt-2 text-sm font-bold text-stone-200">
              No tienes mesas ocupadas
            </p>
            <p className="mb-3 text-xs text-stone-500">
              Abre una mesa nueva para empezar a tomar pedidos.
            </p>
            {modoInicial !== "dashboard" && (
              <button
                type="button"
                onClick={abrirModalMesas}
                className="rounded-xl bg-amber-400 px-4 py-2.5 text-xs font-extrabold text-stone-950 active:scale-95"
              >
                Elegir mesa
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {misMesasActivas.map((m) => {
              const ped = pedidos.find(
                (p) =>
                  p.mesa_id === m.id &&
                  ["abierto", "en_cocina", "por_cobrar"].includes(p.estado),
              );
              const nItems = (ped?.items ?? []).reduce(
                (s, it) => s + it.cantidad,
                0,
              );
              const preview = (ped?.items ?? []).slice(0, 3);
              const resto = (ped?.items.length ?? 0) - preview.length;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => abrirComandaDeMesa(m)}
                  className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-stone-950 p-4 text-left transition hover:border-amber-400/60 active:scale-[0.98]"
                >
                  <div className="flex items-start gap-3">
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-400/15 text-xl font-black text-amber-300">
                      {m.numero}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-extrabold text-white">
                        {nombreMesa(m)}
                      </p>
                      <p className="truncate text-xs text-stone-400">
                        {m.zona}
                        {ped?.created_at
                          ? ` · desde ${formatHoraBoliviaCorta(ped.created_at)}`
                          : ""}
                      </p>
                    </div>
                    {ped && ESTADO_PEDIDO[ped.estado] && (
                      <span
                        className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${ESTADO_PEDIDO[ped.estado].clase}`}
                      >
                        {ESTADO_PEDIDO[ped.estado].texto}
                      </span>
                    )}
                  </div>

                  {preview.length > 0 ? (
                    <ul className="space-y-1 border-t border-white/[0.06] pt-3 text-xs text-stone-300">
                      {preview.map((it) => (
                        <li key={it.id} className="flex gap-2">
                          <span className="font-bold text-amber-300">
                            {it.cantidad}×
                          </span>
                          <span className="truncate">{it.nombre_item}</span>
                          {it.notas_item && (
                            <span className="ml-auto max-w-[40%] truncate text-[11px] text-amber-300/70">
                              {it.notas_item}
                            </span>
                          )}
                        </li>
                      ))}
                      {resto > 0 && (
                        <li className="text-stone-500">y {resto} más…</li>
                      )}
                    </ul>
                  ) : (
                    <p className="border-t border-white/[0.06] pt-3 text-xs text-stone-500">
                      Sin productos todavía
                    </p>
                  )}

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-stone-400">
                      {nItems} {nItems === 1 ? "producto" : "productos"}
                    </span>
                    <span className="rounded-lg bg-amber-400/15 px-2.5 py-1 font-extrabold text-amber-300">
                      + Añadir
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* ───────── MODAL: sector → mesa ───────── */}
      {modalActivo === "selector_mesa" && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-6"
          onClick={() => setModalActivo(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-stone-900 shadow-2xl sm:rounded-3xl"
          >
            <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-5">
              <div>
                <h3 className="text-lg font-extrabold text-white">
                  Elige una mesa
                </h3>
                <p className="text-xs text-stone-400">
                  Primero el sector, luego la mesa.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalActivo(null)}
                className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-sm font-bold text-white active:scale-90"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            <div className="flex gap-2 overflow-x-auto px-5 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {zonas.map((z) => (
                <button
                  key={z}
                  type="button"
                  onClick={() => setZonaElegida(z)}
                  className={`shrink-0 rounded-full px-4 py-2.5 text-sm font-bold transition active:scale-95 ${
                    zonaElegida === z
                      ? "bg-amber-400 text-stone-950"
                      : "border border-white/10 bg-stone-950 text-stone-300"
                  }`}
                >
                  {z}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 pb-3 text-[11px] font-semibold text-stone-400">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400" /> Libre
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-400" /> Tuya
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-stone-500" /> De otro
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-rose-400" /> Sucia
              </span>
            </div>

            <div
              className="overflow-y-auto px-5"
              style={{
                paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))",
              }}
            >
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {mesasDeZona.map((m) => {
                  const esMia =
                    m.estado === "ocupada" && m.mesero_actual_id === userId;
                  const ocupadaPorOtro =
                    m.estado === "ocupada" && m.mesero_actual_id !== userId;
                  const sucia = m.estado === "sucia";

                  const punto = sucia
                    ? "bg-rose-400"
                    : ocupadaPorOtro
                      ? "bg-stone-500"
                      : esMia
                        ? "bg-amber-400"
                        : "bg-emerald-400";
                  const texto = sucia
                    ? "Sucia"
                    : ocupadaPorOtro
                      ? "Ocupada"
                      : esMia
                        ? "Tuya"
                        : "Libre";

                  return (
                    <button
                      key={m.id}
                      type="button"
                      disabled={sucia || ocupadaPorOtro}
                      onClick={() => abrirComandaDeMesa(m)}
                      className={`flex aspect-[5/4] flex-col justify-between rounded-2xl border p-3.5 text-left transition active:scale-95 ${
                        sucia
                          ? "cursor-not-allowed border-rose-500/20 bg-rose-500/5 opacity-60"
                          : ocupadaPorOtro
                            ? "cursor-not-allowed border-white/5 bg-stone-950/50 opacity-50"
                            : esMia
                              ? "border-amber-400/70 bg-amber-400/10"
                              : "border-white/10 bg-stone-950 hover:border-emerald-400/60"
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <span className="text-3xl font-black leading-none text-white">
                          {m.numero}
                        </span>
                        {m.capacidad > 0 && (
                          <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-stone-300">
                            👥 {m.capacidad}
                          </span>
                        )}
                      </div>
                      <div>
                        {m.nombre && (
                          <p className="truncate text-xs font-bold text-stone-200">
                            {m.nombre}
                          </p>
                        )}
                        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-stone-400">
                          <span className={`h-2 w-2 rounded-full ${punto}`} />
                          {texto}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
              {mesasDeZona.length === 0 && (
                <p className="py-10 text-center text-sm text-stone-500">
                  No hay mesas habilitadas en este sector.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ───────── MODAL: comanda (menú + pedido) ───────── */}
      {modalActivo === "comanda" && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-6">
          <div className="flex h-dvh w-full flex-col overflow-hidden bg-stone-900 shadow-2xl sm:h-[90dvh] sm:max-w-6xl sm:rounded-3xl sm:border sm:border-white/10">
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-3.5 sm:px-5">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-400/15 text-xl font-black text-amber-300">
                  {esLlevar ? "🛍️" : mesaComanda?.numero}
                </div>
                <div className="min-w-0">
                  <h3 className="truncate text-base font-extrabold text-white sm:text-lg">
                    {esLlevar
                      ? "Pedido para llevar"
                      : mesaComanda
                        ? nombreMesa(mesaComanda)
                        : ""}
                  </h3>
                  <p className="truncate text-xs text-stone-400">
                    {esLlevar
                      ? pedidoActivoActual?.cliente_nombre ||
                        "Sin referencia de cliente"
                      : mesaComanda?.zona}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={cerrarComanda}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 text-sm font-bold text-white active:scale-90"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            <div className="flex min-h-0 flex-1">
              <div
                className={`min-h-0 min-w-0 flex-1 ${
                  verTicketMovil ? "hidden" : "block"
                } lg:block`}
              >
                {menu}
              </div>
              <div
                className={`min-h-0 w-full border-white/[0.07] bg-stone-900 lg:w-[360px] lg:shrink-0 lg:border-l ${
                  verTicketMovil ? "block" : "hidden"
                } lg:block`}
              >
                {ticket}
              </div>
            </div>

            {(!prodSel || verTicketMovil) && (
              <div
                className="border-t border-white/[0.08] bg-stone-950/80 p-3 lg:hidden"
                style={{
                  paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
                }}
              >
                {verTicketMovil ? (
                  <button
                    type="button"
                    onClick={() => setVerTicketMovil(false)}
                    className="w-full rounded-2xl border border-white/15 bg-stone-900 py-3.5 text-sm font-extrabold text-white active:scale-[0.98]"
                  >
                    ← Seguir añadiendo productos
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setVerTicketMovil(true)}
                    className="flex w-full items-center justify-between rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 px-5 py-3.5 text-sm font-black text-stone-950 shadow-lg shadow-amber-500/20 active:scale-[0.98]"
                  >
                    <span>Ver pedido</span>
                    <span className="rounded-lg bg-stone-950/15 px-2.5 py-0.5 tabular-nums">
                      {totalItemsPedido}{" "}
                      {totalItemsPedido === 1 ? "producto" : "productos"}
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
