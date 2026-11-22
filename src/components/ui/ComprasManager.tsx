"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  eliminarCompraGasto,
  registrarCompraGasto,
} from "@/actions/compras.actions";

export type ItemMenuCorto = {
  id: string;
  nombre: string;
  categoria: string;
  tipo_item?: "plato" | "unidad" | null;
  stock_actual: number;
};

export type CompraGastoItem = {
  id: string;
  concepto: string;
  categoria_gasto: string;
  monto: number;
  fecha_compra: string;
  menu_item_id?: string | null;
  cantidad_sumada: number;
  nota?: string | null;
};

function esItemPorUnidad(item: ItemMenuCorto): boolean {
  if (item.tipo_item === "unidad") return true;
  if (item.tipo_item === "plato") return false;
  const cat = item.categoria.trim().toLowerCase();
  return (
    cat.includes("bebida") ||
    cat.includes("soda") ||
    cat.includes("vino") ||
    cat.includes("cerveza") ||
    cat.includes("refresco")
  );
}

// Fecha local (YYYY-MM-DD). toISOString() usa UTC y en Bolivia (UTC-4)
// después de las 20:00 devolvería el día siguiente.
function fechaLocalHoy(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Clases reutilizables. text-base en móvil evita el zoom automático de iOS
// al enfocar un input; en pantallas >= sm vuelve a text-sm.
const labelCls =
  "block text-[11px] font-semibold uppercase tracking-wider text-stone-400 sm:text-xs";
const inputCls =
  "block w-full min-w-0 min-h-11 rounded-xl border border-white/10 bg-stone-950 px-3.5 py-2.5 text-base text-white placeholder:text-stone-600 focus:border-amber-400 focus:outline-none sm:text-sm [color-scheme:dark]";

export function ComprasManager({
  comprasIniciales,
  itemsMenu,
  ventasHoyBs = 0,
}: {
  comprasIniciales: CompraGastoItem[];
  itemsMenu: ItemMenuCorto[];
  ventasHoyBs?: number;
}) {
  const router = useRouter();
  const [compras, setCompras] = useState<CompraGastoItem[]>(comprasIniciales);
  const [concepto, setConcepto] = useState("");
  const [enQueGasto, setEnQueGasto] = useState("");
  const [monto, setMonto] = useState("");
  const [fechaCompra, setFechaCompra] = useState(fechaLocalHoy);
  const [menuItemId, setMenuItemId] = useState("");
  const [cantidadSumada, setCantidadSumada] = useState("0");
  const [nota, setNota] = useState("");
  const [filtroFecha, setFiltroFecha] = useState<string>("");

  const [mensaje, setMensaje] = useState<{
    tipo: "ok" | "error";
    texto: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setCompras(comprasIniciales);
  }, [comprasIniciales]);

  const itemsPorUnidad = itemsMenu.filter(esItemPorUnidad);

  function handleRegistrar(e: React.FormEvent) {
    e.preventDefault();
    setMensaje(null);

    const detalleGasto =
      enQueGasto.trim() || concepto.trim() || "Gasto general";

    startTransition(async () => {
      const res = await registrarCompraGasto({
        concepto,
        categoria_gasto: detalleGasto,
        monto: Number(monto),
        fecha_compra: fechaCompra,
        menu_item_id: menuItemId || null,
        cantidad_sumada: Number(cantidadSumada),
        nota,
      });

      if (res?.error) {
        setMensaje({ tipo: "error", texto: res.error });
        return;
      }

      setMensaje({
        tipo: "ok",
        texto: `Registro guardado por Bs ${Number(monto).toFixed(2)}.`,
      });
      setConcepto("");
      setEnQueGasto("");
      setMonto("");
      setMenuItemId("");
      setCantidadSumada("0");
      setNota("");
      router.refresh();
    });
  }

  function handleEliminar(id: string, conceptoItem: string) {
    setMensaje(null);
    if (!window.confirm(`¿Eliminar el registro "${conceptoItem}"?`)) return;

    startTransition(async () => {
      const res = await eliminarCompraGasto(id);
      if (res?.error) {
        setMensaje({ tipo: "error", texto: res.error });
        return;
      }
      setCompras((prev) => prev.filter((c) => c.id !== id));
      setMensaje({ tipo: "ok", texto: "Registro eliminado." });
      router.refresh();
    });
  }

  const hoyStr = fechaLocalHoy();
  const gastosHoyBs = compras
    .filter((c) => c.fecha_compra === hoyStr)
    .reduce((acc, c) => acc + Number(c.monto || 0), 0);

  const balanceHoyBs = ventasHoyBs - gastosHoyBs;

  const comprasFiltradas = filtroFecha
    ? compras.filter((c) => c.fecha_compra === filtroFecha)
    : compras;

  const totalFiltradoBs = comprasFiltradas.reduce(
    (acc, c) => acc + Number(c.monto || 0),
    0,
  );

  const nombreMenuMap = new Map(itemsMenu.map((i) => [i.id, i.nombre]));

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 px-3 py-4 sm:space-y-6 sm:px-6 sm:py-6 lg:px-8">
      {mensaje && (
        <div
          role="status"
          className={`rounded-2xl border px-4 py-3 text-sm font-medium break-words ${
            mensaje.tipo === "ok"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              : "border-rose-500/30 bg-rose-500/10 text-rose-200"
          }`}
        >
          {mensaje.texto}
        </div>
      )}

      {/* Comparación rápida del día: Ventas vs Gastos.
          Móvil: Ventas y Gastos lado a lado, Balance abajo a todo el ancho.
          Desktop: 3 columnas iguales. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <div className="min-w-0 rounded-2xl border border-white/[0.07] bg-stone-900/80 p-3.5 sm:rounded-3xl sm:p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400 sm:text-xs">
            Ventas hoy
          </p>
          <p className="mt-1 break-words text-lg font-extrabold text-emerald-300 sm:text-2xl">
            Bs {ventasHoyBs.toFixed(2)}
          </p>
        </div>

        <div className="min-w-0 rounded-2xl border border-white/[0.07] bg-stone-900/80 p-3.5 sm:rounded-3xl sm:p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400 sm:text-xs">
            Gastos hoy
          </p>
          <p className="mt-1 break-words text-lg font-extrabold text-amber-300 sm:text-2xl">
            Bs {gastosHoyBs.toFixed(2)}
          </p>
        </div>

        <div className="col-span-2 min-w-0 rounded-2xl border border-white/[0.07] bg-stone-900/80 p-3.5 sm:col-span-1 sm:rounded-3xl sm:p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400 sm:text-xs">
            Balance hoy (Ventas - Gastos)
          </p>
          <p
            className={`mt-1 break-words text-xl font-extrabold sm:text-2xl ${
              balanceHoyBs >= 0 ? "text-white" : "text-rose-300"
            }`}
          >
            Bs {balanceHoyBs.toFixed(2)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-12 lg:items-start">
        {/* Formulario rápido de gasto / compra
            En PC queda fijo (sticky) mientras se desplaza el historial. */}
        <form
          onSubmit={handleRegistrar}
          className="min-w-0 space-y-4 rounded-2xl border border-white/[0.07] bg-gradient-to-b from-stone-900 to-stone-900/60 p-4 shadow-lg sm:rounded-3xl sm:p-5 lg:sticky lg:top-4 lg:col-span-5 xl:col-span-4"
        >
          <h2 className="text-base font-extrabold text-white sm:text-lg">
            🧾 Registrar gasto / compra
          </h2>

          <div className="space-y-1.5">
            <label htmlFor="en-que-gasto" className={labelCls}>
              ¿En qué gastó?
            </label>
            <input
              id="en-que-gasto"
              value={enQueGasto}
              onChange={(e) => setEnQueGasto(e.target.value)}
              required
              placeholder="Ej. Alquiler, Carbón, Carne, Sodas..."
              className={inputCls}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="concepto" className={labelCls}>
              Detalle / concepto
            </label>
            <input
              id="concepto"
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
              required
              placeholder="Ej. Pago del mes, 2 bolsas de carbón"
              className={inputCls}
            />
          </div>

          {/* En celulares muy angostos se apilan; desde 420px van en 2 columnas */}
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
            <div className="min-w-0 space-y-1.5">
              <label htmlFor="monto" className={labelCls}>
                Monto (Bs)
              </label>
              <input
                id="monto"
                type="number"
                inputMode="decimal"
                step="0.5"
                min="0.5"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                required
                placeholder="Ej. 250"
                className={inputCls}
              />
            </div>

            <div className="min-w-0 space-y-1.5">
              <label htmlFor="fecha" className={labelCls}>
                Fecha
              </label>
              <input
                id="fecha"
                type="date"
                value={fechaCompra}
                onChange={(e) => setFechaCompra(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          {/* Sumar stock por unidad (corto y directo) */}
          <div className="space-y-2.5 rounded-2xl border border-white/[0.07] bg-stone-950/60 p-3 sm:p-3.5">
            <p className="text-xs font-bold text-amber-300">
              Sumar stock por unidad
            </p>
            <select
              value={menuItemId}
              onChange={(e) => setMenuItemId(e.target.value)}
              aria-label="Producto al que se suma stock"
              className="block min-h-11 w-full min-w-0 rounded-xl border border-white/10 bg-stone-900 px-3 py-2 text-base text-white focus:border-amber-400 focus:outline-none sm:text-sm"
            >
              <option value="">Ninguno</option>
              {itemsPorUnidad.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nombre} (Stock: {item.stock_actual})
                </option>
              ))}
            </select>

            {menuItemId && (
              <div className="space-y-1.5">
                <label
                  htmlFor="cantidad"
                  className="block text-xs font-semibold text-stone-400"
                >
                  Cantidad
                </label>
                <input
                  id="cantidad"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={cantidadSumada}
                  onChange={(e) => setCantidadSumada(e.target.value)}
                  className="block min-h-11 w-full min-w-0 rounded-xl border border-white/10 bg-stone-900 px-3 py-2 text-base text-white focus:border-amber-400 focus:outline-none sm:text-sm"
                />
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="nota" className={labelCls}>
              Nota (opcional)
            </label>
            <input
              id="nota"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Ej. Falta cubrir el resto esta semana"
              className={inputCls}
            />
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="min-h-12 w-full rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 py-3 text-sm font-extrabold text-stone-950 shadow-lg shadow-orange-600/20 transition hover:brightness-110 active:scale-95 disabled:opacity-50"
          >
            {isPending ? "Guardando..." : "Guardar gasto"}
          </button>
        </form>

        {/* Historial de gastos / compras */}
        <div className="min-w-0 overflow-hidden rounded-2xl border border-white/[0.07] bg-gradient-to-b from-stone-900 to-stone-900/60 shadow-lg sm:rounded-3xl lg:col-span-7 xl:col-span-8">
          <div className="flex flex-col gap-3 border-b border-white/[0.07] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-4">
            <div className="min-w-0">
              <h2 className="text-base font-extrabold text-white sm:text-lg">
                Gastos registrados
              </h2>
              <p className="text-xs text-stone-400">
                Total: Bs {totalFiltradoBs.toFixed(2)} ·{" "}
                {comprasFiltradas.length} registro(s)
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="date"
                value={filtroFecha}
                onChange={(e) => setFiltroFecha(e.target.value)}
                aria-label="Filtrar por fecha"
                className="min-h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-stone-950 px-3 py-1.5 text-base text-white focus:border-amber-400 focus:outline-none sm:flex-none sm:text-xs [color-scheme:dark]"
              />
              {filtroFecha && (
                <button
                  type="button"
                  onClick={() => setFiltroFecha("")}
                  className="min-h-10 shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-stone-300 hover:bg-white/10"
                >
                  Todas
                </button>
              )}
            </div>
          </div>

          {comprasFiltradas.length === 0 ? (
            <div className="p-6 text-center text-sm text-stone-400 sm:p-8">
              No hay registros en este filtro.
            </div>
          ) : (
            <div className="divide-y divide-white/[0.05] lg:max-h-[70vh] lg:overflow-y-auto">
              {comprasFiltradas.map((c) => (
                <div
                  key={c.id}
                  className="flex items-start justify-between gap-3 px-4 py-3.5 hover:bg-white/[0.02] sm:items-center sm:gap-4 sm:px-5 sm:py-4"
                >
                  {/* Izquierda: concepto, categoría, fecha, nota */}
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="break-words font-bold text-white">
                      {c.concepto}
                    </p>

                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="max-w-full break-words rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-bold text-amber-300">
                        {c.categoria_gasto}
                      </span>
                      <span className="text-xs text-stone-500">
                        {c.fecha_compra}
                      </span>
                    </div>

                    {(c.menu_item_id && c.cantidad_sumada > 0) || c.nota ? (
                      <p className="break-words text-xs text-stone-400">
                        {c.menu_item_id && c.cantidad_sumada > 0
                          ? `+${c.cantidad_sumada} en ${nombreMenuMap.get(c.menu_item_id) ?? "stock"}`
                          : ""}
                        {c.menu_item_id && c.cantidad_sumada > 0 && c.nota
                          ? " · "
                          : ""}
                        {c.nota ?? ""}
                      </p>
                    ) : null}
                  </div>

                  {/* Derecha: monto + eliminar.
                      Móvil: apilados (monto arriba, botón abajo).
                      sm+: en fila. */}
                  <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-3">
                    <span className="whitespace-nowrap text-sm font-extrabold text-amber-300 sm:text-base">
                      Bs {Number(c.monto).toFixed(2)}
                    </span>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleEliminar(c.id, c.concepto)}
                      aria-label={`Eliminar ${c.concepto}`}
                      className="flex h-10 w-10 items-center justify-center rounded-xl border border-rose-500/30 bg-rose-500/10 text-sm font-bold text-rose-300 hover:bg-rose-500/20 active:scale-95 disabled:opacity-50"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
