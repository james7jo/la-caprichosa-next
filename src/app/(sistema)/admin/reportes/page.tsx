"use client";

import { useCallback, useEffect, useState } from "react";
import {
  SelectorRango,
  type SeleccionRango,
} from "@/components/reportes/selector-rango";
import { ReporteVentas } from "@/components/reportes/reporte-ventas";
import { ReportePersonal } from "@/components/reportes/reporte-personal";
import {
  cargarEstadoCaja,
  cargarReporte,
  type CierreCaja,
  type DatosReporte,
} from "@/lib/reportes/consultas";
import {
  bs,
  fechaBo,
  finDia,
  formatDiaLargo,
  formatHora,
  isoBo,
  rangoPreset,
  type Rango,
} from "@/lib/reportes/utilidades";

function useReporte() {
  const [datos, setDatos] = useState<DatosReporte | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async (rango: Rango) => {
    setCargando(true);
    setError(null);
    try {
      setDatos(await cargarReporte(rango));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo cargar el reporte.",
      );
    } finally {
      setCargando(false);
    }
  }, []);

  return { datos, cargando, error, cargar, limpiar: () => setDatos(null) };
}

const CSS_IMPRESION = `
@media print {
  nav, header, .no-print { display: none !important; }
  body, main { background: #fff !important; }
  .reporte-print, .reporte-print * {
    color: #111 !important;
    background: transparent !important;
    border-color: #bbb !important;
    box-shadow: none !important;
  }
}
`;

function Esqueleto() {
  return (
    <div className="space-y-3">
      <div className="h-24 animate-pulse rounded-3xl border border-white/10 bg-stone-900/60" />
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-2xl border border-white/10 bg-stone-900/60"
          />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-3xl border border-white/10 bg-stone-900/60" />
    </div>
  );
}

function AvisoError({ texto }: { texto: string }) {
  return (
    <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs font-bold text-rose-200">
      No se pudo cargar el reporte: {texto}
    </div>
  );
}

function ResumenCuadreCierre({
  datos,
  cierreBase,
}: {
  datos: DatosReporte;
  cierreBase: CierreCaja | null;
}) {
  const rec = datos as unknown as Record<string, unknown>;
  const rObj =
    rec && typeof rec.resumen === "object" && rec.resumen !== null
      ? (rec.resumen as Record<string, unknown>)
      : rec;

  const montoInicial = Number(cierreBase?.montoInicial ?? 0);
  const efectivo = Number(rObj.efectivo ?? rObj.totalEfectivo ?? 0);
  const qr = Number(rObj.qr ?? rObj.totalQr ?? 0);
  const egresos = Number(rObj.egresos ?? rObj.totalEgresos ?? 0);

  const totalVentas = Number((efectivo + qr).toFixed(2));
  const efectivoEnCaja = Number((montoInicial + efectivo - egresos).toFixed(2));
  const totalGeneral = Number(
    (montoInicial + efectivo + qr - egresos).toFixed(2),
  );

  return (
    <section className="rounded-3xl border border-white/[0.08] bg-stone-900/80 p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-extrabold text-white">
          Cuadre directo del turno / período
        </h2>
        {cierreBase && (
          <span className="text-[11px] text-stone-400">
            Apertura: {formatHora(cierreBase.abiertoEn)} ·{" "}
            {cierreBase.cerradoEn
              ? `Cierre: ${formatHora(cierreBase.cerradoEn)}`
              : "Aún abierta"}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-2xl border border-white/[0.06] bg-stone-950 p-3">
          <p className="text-[11px] text-stone-400">Monto inicial</p>
          <p className="mt-0.5 text-sm font-black tabular-nums text-stone-100">
            {bs(montoInicial)}
          </p>
        </div>
        <div className="rounded-2xl border border-emerald-400/20 bg-stone-950 p-3">
          <p className="text-[11px] text-emerald-300">Efectivo cobrado</p>
          <p className="mt-0.5 text-sm font-black tabular-nums text-emerald-300">
            {bs(efectivo)}
          </p>
        </div>
        <div className="rounded-2xl border border-sky-400/20 bg-stone-950 p-3">
          <p className="text-[11px] text-sky-300">QR cobrado</p>
          <p className="mt-0.5 text-sm font-black tabular-nums text-sky-300">
            {bs(qr)}
          </p>
        </div>
        <div className="rounded-2xl border border-rose-400/20 bg-stone-950 p-3">
          <p className="text-[11px] text-rose-300">Egresos</p>
          <p className="mt-0.5 text-sm font-black tabular-nums text-rose-300">
            − {bs(egresos)}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-stone-950 p-3">
          <p className="text-[11px] text-stone-400">Total ventas (Ef. + QR)</p>
          <p className="mt-0.5 text-sm font-black tabular-nums text-white">
            {bs(totalVentas)}
          </p>
        </div>
        <div className="rounded-2xl border border-amber-400/25 bg-stone-950 p-3">
          <p className="text-[11px] text-amber-300">Efectivo en caja / Total</p>
          <p className="mt-0.5 text-sm font-black tabular-nums text-amber-300">
            {bs(efectivoEnCaja)} · {bs(totalGeneral)}
          </p>
        </div>
      </div>
    </section>
  );
}

export default function AdminReportesPage() {
  const [tab, setTab] = useState<"cierre" | "reportes">("cierre");

  /* ---------------------------- Cierre de caja ---------------------------- */
  const cierre = useReporte();
  const [cierreBase, setCierreBase] = useState<CierreCaja | null>(null);
  const [desdeHora, setDesdeHora] = useState("00:00");
  const [caja, setCaja] = useState<{
    abierta: CierreCaja | null;
    recientes: CierreCaja[];
    cargando: boolean;
    error: string | null;
  }>({ abierta: null, recientes: [], cargando: true, error: null });

  const cargarCaja = useCallback(async () => {
    setCaja((c) => ({ ...c, cargando: true, error: null }));
    try {
      const r = await cargarEstadoCaja();
      setCaja({
        abierta: r.abierta,
        recientes: r.recientes,
        cargando: false,
        error: null,
      });
    } catch (e) {
      setCaja((c) => ({
        ...c,
        cargando: false,
        error:
          e instanceof Error
            ? e.message
            : "No se pudo leer el estado de la caja.",
      }));
    }
  }, []);

  useEffect(() => {
    void cargarCaja();
  }, [cargarCaja]);

  // Reporte de un turno de caja: desde que se abrió hasta que se cerró (o ahora)
  function verCierre(c: CierreCaja) {
    const desde = isoBo(new Date(c.abiertoEn));
    const hasta = c.cerradoEn
      ? isoBo(new Date(c.cerradoEn))
      : isoBo(new Date());
    setCierreBase(c);
    void cierre.cargar({ desde, hasta });
  }

  // Sin caja abierta: ventas de hoy desde la hora elegida
  function verHoy() {
    const hoy = fechaBo(new Date());
    setCierreBase(null);
    void cierre.cargar({
      desde: `${hoy}T${desdeHora || "00:00"}:00-04:00`,
      hasta: finDia(hoy),
    });
  }

  function volverCierre() {
    cierre.limpiar();
    setCierreBase(null);
    void cargarCaja();
  }

  /* ------------------------------ Reportes ------------------------------ */
  const reporte = useReporte();
  const [seleccion, setSeleccion] = useState<SeleccionRango | null>(null);
  const [vista, setVista] = useState<"ventas" | "personal">("ventas");
  const cargarReporteRef = reporte.cargar;

  useEffect(() => {
    if (!seleccion) {
      const inicial: SeleccionRango = {
        preset: "hoy",
        rango: rangoPreset("hoy", new Date()),
        etiqueta: "Hoy",
      };
      setSeleccion(inicial);
      if (tab === "reportes") {
        void cargarReporteRef(inicial.rango);
      }
    }
  }, [seleccion, tab, cargarReporteRef]);

  const aplicar = useCallback(
    (s: SeleccionRango) => {
      setSeleccion(s);
      void cargarReporteRef(s.rango);
    },
    [cargarReporteRef],
  );

  // Primera vez que se abre la pestaña: carga "Hoy"
  useEffect(() => {
    if (
      tab === "reportes" &&
      seleccion &&
      !reporte.datos &&
      !reporte.cargando &&
      !reporte.error
    ) {
      void cargarReporteRef(seleccion.rango);
    }
  }, [
    tab,
    seleccion,
    reporte.datos,
    reporte.cargando,
    reporte.error,
    cargarReporteRef,
  ]);

  function actualizarReporte() {
    if (!seleccion) return;
    const rango =
      seleccion.preset === "personalizado"
        ? seleccion.rango
        : rangoPreset(seleccion.preset, new Date());
    const actualizada: SeleccionRango = {
      ...seleccion,
      rango,
    };
    setSeleccion(actualizada);
    void cargarReporteRef(rango);
  }

  return (
    <main className="mx-auto w-full max-w-5xl space-y-3 px-2 py-3 sm:space-y-4 sm:px-6 sm:py-6">
      <style>{CSS_IMPRESION}</style>

      <div className="no-print grid grid-cols-2 gap-1.5 rounded-2xl border border-white/[0.07] bg-stone-900/80 p-1.5">
        {(
          [
            ["cierre", "🔒 Cierre de caja"],
            ["reportes", "📊 Reportes"],
          ] as const
        ).map(([id, texto]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`h-12 rounded-xl text-sm font-extrabold transition ${
              tab === id
                ? "bg-amber-400 text-stone-950"
                : "text-stone-300 hover:bg-white/5"
            }`}
          >
            {texto}
          </button>
        ))}
      </div>

      {/* ============================ CIERRE ============================ */}
      {tab === "cierre" && (
        <>
          {!cierre.datos && !cierre.cargando && (
            <>
              {caja.error && <AvisoError texto={caja.error} />}

              <section className="space-y-4 rounded-3xl border border-white/[0.07] bg-stone-900/75 p-5 text-center sm:p-8">
                {caja.cargando ? (
                  <div className="h-40 animate-pulse rounded-2xl bg-stone-800/60" />
                ) : caja.abierta ? (
                  <>
                    <div className="text-4xl">🟢</div>
                    <div>
                      <h1 className="text-xl font-extrabold text-white sm:text-2xl">
                        Caja abierta
                      </h1>
                      <p className="mx-auto mt-1 max-w-md text-sm text-stone-400">
                        La abrió {caja.abierta.abiertoPor} a las{" "}
                        {formatHora(caja.abierta.abiertoEn)} ·{" "}
                        {formatDiaLargo(caja.abierta.abiertoEn)} · monto inicial{" "}
                        {bs(caja.abierta.montoInicial)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => caja.abierta && verCierre(caja.abierta)}
                      className="h-14 w-full max-w-sm rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 text-base font-black text-stone-950 shadow-lg active:scale-[0.99]"
                    >
                      Ver detalle de caja abierta
                    </button>
                    <p className="text-xs text-stone-500">
                      Verás todo lo cobrado desde que se abrió la caja, con el
                      detalle de cada venta.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="text-4xl">🔒</div>
                    <div>
                      <h1 className="text-xl font-extrabold text-white sm:text-2xl">
                        No hay una caja abierta
                      </h1>
                      <p className="mx-auto mt-1 max-w-md text-sm text-stone-400">
                        Puedes ver las ventas de hoy o revisar uno de los
                        cierres anteriores de abajo.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={verHoy}
                      className="h-14 w-full max-w-sm rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 text-base font-black text-stone-950 shadow-lg active:scale-[0.99]"
                    >
                      Ver ventas de hoy
                    </button>
                    <label className="mx-auto flex max-w-sm items-center justify-center gap-2 text-xs text-stone-400">
                      <span>Contar desde las</span>
                      <input
                        type="time"
                        value={desdeHora}
                        onChange={(e) => setDesdeHora(e.target.value)}
                        className="h-10 rounded-xl border border-white/10 bg-stone-950 px-2 text-base text-white [color-scheme:dark]"
                      />
                    </label>
                  </>
                )}
              </section>

              {caja.recientes.some((c) => c.cerradoEn) && (
                <section className="space-y-2 rounded-3xl border border-white/[0.07] bg-stone-900/75 p-3.5">
                  <h2 className="px-1 text-sm font-extrabold text-white">
                    Cierres anteriores
                  </h2>
                  <ul className="space-y-1.5">
                    {caja.recientes
                      .filter((c) => c.cerradoEn)
                      .map((c) => {
                        const dif = c.diferencia;
                        return (
                          <li key={c.id}>
                            <button
                              type="button"
                              onClick={() => verCierre(c)}
                              className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/[0.07] bg-stone-950 px-3 py-3 text-left hover:bg-white/[0.04]"
                            >
                              <span className="min-w-0">
                                <span className="block text-sm font-extrabold capitalize text-white">
                                  {formatDiaLargo(c.abiertoEn)}
                                </span>
                                <span className="block truncate text-[11px] text-stone-400">
                                  {formatHora(c.abiertoEn)} →{" "}
                                  {formatHora(c.cerradoEn)} · {c.abiertoPor}
                                </span>
                              </span>
                              <span className="shrink-0 text-right">
                                <span className="block text-sm font-black tabular-nums text-emerald-300">
                                  {bs(c.totalVentas)}
                                </span>
                                {dif !== null && (
                                  <span
                                    className={`block text-[10px] font-bold ${
                                      Math.abs(dif) < 0.005
                                        ? "text-emerald-300"
                                        : dif < 0
                                          ? "text-rose-300"
                                          : "text-amber-300"
                                    }`}
                                  >
                                    {Math.abs(dif) < 0.005
                                      ? "Cuadrada ✅"
                                      : `Dif. ${bs(dif)}`}
                                  </span>
                                )}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                  </ul>
                </section>
              )}
            </>
          )}

          {cierre.error && <AvisoError texto={cierre.error} />}
          {cierre.cargando && !cierre.datos && <Esqueleto />}

          {cierre.datos && (
            <>
              <ResumenCuadreCierre
                datos={cierre.datos}
                cierreBase={cierreBase}
              />
              <ReporteVentas
                datos={cierre.datos}
                modo="cierre"
                cierre={cierreBase}
                actualizando={cierre.cargando}
                onActualizar={() =>
                  cierreBase ? verCierre(cierreBase) : verHoy()
                }
              />
              <button
                type="button"
                onClick={volverCierre}
                className="no-print h-11 w-full rounded-xl border border-white/10 bg-stone-950 text-xs font-bold text-stone-300"
              >
                ← Volver
              </button>
            </>
          )}
        </>
      )}

      {/* =========================== REPORTES =========================== */}
      {tab === "reportes" && (
        <>
          <SelectorRango value={seleccion ?? undefined} onChange={aplicar} />

          <div className="no-print grid grid-cols-2 gap-1.5 rounded-2xl border border-white/[0.07] bg-stone-900/80 p-1.5">
            {(
              [
                ["ventas", "💰 Ventas y ganancias"],
                ["personal", "👥 Personal"],
              ] as const
            ).map(([id, texto]) => (
              <button
                key={id}
                type="button"
                onClick={() => setVista(id)}
                className={`h-11 rounded-xl text-xs font-extrabold transition sm:text-sm ${
                  vista === id
                    ? "bg-white text-stone-950"
                    : "text-stone-300 hover:bg-white/5"
                }`}
              >
                {texto}
              </button>
            ))}
          </div>

          {reporte.error && <AvisoError texto={reporte.error} />}
          {reporte.cargando && !reporte.datos && <Esqueleto />}

          {reporte.datos &&
            (vista === "ventas" ? (
              <ReporteVentas
                datos={reporte.datos}
                modo="rango"
                actualizando={reporte.cargando}
                onActualizar={actualizarReporte}
              />
            ) : (
              <ReportePersonal datos={reporte.datos} />
            ))}
        </>
      )}
    </main>
  );
}
