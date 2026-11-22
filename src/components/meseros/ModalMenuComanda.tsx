"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  agregarItemAPedido,
  cambiarItemPedido,
  eliminarItemPedido,
  marcarMesaOcupadaPorComanda,
  separarMesas,
  unirMesas,
  type SeleccionPersonalizacion,
} from "@/actions/ventas-mesas.actions";

export type CategoriaComanda = {
  id: string;
  nombre: string;
  emoji?: string | null;
  label?: string | null;
};

export type GrupoPersonalizacionComanda = {
  titulo: string;
  tipo: "radio" | "checkbox";
  opciones: { nombre: string; precioExtra?: number }[];
};

export type ProductoComanda = {
  id: string;
  nombre: string;
  categoria: string;
  precio_base: number;
  imagen_url?: string | null;
  personalizacion?: GrupoPersonalizacionComanda[] | null;
  stock_actual?: number | null;
  controlar_stock?: boolean | null;
  activo?: boolean | null;
};

export type ItemPedidoComanda = {
  id: string;
  pedido_id: string;
  nombre_item: string;
  cantidad: number;
  subtotal: number;
  notas_item?: string | null;
};

export type PedidoComanda = {
  id: string;
  origen: string;
  estado: string;
  mesa_id?: string | null;
  mesero_id?: string | null;
  cliente_nombre?: string | null;
  total: number;
  created_at?: string;
  items: ItemPedidoComanda[];
};

export type MesaComandaActiva = {
  id: string;
  numero: number;
  nombre?: string | null;
  zona: string;
  estado: string;
  habilitada: boolean;
  mesero_actual_id?: string | null;
  unida_con_id?: string | null;
  capacidad?: number;
};

export type MeseroOpcion = {
  id: string;
  nombre: string;
};

const ESTADO_PEDIDO: Record<string, { texto: string; clase: string }> = {
  abierto: { texto: "Abierto", clase: "bg-sky-400/15 text-sky-300" },
  en_cocina: {
    texto: "En preparación",
    clase: "bg-amber-400/15 text-amber-300",
  },
  por_cobrar: {
    texto: "Por cobrar",
    clase: "bg-emerald-400/15 text-emerald-300",
  },
};

function formatHoraBO(iso: string | Date, incluirSegundos = false) {
  return new Intl.DateTimeFormat("es-BO", {
    timeZone: "America/La_Paz",
    hour: "2-digit",
    minute: "2-digit",
    ...(incluirSegundos ? { second: "2-digit" } : {}),
    hour12: true,
  }).format(new Date(iso));
}

export function ModalMenuComanda({
  abierto,
  onCerrar,
  mesaActiva,
  todasLasMesas = [],
  meseros = [],
  esLlevar = false,
  categorias,
  productos,
  pedidos,
  onPedidoActualizado,
  onNotificar,
}: {
  abierto: boolean;
  onCerrar: () => void;
  mesaActiva: MesaComandaActiva | null;
  todasLasMesas?: MesaComandaActiva[];
  meseros?: MeseroOpcion[];
  esLlevar?: boolean;
  categorias: CategoriaComanda[];
  productos: ProductoComanda[];
  pedidos: PedidoComanda[];
  onPedidoActualizado?: () => Promise<void> | void;
  onNotificar?: (msg: {
    tipo: "ok" | "error" | "alerta";
    texto: string;
  }) => void;
}) {
  const router = useRouter();
  const [catFiltro, setCatFiltro] = useState<string>("Todas");
  const [busqueda, setBusqueda] = useState("");
  const [clienteLlevar, setClienteLlevar] = useState("");
  const [pedidoLlevarId, setPedidoLlevarId] = useState<string | null>(null);
  const [mesaParaUnirId, setMesaParaUnirId] = useState("");
  const [verTicketMovil, setVerTicketMovil] = useState(false);

  const [procesandoItemIds, setProcesandoItemIds] = useState<string[]>([]);
  const [mandandoComanda, setMandandoComanda] = useState(false);
  const [comandaBloqueada, setComandaBloqueada] = useState(false);
  const [ultimoEnvioHora, setUltimoEnvioHora] = useState<string | null>(null);
  const [avisoLocal, setAvisoLocal] = useState<{
    tipo: "ok" | "error" | "alerta";
    texto: string;
  } | null>(null);

  const [prodSel, setProdSel] = useState<ProductoComanda | null>(null);
  const [cantidad, setCantidad] = useState(1);
  const [radioSel, setRadioSel] = useState<Record<string, string>>({});
  const [checksSel, setChecksSel] = useState<Record<string, string[]>>({});
  const [notaItem, setNotaItem] = useState("");

  const [itemCambiandoId, setItemCambiandoId] = useState<string | null>(null);
  const [reemplazoMenuItemId, setReemplazoMenuItemId] = useState("");
  const [notaReemplazo, setNotaReemplazo] = useState("");

  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!abierto) {
      setAvisoLocal(null);
    }
  }, [abierto]);

  useEffect(() => {
    setComandaBloqueada(false);
    setUltimoEnvioHora(null);
  }, [mesaActiva?.id, esLlevar]);

  if (!abierto) return null;

  const mesaCabeza = mesaActiva?.unida_con_id
    ? (todasLasMesas.find((m) => m.id === mesaActiva.unida_con_id) ??
      mesaActiva)
    : mesaActiva;

  const mesasUnidasACabeza = mesaCabeza
    ? todasLasMesas.filter((m) => m.unida_con_id === mesaCabeza.id)
    : [];

  const mesasDisponiblesParaUnir = todasLasMesas.filter(
    (m) =>
      mesaCabeza &&
      m.id !== mesaCabeza.id &&
      m.habilitada &&
      m.estado === "disponible" &&
      !m.unida_con_id,
  );

  const pedidoActual: PedidoComanda | null = esLlevar
    ? (pedidos.find((p) => p.id === pedidoLlevarId) ?? null)
    : mesaCabeza
      ? (pedidos.find(
          (p) =>
            p.mesa_id === mesaCabeza.id &&
            ["abierto", "en_cocina", "por_cobrar"].includes(p.estado),
        ) ?? null)
      : null;

  const itemsMostrados = pedidoActual?.items ?? [];
  const totalItemsPedido = itemsMostrados.reduce(
    (s, it) => s + Number(it.cantidad || 1),
    0,
  );

  const estaEnPreparacion =
    Boolean(ultimoEnvioHora) ||
    pedidoActual?.estado === "en_cocina" ||
    mesaCabeza?.estado === "ocupada";

  const meseroActivoId =
    pedidoActual?.mesero_id || mesaCabeza?.mesero_actual_id || "";

  const nombreMeseroActual =
    meseros.find((ms) => ms.id === meseroActivoId)?.nombre ||
    (pedidoActual ? "Mesero asignado" : "Se asignará al mandar comanda");

  function notificar(tipo: "ok" | "error" | "alerta", texto: string) {
    setAvisoLocal({ tipo, texto });
    if (onNotificar) {
      onNotificar({ tipo, texto });
    }
  }

  function prepararProducto(prod: ProductoComanda) {
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

  function calcularExtras(prod: ProductoComanda): SeleccionPersonalizacion[] {
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

  function handleAgregarProducto() {
    if (!prodSel) return;
    if (prodSel.controlar_stock && Number(prodSel.stock_actual ?? 0) <= 0) {
      notificar("error", `"${prodSel.nombre}" está agotado.`);
      return;
    }

    const extras = calcularExtras(prodSel);
    const itemNombre = prodSel.nombre;
    const itemCant = cantidad;
    const notaTexto = notaItem.trim() || null;

    startTransition(async () => {
      const res = await agregarItemAPedido({
        pedidoId: pedidoActual?.id ?? null,
        mesaId: esLlevar ? null : (mesaCabeza?.id ?? null),
        clienteNombre: esLlevar
          ? clienteLlevar.trim() || "Cliente Llevar"
          : null,
        menuItemId: prodSel.id,
        cantidad: itemCant,
        personalizaciones: extras,
        notasItem: notaTexto,
        marcarOcupadaAlMandar: false,
      });

      if (res?.error) {
        notificar("error", res.error);
        return;
      }

      if (esLlevar && res?.pedidoId) setPedidoLlevarId(res.pedidoId);

      setProdSel(null);
      setComandaBloqueada(false);
      notificar(
        "ok",
        `Añadido: ${itemCant}× ${itemNombre}. Toca "Mandar comanda" para imprimir y ocupar mesa.`,
      );
      if (onPedidoActualizado) await onPedidoActualizado();
      router.refresh();
    });
  }

  async function handleMandarComandaCompleta() {
    if (itemsMostrados.length === 0) {
      notificar("error", "Añade al menos un producto antes de mandar comanda.");
      return;
    }
    if (mandandoComanda || isPending || comandaBloqueada) return;

    const destinoNombre = esLlevar
      ? clienteLlevar.trim() || "Para llevar"
      : mesaCabeza?.nombre || `Mesa ${mesaCabeza?.numero ?? ""}`;

    setMandandoComanda(true);
    setAvisoLocal(null);

    try {
      if (!esLlevar && mesaCabeza?.id) {
        const resMesa = await marcarMesaOcupadaPorComanda(mesaCabeza.id);
        if (resMesa?.error) {
          notificar("error", resMesa.error);
          return;
        }
      }

      let impresionOk = false;
      try {
        const respPrint = await fetch("/api/imprimir/cocina", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pedidoId: pedidoActual?.id ?? null,
            mesaId: mesaCabeza?.id ?? null,
            mesero: nombreMeseroActual,
            destino: destinoNombre,
            items: itemsMostrados.map((it) => ({
              id: it.id,
              nombre: it.nombre_item,
              cantidad: it.cantidad,
              notas: it.notas_item,
            })),
          }),
        });
        impresionOk = respPrint.ok;

        if (respPrint.ok) {
          const contentType = respPrint.headers.get("content-type") || "";
          if (contentType.includes("application/pdf")) {
            const blob = await respPrint.blob();
            const pdfUrl = URL.createObjectURL(blob);
            window.open(pdfUrl, "_blank", "noopener,noreferrer");
          }
        }
      } catch {
        impresionOk = false;
      }

      const horaEnvio = formatHoraBO(new Date(), true);
      setUltimoEnvioHora(horaEnvio);
      setComandaBloqueada(true);

      if (onPedidoActualizado) {
        await onPedidoActualizado();
      }
      router.refresh();

      if (impresionOk) {
        notificar(
          "ok",
          `Comanda enviada ${horaEnvio} · En preparación (PDF generado). Mesa marcada como ocupada.`,
        );
      } else {
        notificar(
          "alerta",
          `Comanda enviada ${horaEnvio} · En preparación. Mesa ocupada (revisa /api/imprimir/cocina si esperabas PDF).`,
        );
      }
    } finally {
      setMandandoComanda(false);
    }
  }

  async function handleQuitarItem(detalleId: string, nombreItem: string) {
    if (procesandoItemIds.includes(detalleId)) return;

    setProcesandoItemIds((prev) => [...prev, detalleId]);
    if (itemCambiandoId === detalleId) {
      setItemCambiandoId(null);
      setReemplazoMenuItemId("");
    }

    const res = await eliminarItemPedido(detalleId);

    if (res?.error) {
      setProcesandoItemIds((prev) => prev.filter((id) => id !== detalleId));
      notificar("error", res.error);
      return;
    }

    if (onPedidoActualizado) {
      await onPedidoActualizado();
    }

    setProcesandoItemIds((prev) => prev.filter((id) => id !== detalleId));
    notificar("ok", `Quitado: ${nombreItem}`);
    router.refresh();
  }

  async function handleConfirmarCambioItem(itemActual: ItemPedidoComanda) {
    const prodReemplazo = productos.find(
      (p) => p.id === reemplazoMenuItemId && p.activo !== false,
    );
    if (!prodReemplazo || procesandoItemIds.includes(itemActual.id)) return;

    const cantidadBase = Math.max(1, Number(itemActual.cantidad || 1));
    const notaNueva = notaReemplazo.trim() || undefined;

    setProcesandoItemIds((prev) => [...prev, itemActual.id]);

    const res = await cambiarItemPedido({
      detalleId: itemActual.id,
      nuevoMenuItemId: prodReemplazo.id,
      cantidad: cantidadBase,
      notasItem: notaNueva,
    });

    if (res?.error) {
      setProcesandoItemIds((prev) => prev.filter((id) => id !== itemActual.id));
      notificar("error", res.error);
      return;
    }

    setItemCambiandoId(null);
    setReemplazoMenuItemId("");
    setNotaReemplazo("");
    setComandaBloqueada(false);

    if (onPedidoActualizado) {
      await onPedidoActualizado();
    }

    setProcesandoItemIds((prev) => prev.filter((id) => id !== itemActual.id));
    notificar(
      "ok",
      `Cambiado a ${prodReemplazo.nombre}. Ya puedes volver a mandar comanda.`,
    );
    router.refresh();
  }

  function handleUnirMesa() {
    if (!mesaCabeza || !mesaParaUnirId) return;
    startTransition(async () => {
      const res = await unirMesas(mesaCabeza.id, mesaParaUnirId);
      if (res?.error) {
        notificar("error", res.error);
        return;
      }
      setMesaParaUnirId("");
      notificar("ok", "Mesa unida al grupo.");
      if (onPedidoActualizado) await onPedidoActualizado();
      router.refresh();
    });
  }

  function handleSepararMesas() {
    if (!mesaCabeza) return;
    startTransition(async () => {
      const res = await separarMesas(mesaCabeza.id);
      if (res?.error) {
        notificar("error", res.error);
        return;
      }
      notificar("ok", "Mesas unidas separadas.");
      if (onPedidoActualizado) await onPedidoActualizado();
      router.refresh();
    });
  }

  const productosVisibles = productos.filter((p) => {
    if (p.activo === false) return false;
    const okCat = catFiltro === "Todas" || p.categoria === catFiltro;
    const q = busqueda.trim().toLowerCase();
    const okQ = !q || p.nombre.toLowerCase().includes(q);
    return okCat && okQ;
  });

  const productosActivos = productos.filter((p) => p.activo !== false);

  const precioLineaEstimado = prodSel
    ? (Number(prodSel.precio_base || 0) +
        calcularExtras(prodSel).reduce(
          (s, e) => s + Number(e.extraBs || 0),
          0,
        )) *
      cantidad
    : 0;

  const etiquetaGrupo =
    mesaCabeza && mesasUnidasACabeza.length > 0
      ? [mesaCabeza, ...mesasUnidasACabeza]
          .map((m) => m.nombre || `Mesa ${m.numero}`)
          .join(" + ")
      : mesaCabeza
        ? mesaCabeza.nombre || `Mesa ${mesaCabeza.numero}`
        : "";

  const totalAcumulado = Number(
    pedidoActual?.total ??
      itemsMostrados.reduce((s, it) => s + Number(it.subtotal || 0), 0),
  );

  const ocupadaOcupado = mandandoComanda || isPending;

  const ticket = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <div>
          <h4 className="text-sm font-extrabold text-white">Pedido actual</h4>
          <p className="text-[11px] text-stone-400">
            {ultimoEnvioHora
              ? `Comanda enviada ${ultimoEnvioHora}`
              : pedidoActual?.created_at
                ? `Desde las ${formatHoraBO(pedidoActual.created_at, false)}`
                : "Aún sin productos"}
          </p>
        </div>
        {pedidoActual && (
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
              estaEnPreparacion
                ? "bg-amber-400/15 text-amber-300"
                : ESTADO_PEDIDO[pedidoActual.estado]?.clase ||
                  "bg-sky-400/15 text-sky-300"
            }`}
          >
            {estaEnPreparacion
              ? "En preparación"
              : ESTADO_PEDIDO[pedidoActual.estado]?.texto || "Abierto"}
          </span>
        )}
      </div>

      {avisoLocal && (
        <div className="px-4 pb-2">
          <div
            className={`rounded-xl border px-3 py-2 text-xs font-bold ${
              avisoLocal.tipo === "error"
                ? "border-rose-400/30 bg-rose-500/15 text-rose-200"
                : avisoLocal.tipo === "alerta"
                  ? "border-amber-400/35 bg-amber-400/15 text-amber-200"
                  : "border-emerald-400/35 bg-emerald-400/15 text-emerald-200"
            }`}
          >
            {avisoLocal.texto}
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-3">
        {esLlevar && !pedidoActual && (
          <input
            value={clienteLlevar}
            onChange={(e) => setClienteLlevar(e.target.value)}
            placeholder="Nombre o referencia (opcional)"
            className="w-full rounded-xl border border-white/10 bg-stone-950 px-3.5 py-3 text-sm text-white placeholder:text-stone-500 focus:border-amber-400/60 focus:outline-none"
          />
        )}

        {pedidoActual && (
          <div className="space-y-1 rounded-xl border border-white/10 bg-stone-950 p-2.5">
            <label className="block text-[10px] font-extrabold uppercase tracking-wider text-amber-300">
              Mesero a cargo
            </label>
            <p className="rounded-lg border border-white/5 bg-stone-900 px-2.5 py-1.5 text-xs font-bold text-stone-200">
              {nombreMeseroActual}
            </p>
          </div>
        )}

        {!esLlevar && mesaCabeza && (
          <div className="space-y-2 rounded-xl border border-white/10 bg-stone-950 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-amber-300">
                Grupo ({1 + mesasUnidasACabeza.length} mesas)
              </p>
              {mesasUnidasACabeza.length > 0 && (
                <button
                  type="button"
                  disabled={ocupadaOcupado}
                  onClick={handleSepararMesas}
                  className="rounded-lg bg-amber-400/20 px-2 py-0.5 text-[11px] font-bold text-amber-200 hover:bg-amber-400/30"
                >
                  Separar
                </button>
              )}
            </div>

            {mesasDisponiblesParaUnir.length > 0 && (
              <div className="flex gap-1.5">
                <select
                  value={mesaParaUnirId}
                  onChange={(e) => setMesaParaUnirId(e.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-white/10 bg-stone-900 px-2 py-1.5 text-xs text-white"
                >
                  <option value="">+ Sumar mesa libre...</option>
                  {mesasDisponiblesParaUnir.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre || `Mesa ${m.numero}`} ({m.zona})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={ocupadaOcupado || !mesaParaUnirId}
                  onClick={handleUnirMesa}
                  className="shrink-0 rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-black text-stone-950 disabled:opacity-40"
                >
                  Unir
                </button>
              </div>
            )}
          </div>
        )}

        {itemsMostrados.length === 0 ? (
          <div className="grid place-items-center rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center">
            <span className="text-3xl">🧾</span>
            <p className="mt-2 text-sm font-bold text-stone-200">
              Todavía no hay nada pedido
            </p>
            <p className="mt-0.5 text-xs text-stone-500">
              Añade productos del menú y luego mándalos a cocina.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-white/[0.06]">
            {itemsMostrados.map((it) => {
              const estaProcesando = procesandoItemIds.includes(it.id);
              const estaCambiando = itemCambiandoId === it.id;
              return (
                <li key={it.id} className="space-y-1.5 py-2.5">
                  <div className="flex items-start gap-2.5">
                    <span className="grid h-7 min-w-7 place-items-center rounded-lg bg-amber-400/15 px-1.5 text-xs font-black text-amber-300">
                      {it.cantidad}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-sm font-semibold leading-snug text-white">
                          {it.nombre_item}
                        </p>
                        {estaEnPreparacion && (
                          <span className="rounded-md bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                            En preparación
                          </span>
                        )}
                      </div>
                      {it.notas_item && (
                        <p className="mt-0.5 text-[11px] text-amber-300/80">
                          {it.notas_item}
                        </p>
                      )}
                    </div>
                    <span className="text-xs font-bold tabular-nums text-stone-200">
                      Bs {Number(it.subtotal).toFixed(2)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 pl-9">
                    <button
                      type="button"
                      disabled={estaProcesando || ocupadaOcupado}
                      onClick={() => {
                        if (estaCambiando) {
                          setItemCambiandoId(null);
                          setReemplazoMenuItemId("");
                        } else {
                          setItemCambiandoId(it.id);
                          setReemplazoMenuItemId("");
                          setNotaReemplazo(it.notas_item || "");
                          setComandaBloqueada(false);
                        }
                      }}
                      className="rounded-lg border border-amber-400/35 bg-amber-400/10 px-2 py-1 text-[11px] font-bold text-amber-200 hover:bg-amber-400/20 disabled:opacity-50"
                    >
                      {estaCambiando ? "Cancelar" : "Cambiar"}
                    </button>
                    <button
                      type="button"
                      disabled={estaProcesando || ocupadaOcupado}
                      onClick={() => handleQuitarItem(it.id, it.nombre_item)}
                      className="rounded-lg border border-rose-400/35 bg-rose-500/10 px-2 py-1 text-[11px] font-bold text-rose-200 hover:bg-rose-500/20 disabled:opacity-50"
                    >
                      {estaProcesando ? "Quitando..." : "Quitar"}
                    </button>
                  </div>

                  {estaCambiando && !estaProcesando && (
                    <div className="ml-9 space-y-1.5 rounded-xl border border-white/10 bg-stone-950 p-2">
                      <select
                        value={reemplazoMenuItemId}
                        onChange={(e) => setReemplazoMenuItemId(e.target.value)}
                        className="w-full rounded-lg border border-white/10 bg-stone-900 px-2 py-1.5 text-xs text-white"
                      >
                        <option value="">
                          Cambiar por (soda, pique, plato)...
                        </option>
                        {productosActivos.map((op) => (
                          <option key={op.id} value={op.id}>
                            {op.nombre} (Bs{" "}
                            {Number(op.precio_base || 0).toFixed(2)})
                          </option>
                        ))}
                      </select>
                      <input
                        value={notaReemplazo}
                        onChange={(e) => setNotaReemplazo(e.target.value)}
                        placeholder="Nota del cambio (opcional)"
                        className="w-full rounded-lg border border-white/10 bg-stone-900 px-2 py-1.5 text-xs text-white"
                      />
                      <button
                        type="button"
                        disabled={!reemplazoMenuItemId || ocupadaOcupado}
                        onClick={() => handleConfirmarCambioItem(it)}
                        className="w-full rounded-lg bg-emerald-400 py-1.5 text-xs font-black text-stone-950 disabled:opacity-40"
                      >
                        Guardar cambio
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {itemsMostrados.length > 0 && (
        <div className="space-y-3 border-t border-white/[0.08] bg-stone-950/70 p-4">
          <div className="flex items-center justify-between text-xs font-semibold text-stone-400">
            <span>Cuenta actual ({totalItemsPedido} ítems)</span>
            <span>La cobra caja al final</span>
          </div>
          <div className="flex items-end justify-between">
            <span className="text-xs font-bold text-stone-300">
              Total acumulado
            </span>
            <span className="text-xl font-black tabular-nums text-emerald-300">
              Bs {totalAcumulado.toFixed(2)}
            </span>
          </div>
          <button
            type="button"
            disabled={ocupadaOcupado || comandaBloqueada}
            onClick={handleMandarComandaCompleta}
            className="w-full rounded-2xl bg-emerald-400 py-3 text-sm font-black text-stone-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-300 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-stone-700 disabled:text-stone-400 disabled:shadow-none"
          >
            {mandandoComanda || isPending
              ? "Mandando e imprimiendo..."
              : comandaBloqueada
                ? `✓ Comanda enviada ${ultimoEnvioHora ?? ""}`
                : "📤 Mandar comanda a cocina"}
          </button>
        </div>
      )}
    </div>
  );

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
            className="w-full rounded-xl border border-white/10 bg-stone-950 px-3.5 py-3 text-sm text-white placeholder:text-stone-500 focus:border-amber-400/60 focus:outline-none"
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
          disabled={ocupadaOcupado}
          onClick={handleAgregarProducto}
          className="flex h-12 flex-1 items-center justify-between rounded-2xl bg-amber-400 px-5 text-sm font-black text-stone-950 shadow-lg shadow-amber-500/25 transition hover:bg-amber-300 active:scale-[0.98] disabled:opacity-50"
        >
          <span>{ocupadaOcupado ? "Añadiendo..." : "Añadir al pedido"}</span>
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
            className="w-full rounded-xl border border-white/10 bg-stone-950 py-3 pl-10 pr-3.5 text-sm text-white placeholder:text-stone-500 focus:border-amber-400/60 focus:outline-none"
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
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {productosVisibles.map((p) => {
            const sinStock =
              Boolean(p.controlar_stock) && Number(p.stock_actual ?? 0) <= 0;
            return (
              <button
                key={p.id}
                type="button"
                disabled={sinStock || ocupadaOcupado}
                onClick={() => prepararProducto(p)}
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
                          : Number(p.stock_actual ?? 0) <= 5
                            ? "text-orange-300"
                            : "text-stone-500"
                      }`}
                    >
                      {sinStock
                        ? "Agotado"
                        : `${Number(p.stock_actual ?? 0)} disponibles`}
                    </p>
                  )}
                </div>
                {!sinStock && (
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-400/15 text-lg font-black text-emerald-300 transition group-hover:bg-emerald-400 group-hover:text-stone-950">
                    +
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-6">
      <div className="flex h-dvh w-full flex-col overflow-hidden bg-stone-900 shadow-2xl sm:h-[90dvh] sm:max-w-6xl sm:rounded-3xl sm:border sm:border-white/10">
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-3.5 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-400/15 text-xl font-black text-amber-300">
              {esLlevar ? "🛍️" : mesaCabeza?.numero}
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-base font-extrabold text-white sm:text-lg">
                {esLlevar
                  ? "Pedido para llevar"
                  : mesaCabeza
                    ? `${etiquetaGrupo}`
                    : ""}
              </h3>
              <p className="truncate text-xs text-stone-400">
                {esLlevar
                  ? pedidoActual?.cliente_nombre || "Sin referencia de cliente"
                  : mesaCabeza
                    ? `${mesaCabeza.zona} · ${
                        mesaCabeza.estado === "disponible"
                          ? "Sigue disponible hasta mandar comanda"
                          : mesaCabeza.estado === "ocupada"
                            ? "Ocupada"
                            : mesaCabeza.estado
                      }`
                    : ""}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setProdSel(null);
              setVerTicketMovil(false);
              onCerrar();
            }}
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
                className="flex w-full items-center justify-between rounded-2xl bg-emerald-400 px-5 py-3.5 text-sm font-black text-stone-950 shadow-lg shadow-emerald-500/20 active:scale-[0.98]"
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
  );
}
