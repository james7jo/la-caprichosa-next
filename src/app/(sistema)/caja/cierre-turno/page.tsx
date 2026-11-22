"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fechaBo } from "@/lib/reportes/utilidades";
import { cerrarOperacionMesero } from "@/actions/operaciones.actions";

type CobroResumen = {
  id: string;
  metodo: string;
  monto: number;
  propina: number;
  created_at: string;
};

type EgresoResumen = {
  id: string;
  motivo: string;
  monto: number;
  created_at: string;
};

type MesaEstadoResumen = {
  id: string;
  estado: string;
  habilitada: boolean;
};

type CajaGeneralActiva = {
  id: string;
  monto_inicial: number;
  abierto_en: string;
  estado: string;
};

const tarjetaClase =
  "rounded-3xl border border-white/[0.07] bg-gradient-to-b from-stone-900 to-stone-900/60 p-5 sm:p-6 shadow-lg shadow-black/20";

export default function CajaCierreTurnoPage() {
  const router = useRouter();
  const [cobros, setCobros] = useState<CobroResumen[]>([]);
  const [egresos, setEgresos] = useState<EgresoResumen[]>([]);
  const [mesas, setMesas] = useState<MesaEstadoResumen[]>([]);
  const [cajaActiva, setCajaActiva] = useState<CajaGeneralActiva | null>(null);

  const [motivoSalida, setMotivoSalida] = useState("");
  const [observacionesCierre, setObservacionesCierre] = useState("");
  const [cargando, setCargando] = useState(true);

  const [aviso, setAviso] = useState<{
    tipo: "ok" | "error" | "alerta";
    texto: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 4000);
    return () => clearTimeout(t);
  }, [aviso]);

  const cargarDatosCierre = useCallback(async () => {
    const supabase = createClient();
    const hoyBo = fechaBo(new Date());

    const [
      { data: cobData },
      { data: egrData },
      { data: mesData },
      { data: cajaData },
    ] = await Promise.all([
      supabase
        .from("cobros")
        .select("id, metodo, monto, propina, created_at")
        .gte("created_at", `${hoyBo}T00:00:00-04:00`)
        .lte("created_at", `${hoyBo}T23:59:59-04:00`),
      supabase
        .from("egresos_caja")
        .select("id, motivo, monto, created_at")
        .gte("created_at", `${hoyBo}T00:00:00-04:00`)
        .lte("created_at", `${hoyBo}T23:59:59-04:00`),
      supabase.from("mesas").select("id, estado, habilitada"),
      supabase
        .from("cierres_caja")
        .select("id, monto_inicial, abierto_en, estado")
        .is("cerrado_en", null)
        .order("abierto_en", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    setCobros(
      ((cobData as CobroResumen[] | null) ?? []).map((c) => ({
        ...c,
        monto: Number(c.monto || 0),
        propina: Number(c.propina || 0),
      })),
    );
    setEgresos(
      ((egrData as EgresoResumen[] | null) ?? []).map((e) => ({
        ...e,
        monto: Number(e.monto || 0),
      })),
    );
    setMesas((mesData as MesaEstadoResumen[] | null) ?? []);
    setCajaActiva(
      cajaData
        ? {
            id: String(cajaData.id),
            monto_inicial: Number(cajaData.monto_inicial || 0),
            abierto_en: String(cajaData.abierto_en || ""),
            estado: String(cajaData.estado || "abierto"),
          }
        : null,
    );
    setCargando(false);
  }, []);

  useEffect(() => {
    void cargarDatosCierre();
  }, [cargarDatosCierre]);

  const totalEfectivo = cobros
    .filter((c) => String(c.metodo || "").toLowerCase() === "efectivo")
    .reduce((s, c) => s + Number(c.monto || 0), 0);

  const totalQr = cobros
    .filter((c) => String(c.metodo || "").toLowerCase() === "qr")
    .reduce((s, c) => s + Number(c.monto || 0), 0);

  const totalPropinas = cobros.reduce((s, c) => s + Number(c.propina || 0), 0);
  const totalEgresos = egresos.reduce((s, e) => s + Number(e.monto || 0), 0);
  const montoInicial = Number(cajaActiva?.monto_inicial || 0);

  // Solo ventas del día (efectivo + QR), sin incluir el monto inicial de apertura
  const totalVentas = Number((totalEfectivo + totalQr).toFixed(2));
  // Efectivo físico esperado en caja: fondo inicial + ventas en efectivo - egresos
  const efectivoEnCaja = Number(
    (montoInicial + totalEfectivo - totalEgresos).toFixed(2),
  );
  // Total acumulado del día en caja y cobros: inicial + efectivo + QR - egresos
  const totalGeneral = Number(
    (montoInicial + totalEfectivo + totalQr - totalEgresos).toFixed(2),
  );

  const mesasOcupadas = mesas.filter(
    (m) => m.habilitada && m.estado === "ocupada",
  ).length;
  const mesasSucias = mesas.filter(
    (m) => m.habilitada && m.estado === "sucia",
  ).length;
  const todasMesasDisponibles = mesasOcupadas === 0 && mesasSucias === 0;

  function handleRegistrarSalidaTurno(e: React.FormEvent) {
    e.preventDefault();
    setAviso(null);

    startTransition(async () => {
      const detalle = [
        motivoSalida.trim() || "Salida / permiso de turno",
        `Inicial Bs ${montoInicial.toFixed(2)} · Ef. Bs ${totalEfectivo.toFixed(2)} · QR Bs ${totalQr.toFixed(2)} · Egresos Bs ${totalEgresos.toFixed(2)} · Efectivo en caja Bs ${efectivoEnCaja.toFixed(2)} · Total general Bs ${totalGeneral.toFixed(2)}`,
      ].join(" | ");

      const res = await cerrarOperacionMesero(detalle);
      if (res?.error) {
        setAviso({ tipo: "error", texto: res.error });
        return;
      }

      setMotivoSalida("");
      setAviso({
        tipo: res.cierreAnticipado ? "alerta" : "ok",
        texto: res.cierreAnticipado
          ? `Salida anticipada registrada (${res.horaBolivia} BO).`
          : `Salida de turno registrada (${res.horaBolivia} BO).`,
      });
      await cargarDatosCierre();
      router.refresh();
    });
  }

  function handleCerrarCajaLocal(e: React.FormEvent) {
    e.preventDefault();
    setAviso(null);

    if (!cajaActiva) {
      setAviso({
        tipo: "error",
        texto: "No hay una caja abierta en el sistema para cerrar.",
      });
      return;
    }

    if (!todasMesasDisponibles) {
      setAviso({
        tipo: "error",
        texto: `No se puede cerrar caja/local: hay ${mesasOcupadas} mesa(s) ocupada(s) y ${mesasSucias} mesa(s) sucia(s). Todas deben estar disponibles.`,
      });
      return;
    }

    startTransition(async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const userId = session?.user?.id ?? null;

      const { error } = await supabase
        .from("cierres_caja")
        .update({
          estado: "cerrado",
          cerrado_en: new Date().toISOString(),
          cerrado_por: userId,
          total_ventas: totalVentas,
          total_egresos: totalEgresos,
          efectivo_esperado: efectivoEnCaja,
          efectivo_contado: efectivoEnCaja,
          diferencia: 0,
          observaciones: observacionesCierre.trim() || null,
        })
        .eq("id", cajaActiva.id);

      if (error) {
        setAviso({ tipo: "error", texto: error.message });
        return;
      }

      setObservacionesCierre("");
      setAviso({
        tipo: "ok",
        texto: `Caja cerrada. Efectivo en caja: Bs ${efectivoEnCaja.toFixed(2)} · Ventas QR: Bs ${totalQr.toFixed(2)} · Total general: Bs ${totalGeneral.toFixed(2)}.`,
      });
      await cargarDatosCierre();
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight text-white">
          Cierre de turno y cierre de caja
        </h2>
        <p className="mt-1 text-xs text-stone-400 sm:text-sm">
          Totales calculados automáticamente por el sistema en hora de Bolivia.
        </p>
      </div>

      {aviso && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm font-bold ${
            aviso.tipo === "error"
              ? "border-rose-400/35 bg-rose-500/15 text-rose-200"
              : aviso.tipo === "alerta"
                ? "border-amber-400/35 bg-amber-400/15 text-amber-200"
                : "border-emerald-400/35 bg-emerald-500/15 text-emerald-200"
          }`}
        >
          {aviso.texto}
        </div>
      )}

      {cargando ? (
        <div className="h-64 animate-pulse rounded-3xl bg-stone-900/70" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <div className={`${tarjetaClase} border-stone-500/30`}>
              <p className="text-xs font-extrabold text-stone-300">
                Monto inicial
              </p>
              <p className="mt-1 text-xl font-black tabular-nums text-white">
                Bs {montoInicial.toFixed(2)}
              </p>
            </div>
            <div className={`${tarjetaClase} border-emerald-400/30`}>
              <p className="text-xs font-extrabold text-emerald-300">
                Ventas en efectivo
              </p>
              <p className="mt-1 text-xl font-black tabular-nums text-white">
                Bs {totalEfectivo.toFixed(2)}
              </p>
            </div>
            <div className={`${tarjetaClase} border-sky-400/30`}>
              <p className="text-xs font-extrabold text-sky-300">
                Ventas por QR
              </p>
              <p className="mt-1 text-xl font-black tabular-nums text-white">
                Bs {totalQr.toFixed(2)}
              </p>
            </div>
            <div className={`${tarjetaClase} border-amber-400/30`}>
              <p className="text-xs font-extrabold text-amber-300">Propinas</p>
              <p className="mt-1 text-xl font-black tabular-nums text-white">
                Bs {totalPropinas.toFixed(2)}
              </p>
            </div>
            <div className={`${tarjetaClase} border-rose-400/30`}>
              <p className="text-xs font-extrabold text-rose-300">Egresos</p>
              <p className="mt-1 text-xl font-black tabular-nums text-white">
                Bs {totalEgresos.toFixed(2)}
              </p>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-12">
            {/* Salida de turno (permiso o urgencia) */}
            <section className={`${tarjetaClase} space-y-4 lg:col-span-6`}>
              <h3 className="text-base font-extrabold text-white">
                Salida de turno (permiso o urgencia)
              </h3>
              <p className="text-xs text-stone-400">
                Registra hora de salida y motivo para control del administrador.
              </p>

              <form onSubmit={handleRegistrarSalidaTurno} className="space-y-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-stone-300">
                    Motivo de salida
                  </label>
                  <input
                    type="text"
                    required
                    value={motivoSalida}
                    onChange={(e) => setMotivoSalida(e.target.value)}
                    placeholder="Ej. urgencia familiar / permiso"
                    className="w-full rounded-xl border border-white/10 bg-stone-950 px-3.5 py-2.5 text-sm text-white"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isPending}
                  className="w-full rounded-2xl border border-amber-400/40 bg-amber-400/15 py-3.5 text-sm font-black text-amber-200 transition hover:bg-amber-400/25 disabled:opacity-50"
                >
                  {isPending ? "Registrando..." : "Registrar salida de turno"}
                </button>
              </form>

              <div className="border-t border-white/[0.07] pt-4">
                <h4 className="mb-2 text-xs font-extrabold uppercase tracking-wider text-stone-400">
                  Egresos de hoy
                </h4>
                {egresos.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/10 p-4 text-center text-xs text-stone-400">
                    Sin egresos hoy.
                  </div>
                ) : (
                  <ul className="divide-y divide-white/[0.06] text-xs">
                    {egresos.map((eg) => (
                      <li
                        key={eg.id}
                        className="flex items-center justify-between py-2.5"
                      >
                        <span className="font-bold text-white">
                          {eg.motivo}
                        </span>
                        <span className="font-black tabular-nums text-rose-300">
                          Bs {eg.monto.toFixed(2)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            {/* Cierre de caja / local con montos desglosados y total general */}
            <section className={`${tarjetaClase} space-y-4 lg:col-span-6`}>
              <h3 className="text-base font-extrabold text-white">
                Cierre de caja / local
              </h3>

              <div className="space-y-2.5 rounded-2xl border border-white/[0.07] bg-stone-950/90 p-4 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-stone-400">Monto inicial</span>
                  <span className="font-bold tabular-nums text-stone-200">
                    Bs {montoInicial.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-stone-400">Ventas en efectivo</span>
                  <span className="font-bold tabular-nums text-emerald-300">
                    Bs {totalEfectivo.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-stone-400">Ventas por QR</span>
                  <span className="font-bold tabular-nums text-sky-300">
                    Bs {totalQr.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-stone-400">Egresos</span>
                  <span className="font-bold tabular-nums text-rose-300">
                    − Bs {totalEgresos.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-white/[0.06] pt-2">
                  <span className="text-stone-400">
                    Total ventas (Efectivo + QR)
                  </span>
                  <span className="text-sm font-black tabular-nums text-white">
                    Bs {totalVentas.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-stone-400">
                    Efectivo en caja (Inicial + Efectivo − Egresos)
                  </span>
                  <span className="text-base font-black tabular-nums text-emerald-300">
                    Bs {efectivoEnCaja.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-white/[0.06] pt-2">
                  <span className="text-stone-400">
                    Total general (Inicial + Efectivo + QR − Egresos)
                  </span>
                  <span className="text-base font-black tabular-nums text-amber-300">
                    Bs {totalGeneral.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-white/[0.06] pt-2">
                  <span className="text-stone-400">Mesas ocupadas</span>
                  <span className="font-extrabold text-amber-300">
                    {mesasOcupadas}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-stone-400">Mesas sucias</span>
                  <span className="font-extrabold text-rose-300">
                    {mesasSucias}
                  </span>
                </div>
              </div>

              {!todasMesasDisponibles ? (
                <div className="rounded-2xl border border-rose-400/35 bg-rose-500/10 px-4 py-3 text-xs font-bold text-rose-200">
                  No se puede cerrar: hay {mesasOcupadas} mesa(s) ocupada(s) y{" "}
                  {mesasSucias} mesa(s) sucia(s). Todas las mesas deben estar
                  disponibles.
                </div>
              ) : (
                <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-xs font-bold text-emerald-200">
                  Todas las mesas están disponibles.
                </div>
              )}

              <form onSubmit={handleCerrarCajaLocal} className="space-y-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-stone-300">
                    Observación del cierre (opcional)
                  </label>
                  <input
                    type="text"
                    disabled={!todasMesasDisponibles || !cajaActiva}
                    value={observacionesCierre}
                    onChange={(e) => setObservacionesCierre(e.target.value)}
                    placeholder="Ej. cierre de jornada sin novedades"
                    className="w-full rounded-xl border border-white/10 bg-stone-950 px-3.5 py-2.5 text-sm text-white disabled:opacity-50"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isPending || !todasMesasDisponibles || !cajaActiva}
                  className="w-full rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 py-3.5 text-sm font-black text-stone-950 shadow-lg shadow-orange-600/25 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {isPending
                    ? "Cerrando caja..."
                    : "Cerrar caja y local por completo"}
                </button>
              </form>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
