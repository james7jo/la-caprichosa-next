"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  bs,
  formatDiaLargo,
  formatFechaCorta,
  formatFechaHora,
  formatHora,
  mismoDia,
} from "@/lib/reportes/utilidades";
import {
  calcularResumen,
  montoVenta,
  nombreArchivoCsv,
  ventasACsv,
  type CierreCaja,
  type DatosReporte,
  type FiltroNegocio,
  type Venta,
} from "@/lib/reportes/consultas";

const NEG = {
  churrasqueria: {
    emoji: "🔥",
    nombre: "Churrasquería",
    texto: "text-rose-300",
    borde: "border-rose-400/40",
    fondo: "bg-rose-500/10",
  },
  hamburgueseria: {
    emoji: "🍔",
    nombre: "Hamburguesería",
    texto: "text-amber-300",
    borde: "border-amber-400/40",
    fondo: "bg-amber-500/10",
  },
} as const;

const METODOS: Record<
  string,
  { emoji: string; nombre: string; barra: string }
> = {
  efectivo: { emoji: "💵", nombre: "Efectivo", barra: "bg-emerald-400" },
  qr: { emoji: "📱", nombre: "QR", barra: "bg-sky-400" },
  transferencia: {
    emoji: "🏦",
    nombre: "Transferencia",
    barra: "bg-violet-400",
  },
  tarjeta: { emoji: "💳", nombre: "Tarjeta", barra: "bg-pink-400" },
  mixto: { emoji: "🔀", nombre: "Mixto", barra: "bg-amber-400" },
};
const metodoInfo = (m: string) =>
  METODOS[m] ?? { emoji: "💰", nombre: m, barra: "bg-stone-400" };

function Kpi({
  etiqueta,
  valor,
  nota,
  clase = "text-white",
}: {
  etiqueta: string;
  valor: string;
  nota?: string;
  clase?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-stone-900/80 p-3 sm:p-4">
      <p className="text-[11px] font-bold uppercase tracking-wide text-stone-400">
        {etiqueta}
      </p>
      <p
        className={`mt-1 text-xl font-black tabular-nums sm:text-2xl ${clase}`}
      >
        {valor}
      </p>
      {nota && <p className="mt-0.5 text-[11px] text-stone-500">{nota}</p>}
    </div>
  );
}

function Seccion({
  titulo,
  cuenta,
  abierto,
  onToggle,
  children,
}: {
  titulo: string;
  cuenta: number;
  abierto: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-white/[0.07] bg-stone-900/75">
      <button
        type="button"
        onClick={onToggle}
        className="no-print flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
      >
        <span className="text-sm font-extrabold text-white">
          {titulo}{" "}
          <span className="ml-1 font-bold text-stone-400">({cuenta})</span>
        </span>
        <span className="text-xs text-stone-400">{abierto ? "▲" : "▼"}</span>
      </button>
      <h2 className="hidden px-4 pt-3 text-sm font-extrabold print:block">
        {titulo} ({cuenta})
      </h2>
      <div
        className={
          abierto
            ? "border-t border-white/[0.06] p-3"
            : "hidden border-t border-white/[0.06] p-3 print:block"
        }
      >
        {children}
      </div>
    </section>
  );
}

function FilaVenta({
  v,
  filtro,
  abierta,
  multiDia,
  onToggle,
}: {
  v: Venta;
  filtro: FiltroNegocio;
  abierta: boolean;
  multiDia: boolean;
  onToggle: () => void;
}) {
  const monto = montoVenta(v, filtro);
  const esPagoMixto = v.metodos.length > 1 || v.metodos.includes("mixto");

  return (
    <li className="rounded-2xl border border-white/[0.07] bg-stone-950">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-3 py-3 text-left"
      >
        <div className="w-12 shrink-0 text-center">
          <p className="text-sm font-black tabular-nums text-white">
            {formatHora(v.hora)}
          </p>
          {multiDia && (
            <p className="text-[10px] text-stone-500">
              {formatFechaCorta(v.hora)}
            </p>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-extrabold text-white">
            {v.etiqueta}
          </p>
          <p className="truncate text-[11px] text-stone-400">
            {v.mesero} · {v.platos} {v.platos === 1 ? "plato" : "platos"}
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {esPagoMixto && (
              <span className="rounded-full border border-amber-400/35 bg-amber-400/15 px-2 py-0.5 text-[10px] font-extrabold text-amber-200">
                🔀 Pago mixto
              </span>
            )}
            {v.metodos
              .filter((m) => m !== "mixto")
              .map((m) => (
                <span
                  key={m}
                  className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-bold text-stone-200"
                >
                  {metodoInfo(m).emoji} {metodoInfo(m).nombre}
                </span>
              ))}
            {v.neg.churrasqueria > 0.005 && (
              <span className="text-[11px]">🔥</span>
            )}
            {v.neg.hamburgueseria > 0.005 && (
              <span className="text-[11px]">🍔</span>
            )}
          </div>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-base font-black tabular-nums text-emerald-300">
            {bs(monto)}
          </p>
          {v.propina > 0 && (
            <p className="text-[10px] font-bold text-amber-300">
              + {bs(v.propina)} propina
            </p>
          )}
          <span className="text-[10px] text-stone-500">
            {abierta ? "▲" : "▼"}
          </span>
        </div>
      </button>

      <div
        className={
          abierta
            ? "space-y-2 border-t border-white/[0.06] px-3 py-3"
            : "hidden space-y-2 border-t border-white/[0.06] px-3 py-3 print:block"
        }
      >
        {esPagoMixto && (
          <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.07] px-3 py-2 text-[11px] text-amber-100">
            <span className="font-extrabold text-amber-300">
              Pago mixto registrado:
            </span>{" "}
            {v.metodos
              .filter((m) => m !== "mixto")
              .map((m) => `${metodoInfo(m).emoji} ${metodoInfo(m).nombre}`)
              .join(" + ") || "Partes en caja"}{" "}
            · Total {bs(v.monto)}
          </div>
        )}

        {v.items.length === 0 ? (
          <p className="text-xs text-stone-400">
            Cobro directo, sin detalle de ítems.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {v.items.map((it) => (
              <li
                key={it.id}
                className="flex items-start justify-between gap-3 text-xs"
              >
                <span className="min-w-0 text-stone-200">
                  <span className="font-black text-white">{it.cantidad}×</span>{" "}
                  {it.nombre}{" "}
                  <span className="text-[11px]">
                    {it.clase === "compartido" ? "🥤" : NEG[it.clase].emoji}
                  </span>
                </span>
                <span className="shrink-0 font-bold tabular-nums text-stone-300">
                  {bs(it.subtotal)}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-white/[0.06] pt-2 text-[11px] text-stone-400">
          {v.horaPedido && <span>Pedido: {formatHora(v.horaPedido)}</span>}
          <span>Cobro: {formatHora(v.hora)}</span>
          <span>Cobró: {v.cobradoPor}</span>
          <span>{v.validada ? "✅ Validado en caja" : "⏳ Sin validar"}</span>
        </div>
        {filtro !== "todo" && (
          <p className={`text-[11px] font-bold ${NEG[filtro].texto}`}>
            Parte de {NEG[filtro].nombre}: {bs(monto)} de {bs(v.monto)}
          </p>
        )}
      </div>
    </li>
  );
}

export function ReporteVentas({
  datos,
  modo,
  cierre = null,
  actualizando,
  onActualizar,
}: {
  datos: DatosReporte;
  modo: "cierre" | "rango";
  /** Turno de caja al que corresponde este cierre (si se conoce) */
  cierre?: CierreCaja | null;
  actualizando: boolean;
  onActualizar: () => void;
}) {
  const [filtro, setFiltro] = useState<FiltroNegocio>("todo");
  const [abierto, setAbierto] = useState({
    detalle: true,
    productos: false,
    egresos: false,
  });
  const [expandida, setExpandida] = useState<string | null>(null);

  const resumen = useMemo(
    () => calcularResumen(datos.ventas, datos.egresos, filtro),
    [datos, filtro],
  );
  const ventasVista = useMemo(
    () =>
      filtro === "todo"
        ? datos.ventas
        : datos.ventas.filter((v) => v.neg[filtro] > 0.005),
    [datos.ventas, filtro],
  );
  const egresosVista =
    filtro === "todo"
      ? datos.egresos
      : datos.egresos.filter((e) => e.negocio === filtro);

  const cantidadMixtos = useMemo(
    () =>
      ventasVista.filter(
        (v) => v.metodos.length > 1 || v.metodos.includes("mixto"),
      ).length,
    [ventasVista],
  );

  const multiDia = !mismoDia(datos.rango.desde, datos.rango.hasta);
  const efectivo =
    resumen.porMetodo.find((m) => m.metodo === "efectivo")?.monto ?? 0;
  const montoInicial = cierre?.montoInicial ?? 0;
  const esperado = montoInicial + efectivo - resumen.egresosTotal;
  const difCierre =
    cierre && cierre.cerradoEn && cierre.efectivoContado !== null
      ? (cierre.diferencia ??
        cierre.efectivoContado - (cierre.efectivoEsperado ?? esperado))
      : null;

  function descargarCsv() {
    const blob = new Blob([ventasACsv(datos)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombreArchivoCsv(datos);
    a.click();
    URL.revokeObjectURL(url);
  }

  const titulo =
    modo === "cierre"
      ? `Cierre de caja · ${formatDiaLargo(datos.rango.desde)}`
      : "Reporte de ventas";
  const rangoTxt =
    modo === "cierre"
      ? cierre
        ? `Caja abierta a las ${formatHora(cierre.abiertoEn)} por ${cierre.abiertoPor}${
            cierre.cerradoEn
              ? ` · cerrada a las ${formatHora(cierre.cerradoEn)} por ${cierre.cerradoPor ?? "—"}`
              : " · sigue abierta"
          }`
        : `Desde las ${formatHora(datos.rango.desde)} · generado a las ${formatHora(datos.generadoEn)}`
      : `${formatFechaHora(datos.rango.desde)} → ${formatFechaHora(datos.rango.hasta)}`;

  const sumaNeg =
    resumen.neg.churrasqueria.ventas + resumen.neg.hamburgueseria.ventas;

  return (
    <div className="reporte-print space-y-3 sm:space-y-4">
      {/* Título y acciones */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-extrabold text-white sm:text-xl">
            {titulo}
          </h2>
          <p className="text-xs text-stone-400">{rangoTxt}</p>
        </div>
        <div className="no-print flex flex-wrap gap-1.5">
          <button
            type="button"
            disabled={actualizando}
            onClick={onActualizar}
            className="h-10 rounded-xl border border-white/15 bg-stone-950 px-3 text-xs font-bold text-stone-200 disabled:opacity-60"
          >
            {actualizando ? "Actualizando…" : "↻ Actualizar"}
          </button>
          <button
            type="button"
            onClick={descargarCsv}
            className="h-10 rounded-xl border border-white/15 bg-stone-950 px-3 text-xs font-bold text-stone-200"
          >
            ⬇ Excel (CSV)
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="h-10 rounded-xl bg-amber-400 px-3 text-xs font-extrabold text-stone-950"
          >
            🖨 Imprimir
          </button>
        </div>
      </div>

      {/* Filtro por negocio */}
      <div className="no-print grid grid-cols-3 gap-1.5 rounded-2xl border border-white/[0.07] bg-stone-900/80 p-1.5">
        {(
          [
            ["todo", "Todo unido"],
            ["churrasqueria", "🔥 Churrasquería"],
            ["hamburgueseria", "🍔 Hamburguesería"],
          ] as const
        ).map(([id, texto]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setFiltro(id);
              setExpandida(null);
            }}
            className={`h-11 rounded-xl px-1 text-[11px] font-extrabold leading-tight transition sm:text-xs ${
              filtro === id
                ? "bg-amber-400 text-stone-950"
                : "text-stone-300 hover:bg-white/5"
            }`}
          >
            {texto}
          </button>
        ))}
      </div>

      {/* Cifras principales */}
      {filtro === "todo" ? (
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <Kpi
            etiqueta="Ventas"
            valor={bs(resumen.total)}
            nota={`${resumen.cantidad} ventas · promedio ${bs(resumen.ticket)}`}
            clase="text-emerald-300"
          />
          <Kpi
            etiqueta="Egresos"
            valor={bs(resumen.egresosTotal)}
            nota={`${datos.egresos.length} salidas`}
            clase="text-rose-300"
          />
          <Kpi
            etiqueta="Ventas − egresos"
            valor={bs(resumen.neto)}
            clase="text-white"
          />
          <Kpi
            etiqueta="Propinas"
            valor={bs(resumen.propinas)}
            nota="aparte de las ventas"
            clase="text-amber-300"
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <Kpi
            etiqueta={`Ventas ${NEG[filtro].nombre}`}
            valor={bs(resumen.total)}
            nota={`${resumen.cantidad} ventas`}
            clase={NEG[filtro].texto}
          />
          <Kpi
            etiqueta="Egresos propios"
            valor={bs(resumen.egresosTotal)}
            clase="text-rose-300"
          />
          <Kpi
            etiqueta="Ganancia"
            valor={bs(resumen.neto)}
            clase="text-white"
          />
          <Kpi
            etiqueta="Platos"
            valor={String(resumen.neg[filtro].platos)}
            nota={`+ ${resumen.compartido.unidades} bebidas (50%)`}
            clase="text-sky-300"
          />
        </div>
      )}

      {/* Efectivo esperado: lo que importa al cerrar caja */}
      {modo === "cierre" && filtro === "todo" && (
        <div className="rounded-3xl border border-emerald-400/30 bg-emerald-500/10 p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-300">
            Efectivo que debe haber en caja
          </p>
          <p className="mt-1 text-3xl font-black tabular-nums text-white">
            {bs(esperado)}
          </p>
          <p className="mt-1 text-xs text-emerald-100/80">
            {cierre ? `${bs(montoInicial)} de monto inicial + ` : ""}
            {bs(efectivo)} cobrado en efectivo − {bs(resumen.egresosTotal)} de
            egresos. Las propinas no están incluidas.
          </p>

          {difCierre !== null && cierre && (
            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-emerald-400/20 pt-3 text-xs">
              <div>
                <span className="block text-emerald-200/70">
                  Contado al cerrar
                </span>
                <b className="text-white">{bs(cierre.efectivoContado ?? 0)}</b>
              </div>
              <div>
                <span className="block text-emerald-200/70">
                  Esperado registrado
                </span>
                <b className="text-white">{bs(cierre.efectivoEsperado ?? 0)}</b>
              </div>
              <div>
                <span className="block text-emerald-200/70">Diferencia</span>
                <b
                  className={
                    Math.abs(difCierre) < 0.005
                      ? "text-emerald-300"
                      : difCierre < 0
                        ? "text-rose-300"
                        : "text-amber-300"
                  }
                >
                  {bs(difCierre)}
                </b>
              </div>
            </div>
          )}
          {cierre?.observaciones && (
            <p className="mt-2 text-xs text-emerald-100/80">
              📝 {cierre.observaciones}
            </p>
          )}
        </div>
      )}

      {/* Métodos de pago */}
      {resumen.porMetodo.length > 0 && (
        <div className="space-y-2.5 rounded-3xl border border-white/[0.07] bg-stone-900/75 p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-extrabold text-white">Cómo pagaron</h3>
            {cantidadMixtos > 0 && (
              <span className="rounded-full border border-amber-400/35 bg-amber-400/15 px-2.5 py-0.5 text-[11px] font-extrabold text-amber-200">
                🔀 {cantidadMixtos}{" "}
                {cantidadMixtos === 1 ? "pago mixto" : "pagos mixtos"}
              </span>
            )}
          </div>
          {resumen.porMetodo.map((m) => {
            const info = metodoInfo(m.metodo);
            const pct = resumen.total > 0 ? (m.monto / resumen.total) * 100 : 0;
            return (
              <div key={m.metodo} className="space-y-1">
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="font-bold text-stone-200">
                    {info.emoji} {info.nombre}{" "}
                    <span className="font-normal text-stone-500">
                      · {m.cantidad} {m.cantidad === 1 ? "venta" : "ventas"}
                    </span>
                  </span>
                  <span className="font-black tabular-nums text-white">
                    {bs(m.monto)}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className={`h-full rounded-full ${info.barra}`}
                    style={{ width: `${Math.max(2, pct)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Por negocio (solo en la vista unida) */}
      {filtro === "todo" && datos.ventas.length > 0 && (
        <div className="space-y-2.5">
          <h3 className="px-1 text-sm font-extrabold text-white">
            Cuánto ganó cada negocio
          </h3>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {(["churrasqueria", "hamburgueseria"] as const).map((n) => {
              const d = resumen.neg[n];
              const pct = sumaNeg > 0 ? (d.ventas / sumaNeg) * 100 : 0;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setFiltro(n)}
                  className={`rounded-3xl border p-4 text-left transition hover:brightness-110 ${NEG[n].borde} ${NEG[n].fondo}`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-sm font-extrabold ${NEG[n].texto}`}>
                      {NEG[n].emoji} {NEG[n].nombre}
                    </span>
                    <span className="text-[11px] font-bold text-stone-400">
                      {pct.toFixed(0)}% del total
                    </span>
                  </div>
                  <p className="mt-1 text-2xl font-black tabular-nums text-white">
                    {bs(d.ventas)}
                  </p>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-stone-300">
                    <span>
                      <span className="block text-stone-500">Platos</span>
                      <b className="text-white">{d.platos}</b>
                    </span>
                    <span>
                      <span className="block text-stone-500">Egresos</span>
                      <b className="text-rose-300">{bs(d.egresos)}</b>
                    </span>
                    <span>
                      <span className="block text-stone-500">Ganancia</span>
                      <b className="text-emerald-300">
                        {bs(d.ventas - d.egresos)}
                      </b>
                    </span>
                  </div>
                  <p className="no-print mt-2 text-[11px] text-stone-400">
                    Toca para ver solo este negocio ›
                  </p>
                </button>
              );
            })}
          </div>
          <p className="px-1 text-[11px] leading-relaxed text-stone-500">
            Bebidas y sodas ({bs(resumen.compartido.monto)}) se reparten 50/50.
            {resumen.egresosGenerales > 0 &&
              ` Egresos generales sin negocio: ${bs(resumen.egresosGenerales)} (no repartidos).`}
            {resumen.sinDetalle > 0.009 &&
              ` Cobros sin detalle de ítems: ${bs(resumen.sinDetalle)}.`}
          </p>
        </div>
      )}

      {/* Detalle de ventas */}
      <Seccion
        titulo="Detalle de cada venta"
        cuenta={ventasVista.length}
        abierto={abierto.detalle}
        onToggle={() => setAbierto((a) => ({ ...a, detalle: !a.detalle }))}
      >
        {ventasVista.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-white/10 py-8 text-center text-sm text-stone-400">
            No hay ventas en este rango.
          </p>
        ) : (
          <ul className="space-y-2">
            {ventasVista.map((v) => (
              <FilaVenta
                key={v.id}
                v={v}
                filtro={filtro}
                multiDia={multiDia}
                abierta={expandida === v.id}
                onToggle={() =>
                  setExpandida((cur) => (cur === v.id ? null : v.id))
                }
              />
            ))}
          </ul>
        )}
      </Seccion>

      {/* Productos */}
      <Seccion
        titulo="Productos vendidos"
        cuenta={resumen.productos.length}
        abierto={abierto.productos}
        onToggle={() => setAbierto((a) => ({ ...a, productos: !a.productos }))}
      >
        {resumen.productos.length === 0 ? (
          <p className="py-6 text-center text-sm text-stone-400">
            Sin productos.
          </p>
        ) : (
          <ul className="divide-y divide-white/[0.06]">
            {resumen.productos.map((p) => (
              <li
                key={p.clave}
                className="flex items-center justify-between gap-3 py-2.5 text-xs"
              >
                <span className="min-w-0 text-stone-200">
                  <span className="font-black text-white">{p.cantidad}×</span>{" "}
                  {p.nombre}{" "}
                  <span className="text-[11px]">
                    {p.clase === "compartido" ? "🥤" : NEG[p.clase].emoji}
                  </span>
                </span>
                <span className="shrink-0 font-bold tabular-nums text-white">
                  {bs(p.importe)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Seccion>

      {/* Egresos */}
      <Seccion
        titulo="Egresos"
        cuenta={egresosVista.length}
        abierto={abierto.egresos}
        onToggle={() => setAbierto((a) => ({ ...a, egresos: !a.egresos }))}
      >
        {egresosVista.length === 0 ? (
          <p className="py-6 text-center text-sm text-stone-400">
            Sin egresos.
          </p>
        ) : (
          <ul className="divide-y divide-white/[0.06]">
            {egresosVista.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between gap-3 py-2.5 text-xs"
              >
                <span className="min-w-0">
                  <span className="block truncate font-bold text-white">
                    {e.motivo}
                  </span>
                  <span className="text-[11px] text-stone-400">
                    {multiDia ? formatFechaHora(e.hora) : formatHora(e.hora)} ·{" "}
                    {e.negocio === "general"
                      ? "General"
                      : NEG[e.negocio].nombre}{" "}
                    · {e.registradoPor}
                  </span>
                </span>
                <span className="shrink-0 font-black tabular-nums text-rose-300">
                  {bs(e.monto)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Seccion>

      <p className="hidden text-[10px] print:block">
        Generado: {formatFechaHora(datos.generadoEn)}
      </p>
    </div>
  );
}
