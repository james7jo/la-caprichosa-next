"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { bs, clasificarItem, fechaBo } from "@/lib/reportes/utilidades";

type DiaSemana = {
  dia: string;
  nivel: number;
  totalBs: number;
};

type CategoriaKpi = {
  nombre: string;
  emoji: string;
  porcentaje: number;
  montoBs: number;
  hex: string;
};

type EstadoActualKpi = {
  titulo: string;
  emoji: string;
  valor: number;
  estado: string;
  hex: string;
};

type InsumoKpi = {
  id: string;
  nombre: string;
  emoji: string;
  nivel: number;
  estado: string;
  hex: string;
  bajo: boolean;
};

type CajaActivaInfo = {
  id: string;
  montoInicial: number;
  abiertoEn: string;
  abiertoPor: string;
};

const COOLDOWN_MS = 3 * 60 * 1000;

const estilos = `
@keyframes aparece { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes llena { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes sube { from { transform: scaleY(0); } to { transform: scaleY(1); } }
.aparece { opacity: 0; animation: aparece .5s ease-out forwards; }
.llena { transform-origin: left; animation: llena .8s ease-out both; }
.sube { transform-origin: bottom; animation: sube .8s ease-out both; }
@media (prefers-reduced-motion: reduce) {
  .aparece, .llena, .sube { animation: none !important; opacity: 1 !important; }
}
`;

const tarjeta =
  "rounded-3xl border border-white/[0.07] bg-gradient-to-b from-stone-900 to-stone-900/60 p-5 sm:p-6 shadow-lg shadow-black/20";

function Anillo({
  valor,
  hex,
  emoji,
}: {
  valor: number;
  hex: string;
  emoji: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(valor)));
  return (
    <div
      className="relative grid h-16 w-16 shrink-0 place-items-center rounded-full"
      style={{ background: `conic-gradient(${hex} ${clamped}%, #292524 0)` }}
    >
      <div className="grid h-[52px] w-[52px] place-items-center rounded-full bg-stone-900 text-xl">
        {emoji}
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [cargando, setCargando] = useState(true);
  const [cajaAbierta, setCajaAbierta] = useState<CajaActivaInfo | null>(null);
  const [montoInicialInput, setMontoInicialInput] = useState("");
  const [efectivoCierreInput, setEfectivoCierreInput] = useState("");
  const [mostrandoCierreModal, setMostrandoCierreModal] = useState(false);
  const [procesandoCaja, setProcesandoCaja] = useState(false);
  const [bloqueadoHastaMs, setBloqueadoHastaMs] = useState<number>(0);
  const [ahoraMs, setAhoraMs] = useState<number>(0);

  const [avisoCaja, setAvisoCaja] = useState<{
    tipo: "ok" | "error";
    texto: string;
  } | null>(null);

  const [ahoraKpis, setAhoraKpis] = useState<EstadoActualKpi[]>([
    {
      titulo: "Mesas",
      emoji: "🪑",
      valor: 0,
      estado: "Cargando",
      hex: "#fbbf24",
    },
    {
      titulo: "Cocina",
      emoji: "👨‍🍳",
      valor: 0,
      estado: "Cargando",
      hex: "#34d399",
    },
    {
      titulo: "Entregas",
      emoji: "✅",
      valor: 0,
      estado: "Cargando",
      hex: "#34d399",
    },
  ]);

  const [semana, setSemana] = useState<DiaSemana[]>([
    { dia: "Lun", nivel: 0, totalBs: 0 },
    { dia: "Mar", nivel: 0, totalBs: 0 },
    { dia: "Mié", nivel: 0, totalBs: 0 },
    { dia: "Jue", nivel: 0, totalBs: 0 },
    { dia: "Vie", nivel: 0, totalBs: 0 },
    { dia: "Sáb", nivel: 0, totalBs: 0 },
    { dia: "Dom", nivel: 0, totalBs: 0 },
  ]);

  const [categorias, setCategorias] = useState<CategoriaKpi[]>([
    {
      nombre: "Churrasquería",
      emoji: "🔥",
      porcentaje: 0,
      montoBs: 0,
      hex: "#fbbf24",
    },
    {
      nombre: "Hamburguesería",
      emoji: "🍔",
      porcentaje: 0,
      montoBs: 0,
      hex: "#f97316",
    },
    {
      nombre: "Bebidas / Sodas (50/50)",
      emoji: "🥤",
      porcentaje: 0,
      montoBs: 0,
      hex: "#34d399",
    },
  ]);

  const [insumos, setInsumos] = useState<InsumoKpi[]>([]);

  useEffect(() => {
    const id = setInterval(() => {
      setAhoraMs(Date.now());
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const segundosRestantesBloqueo = useMemo(() => {
    if (!bloqueadoHastaMs || !ahoraMs) return 0;
    return Math.max(0, Math.ceil((bloqueadoHastaMs - ahoraMs) / 1000));
  }, [bloqueadoHastaMs, ahoraMs]);

  const cargarDashboardReal = useCallback(async () => {
    const supabase = createClient();
    const ahoraDate = new Date();
    setAhoraMs(ahoraDate.getTime());
    const hoyStr = fechaBo(ahoraDate);

    // 1. Estado de caja abierta
    try {
      const { data: cajaData } = await supabase
        .from("cierres_caja")
        .select("id, monto_inicial, abierto_en, cerrado_en, abierto_por")
        .is("cerrado_en", null)
        .order("abierto_en", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cajaData) {
        setCajaAbierta({
          id: String(cajaData.id),
          montoInicial: Number(cajaData.monto_inicial || 0),
          abiertoEn: String(cajaData.abierto_en || ""),
          abiertoPor: String(cajaData.abierto_por || "Admin"),
        });
      } else {
        setCajaAbierta(null);
      }
    } catch {
      setCajaAbierta(null);
    }

    // 2. Mesas y pedidos actuales
    const [{ data: mesasData }, { data: pedidosHoyData }] = await Promise.all([
      supabase.from("mesas").select("id, estado, habilitada"),
      supabase
        .from("pedidos")
        .select("id, estado, created_at")
        .gte("created_at", `${hoyStr}T00:00:00-04:00`),
    ]);

    const habilitadas = (mesasData ?? []).filter((m) => m.habilitada !== false);
    const totalMesas = habilitadas.length || 1;
    const ocupadas = habilitadas.filter((m) => m.estado === "ocupada").length;
    const pctMesas = Math.round((ocupadas / totalMesas) * 100);

    const pedidosHoy = pedidosHoyData ?? [];
    const totalPedidosHoy = pedidosHoy.length || 1;
    const enCocina = pedidosHoy.filter(
      (p) =>
        p.estado === "abierto" ||
        p.estado === "en_cocina" ||
        p.estado === "por_cobrar",
    ).length;
    const entregados = pedidosHoy.filter(
      (p) =>
        p.estado === "pagado" ||
        p.estado === "entregado" ||
        p.estado === "cerrado",
    ).length;

    const pctCocina = Math.min(
      100,
      Math.round((enCocina / totalPedidosHoy) * 100),
    );
    const pctEntregas = Math.min(
      100,
      Math.round((entregados / totalPedidosHoy) * 100),
    );

    setAhoraKpis([
      {
        titulo: "Mesas",
        emoji: "🪑",
        valor: pctMesas,
        estado: ocupadas > 0 ? `${ocupadas} ocupadas` : "Sin mesas ocupadas",
        hex: pctMesas >= 70 ? "#fbbf24" : "#34d399",
      },
      {
        titulo: "Cocina",
        emoji: "👨‍🍳",
        valor: pctCocina,
        estado: enCocina > 0 ? `${enCocina} en curso` : "Fluida",
        hex: enCocina > 4 ? "#f97316" : "#34d399",
      },
      {
        titulo: "Entregas",
        emoji: "✅",
        valor: pctEntregas,
        estado: `${entregados} completados hoy`,
        hex: "#34d399",
      },
    ]);

    // 3. Cobros de los últimos 7 días
    const hace7Dias = new Date(ahoraDate.getTime() - 6 * 86400000);
    const desdeSemana = `${fechaBo(hace7Dias)}T00:00:00-04:00`;

    const { data: cobrosSemana } = await supabase
      .from("cobros")
      .select("id, pedido_id, monto, created_at")
      .gte("created_at", desdeSemana);

    const diasNombres = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    const totalesPorDia: Record<string, number> = {};
    (cobrosSemana ?? []).forEach((c) => {
      const fBo = fechaBo(new Date(String(c.created_at)));
      totalesPorDia[fBo] = (totalesPorDia[fBo] || 0) + Number(c.monto || 0);
    });

    const diasConstruidos: DiaSemana[] = [];
    for (let i = 6; i >= 0; i--) {
      const dt = new Date(ahoraDate.getTime() - i * 86400000);
      const fechaClave = fechaBo(dt);
      const etiquetaDia = diasNombres[dt.getUTCDay()] || fechaClave.slice(5);
      diasConstruidos.push({
        dia: etiquetaDia,
        nivel: 0,
        totalBs: totalesPorDia[fechaClave] || 0,
      });
    }

    const maxDia = Math.max(...diasConstruidos.map((d) => d.totalBs), 0);
    setSemana(
      diasConstruidos.map((d) => ({
        ...d,
        nivel:
          maxDia > 0 ? Math.max(6, Math.round((d.totalBs / maxDia) * 100)) : 0,
      })),
    );

    // 4. Categorías reales desde detalle_pedidos de hoy
    const idsPedidosHoy = pedidosHoy.map((p) => String(p.id));
    let montoChurrasco = 0;
    let montoHamburguesa = 0;
    let montoCompartido = 0;

    if (idsPedidosHoy.length > 0) {
      const { data: detHoy } = await supabase
        .from("detalle_pedidos")
        .select("pedido_id, nombre_item, linea_negocio, subtotal")
        .in("pedido_id", idsPedidosHoy);

      (detHoy ?? []).forEach((d) => {
        const clase = clasificarItem(
          d.linea_negocio ? String(d.linea_negocio) : null,
          String(d.nombre_item || ""),
        );
        const sub = Number(d.subtotal || 0);
        if (clase === "churrasqueria") montoChurrasco += sub;
        else if (clase === "hamburgueseria") montoHamburguesa += sub;
        else montoCompartido += sub;
      });
    }

    const sumaCat = montoChurrasco + montoHamburguesa + montoCompartido;
    const pctCh =
      sumaCat > 0 ? Math.round((montoChurrasco / sumaCat) * 100) : 0;
    const pctHa =
      sumaCat > 0 ? Math.round((montoHamburguesa / sumaCat) * 100) : 0;
    const pctCo = sumaCat > 0 ? Math.max(0, 100 - pctCh - pctHa) : 0;

    setCategorias([
      {
        nombre: "Churrasquería",
        emoji: "🔥",
        porcentaje: pctCh,
        montoBs: montoChurrasco,
        hex: "#fbbf24",
      },
      {
        nombre: "Hamburguesería",
        emoji: "🍔",
        porcentaje: pctHa,
        montoBs: montoHamburguesa,
        hex: "#f97316",
      },
      {
        nombre: "Bebidas / Sodas (50/50)",
        emoji: "🥤",
        porcentaje: pctCo,
        montoBs: montoCompartido,
        hex: "#34d399",
      },
    ]);

    // 5. Stock / Inventario desde menu_items
    try {
      const { data: invData } = await supabase
        .from("menu_items")
        .select("id, nombre, stock_actual, stock_minimo, controlar_stock")
        .eq("activo", true)
        .eq("controlar_stock", true)
        .limit(6);

      if (invData && invData.length > 0) {
        setInsumos(
          invData.map((item) => {
            const actual = Number(item.stock_actual || 0);
            const minimo = Math.max(1, Number(item.stock_minimo || 5));
            const pct = Math.max(
              0,
              Math.min(100, Math.round((actual / (minimo * 3)) * 100)),
            );
            const esBajo = actual <= minimo;
            return {
              id: String(item.id),
              nombre: String(item.nombre || "Ítem"),
              emoji: esBajo ? "🧊" : "🥩",
              nivel: pct,
              estado: esBajo ? "Bajo" : pct < 55 ? "Justo" : "Bien",
              hex: esBajo ? "#f43f5e" : pct < 55 ? "#fbbf24" : "#34d399",
              bajo: esBajo,
            };
          }),
        );
      } else {
        setInsumos([]);
      }
    } catch {
      setInsumos([]);
    }

    setCargando(false);
  }, []);

  useEffect(() => {
    void cargarDashboardReal();
  }, [cargarDashboardReal]);
  async function handleAbrirCaja() {
    if (segundosRestantesBloqueo > 0) return;

    const textoLimpio = montoInicialInput.trim();
    if (textoLimpio === "") {
      setAvisoCaja({
        tipo: "error",
        texto:
          "Escribe primero el monto inicial con el que abres la caja (puedes poner 0 si inicia vacía).",
      });
      return;
    }

    const montoNum = Number(textoLimpio);
    if (Number.isNaN(montoNum) || montoNum < 0) {
      setAvisoCaja({
        tipo: "error",
        texto: "Ingresa un monto inicial válido (0 o mayor).",
      });
      return;
    }

    setProcesandoCaja(true);
    setAvisoCaja(null);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.id) {
        throw new Error(
          "No se encontró el usuario autenticado para abrir la caja.",
        );
      }

      const { data: insertado, error } = await supabase
        .from("cierres_caja")
        .insert({
          monto_inicial: montoNum,
          abierto_en: new Date().toISOString(),
          abierto_por: user.id,
        })
        .select("id, monto_inicial, abierto_en, abierto_por")
        .single();

      if (error) throw error;

      setCajaAbierta({
        id: String(insertado.id),
        montoInicial: Number(insertado.monto_inicial ?? montoNum),
        abiertoEn: String(insertado.abierto_en),
        abiertoPor: String(insertado.abierto_por || user.id),
      });
      setMontoInicialInput("");
      setBloqueadoHastaMs(Date.now() + COOLDOWN_MS);
      setAvisoCaja({
        tipo: "ok",
        texto: `Caja abierta con ${bs(montoNum)}. Ya pueden ingresar cajera y meseros.`,
      });
      await cargarDashboardReal();
    } catch (e) {
      setAvisoCaja({
        tipo: "error",
        texto: e instanceof Error ? e.message : "No se pudo abrir la caja.",
      });
    } finally {
      setProcesandoCaja(false);
    }
  }

  async function handleConfirmarCierreCaja(e: React.FormEvent) {
    e.preventDefault();
    if (!cajaAbierta || segundosRestantesBloqueo > 0) return;

    const textoContado = efectivoCierreInput.trim();
    if (textoContado === "") {
      setAvisoCaja({
        tipo: "error",
        texto: "Ingresa el efectivo contado en caja antes de cerrar.",
      });
      return;
    }

    const contado = Number(textoContado);
    if (Number.isNaN(contado) || contado < 0) {
      setAvisoCaja({
        tipo: "error",
        texto: "Ingresa un monto contado válido (0 o mayor).",
      });
      return;
    }

    setProcesandoCaja(true);
    setAvisoCaja(null);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const desdeTurno = cajaAbierta.abiertoEn || new Date().toISOString();

      const [{ data: cobrosEfData }, { data: egresosData }] = await Promise.all(
        [
          supabase
            .from("cobros")
            .select("monto")
            .eq("metodo", "efectivo")
            .gte("created_at", desdeTurno),
          supabase
            .from("egresos_caja")
            .select("monto")
            .gte("created_at", desdeTurno),
        ],
      );

      const efectivoCobrado = (cobrosEfData ?? []).reduce(
        (acc, c) => acc + Number(c.monto || 0),
        0,
      );
      const totalEgresos = (egresosData ?? []).reduce(
        (acc, eg) => acc + Number(eg.monto || 0),
        0,
      );

      const efectivoEsperado = Number(
        (cajaAbierta.montoInicial + efectivoCobrado - totalEgresos).toFixed(2),
      );
      const diferencia = Number((contado - efectivoEsperado).toFixed(2));

      const { error } = await supabase
        .from("cierres_caja")
        .update({
          estado: "cerrado",
          cerrado_en: new Date().toISOString(),
          cerrado_por: user?.id ?? null,
          total_egresos: totalEgresos,
          efectivo_esperado: efectivoEsperado,
          efectivo_contado: contado,
          diferencia,
        })
        .eq("id", cajaAbierta.id);

      if (error) throw error;

      setCajaAbierta(null);
      setMostrandoCierreModal(false);
      setEfectivoCierreInput("");
      setBloqueadoHastaMs(Date.now() + COOLDOWN_MS);
      setAvisoCaja({
        tipo: "ok",
        texto: `Caja cerrada. Esperado: Bs ${efectivoEsperado.toFixed(2)} · Contado: Bs ${contado.toFixed(2)} · Dif.: Bs ${diferencia.toFixed(2)}.`,
      });
      await cargarDashboardReal();
    } catch (err) {
      setAvisoCaja({
        tipo: "error",
        texto:
          err instanceof Error ? err.message : "No se pudo cerrar la caja.",
      });
    } finally {
      setProcesandoCaja(false);
    }
  }

  const bajos = insumos.filter((i) => i.bajo);
  let acumulado = 0;
  const tramos = categorias.map((c) => {
    const inicio = acumulado;
    acumulado += c.porcentaje;
    return { ...c, inicio };
  });

  const montoInicialValido =
    montoInicialInput.trim() !== "" &&
    !Number.isNaN(Number(montoInicialInput)) &&
    Number(montoInicialInput) >= 0;

  const botonAbrirDeshabilitado =
    procesandoCaja || segundosRestantesBloqueo > 0 || !montoInicialValido;
  const botonCerrarDeshabilitado =
    procesandoCaja || segundosRestantesBloqueo > 0;

  const formatoCooldown = `${Math.floor(segundosRestantesBloqueo / 60)}:${String(
    segundosRestantesBloqueo % 60,
  ).padStart(2, "0")}`;

  return (
    <main className="relative min-h-screen bg-stone-950 text-stone-100">
      <style dangerouslySetInnerHTML={{ __html: estilos }} />

      {/* Resplandor sutil superior */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-80"
        style={{
          background:
            "radial-gradient(60% 100% at 50% 0%, rgba(249,115,22,0.18), transparent)",
        }}
      />

      <div className="relative mx-auto max-w-5xl space-y-6 p-4 sm:p-6 md:p-8">
        {/* Marca + acciones + botón único de Abrir / Cerrar caja */}
        <header className="aparece flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin/ventas"
              className="flex-1 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 px-5 py-3.5 text-center text-base font-bold text-stone-950 shadow-lg shadow-orange-600/25 transition hover:brightness-110 active:scale-95 md:flex-none"
            >
              🍽️ Tomar pedido
            </Link>
            <Link
              href="/admin/caja"
              className="flex-1 rounded-2xl border border-white/15 bg-white/5 px-5 py-3.5 text-center text-base font-bold text-white transition hover:bg-white/10 active:scale-95 md:flex-none"
            >
              💰 Caja
            </Link>
          </div>

          {/* Control de apertura / cierre de caja del admin */}
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-stone-900/90 p-2.5">
            {!cajaAbierta ? (
              <>
                <label className="flex items-center gap-2 px-2 text-xs text-stone-300">
                  <span>Monto inicial (Bs):</span>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    required
                    value={montoInicialInput}
                    onChange={(e) => setMontoInicialInput(e.target.value)}
                    placeholder="Ej. 100.00"
                    className="w-28 rounded-xl border border-white/15 bg-stone-950 px-2.5 py-1.5 text-sm font-bold text-white placeholder:font-normal placeholder:text-stone-500"
                  />
                </label>
                <button
                  type="button"
                  disabled={botonAbrirDeshabilitado}
                  onClick={() => void handleAbrirCaja()}
                  className="rounded-xl bg-emerald-400 px-4 py-2 text-xs font-black text-stone-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {procesandoCaja
                    ? "Abriendo..."
                    : segundosRestantesBloqueo > 0
                      ? `Bloqueado (${formatoCooldown})`
                      : "🔓 Abrir caja"}
                </button>
              </>
            ) : (
              <>
                <div className="px-2 text-xs">
                  <span className="font-extrabold text-emerald-300">
                    🟢 Caja abierta
                  </span>
                  <span className="ml-2 text-stone-400">
                    Inicial: {bs(cajaAbierta.montoInicial)}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={botonCerrarDeshabilitado}
                  onClick={() => setMostrandoCierreModal(true)}
                  className="rounded-xl bg-rose-500 px-4 py-2 text-xs font-black text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {procesandoCaja
                    ? "Cerrando..."
                    : segundosRestantesBloqueo > 0
                      ? `Resguardo (${formatoCooldown})`
                      : "🔒 Cerrar caja"}
                </button>
              </>
            )}
          </div>
        </header>

        {avisoCaja && (
          <div
            className={`rounded-2xl border px-4 py-3 text-sm font-bold ${
              avisoCaja.tipo === "ok"
                ? "border-emerald-400/35 bg-emerald-500/15 text-emerald-200"
                : "border-rose-400/35 bg-rose-500/15 text-rose-200"
            }`}
          >
            {avisoCaja.texto}
          </div>
        )}

        {/* Modal rápido para cerrar caja con efectivo contado */}
        {mostrandoCierreModal && cajaAbierta && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
            <form
              onSubmit={(e) => void handleConfirmarCierreCaja(e)}
              className="w-full max-w-md space-y-4 rounded-3xl border border-white/10 bg-stone-900 p-6"
            >
              <h3 className="text-lg font-black text-white">Cerrar caja</h3>
              <p className="text-xs text-stone-400">
                Monto inicial de apertura: {bs(cajaAbierta.montoInicial)}.
                Ingresa el efectivo contado para cerrar el turno.
              </p>
              <input
                type="number"
                min="0"
                step="0.5"
                required
                value={efectivoCierreInput}
                onChange={(e) => setEfectivoCierreInput(e.target.value)}
                placeholder="Ej. 450.00"
                className="w-full rounded-xl border border-white/15 bg-stone-950 px-3.5 py-2.5 text-sm font-bold text-white placeholder:font-normal placeholder:text-stone-500"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMostrandoCierreModal(false)}
                  className="flex-1 rounded-xl border border-white/15 bg-stone-950 py-2.5 text-xs font-bold text-stone-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={procesandoCaja || efectivoCierreInput.trim() === ""}
                  className="flex-1 rounded-xl bg-rose-500 py-2.5 text-xs font-black text-white hover:bg-rose-400 disabled:opacity-45"
                >
                  {procesandoCaja ? "Cerrando..." : "Confirmar cierre"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Título */}
        <div className="aparece" style={{ animationDelay: "60ms" }}>
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Resumen del día
          </h1>
          <p className="mt-1 text-base text-stone-400">
            {cargando
              ? "Sincronizando con la base de datos..."
              : "Movimiento, ventas e inventario en tiempo real."}
          </p>
        </div>

        {/* Aviso */}
        {bajos.length > 0 && (
          <Link
            href="/admin/inventario-compras"
            className="aparece group flex items-center justify-between gap-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-5 py-4 transition hover:bg-rose-500/15"
            style={{ animationDelay: "120ms" }}
          >
            <span className="flex items-center gap-3 text-base text-rose-100">
              <span className="text-xl">⚠️</span>
              <span>
                <b>{bajos.map((b) => b.nombre).join(", ")}</b> está bajo.
                Conviene reponer pronto.
              </span>
            </span>
            <span className="shrink-0 text-sm font-bold text-rose-300 transition group-hover:translate-x-1">
              Ver →
            </span>
          </Link>
        )}

        {/* Estado actual */}
        <section
          className="aparece grid grid-cols-1 gap-4 sm:grid-cols-3"
          style={{ animationDelay: "180ms" }}
        >
          {ahoraKpis.map((a) => (
            <div
              key={a.titulo}
              className={`${tarjeta} flex items-center gap-4`}
            >
              <Anillo valor={a.valor} hex={a.hex} emoji={a.emoji} />
              <div>
                <p className="text-sm font-medium text-stone-400">{a.titulo}</p>
                <p className="text-lg font-extrabold leading-tight text-white">
                  {a.estado}
                </p>
                <p className="text-sm font-bold" style={{ color: a.hex }}>
                  {a.valor}%
                </p>
              </div>
            </div>
          ))}
        </section>

        {/* Semana */}
        <section
          className={`${tarjeta} aparece space-y-6`}
          style={{ animationDelay: "240ms" }}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-extrabold text-white">
                Ingresos de los últimos 7 días
              </h2>
              <p className="text-sm text-stone-400">
                Cobros reales registrados en base de datos.
              </p>
            </div>
            <Link
              href="/admin/reportes"
              className="shrink-0 rounded-full border border-white/10 px-4 py-1.5 text-sm font-semibold text-amber-300 transition hover:bg-white/5"
            >
              Reportes →
            </Link>
          </div>

          <div className="relative">
            <div
              aria-hidden
              className="absolute inset-x-0 top-0 flex h-40 flex-col justify-between"
            >
              {[0, 1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="border-t border-dashed border-white/[0.06]"
                />
              ))}
            </div>

            <div className="relative grid grid-cols-7 items-end gap-2 sm:gap-4">
              {semana.map((d, i) => {
                const fuerte = d.nivel >= 85 && d.totalBs > 0;
                return (
                  <div
                    key={`${d.dia}-${i}`}
                    className="flex flex-col items-center gap-2"
                  >
                    <div className="flex h-40 w-full max-w-[52px] items-end">
                      <div
                        style={{
                          height: `${d.nivel}%`,
                          animationDelay: `${300 + i * 70}ms`,
                        }}
                        title={`${d.dia}: ${bs(d.totalBs)}`}
                        className={`sube relative w-full rounded-t-xl rounded-b-md ${
                          fuerte
                            ? "bg-gradient-to-t from-orange-600 to-amber-300 shadow-[0_0_24px_rgba(251,146,60,0.35)]"
                            : "bg-gradient-to-t from-stone-700 to-stone-500"
                        }`}
                      >
                        {fuerte && (
                          <span className="absolute -top-7 left-1/2 -translate-x-1/2 text-lg">
                            🔥
                          </span>
                        )}
                      </div>
                    </div>
                    <span
                      className={`text-sm font-bold ${
                        fuerte ? "text-amber-300" : "text-stone-400"
                      }`}
                    >
                      {d.dia}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Categorías + Inventario */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <section
            className={`${tarjeta} aparece space-y-5`}
            style={{ animationDelay: "320ms" }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-extrabold text-white">
                  Aporte por línea hoy
                </h2>
                <p className="text-sm text-stone-400">
                  Calculado desde detalle de pedidos
                </p>
              </div>
              <Link
                href="/admin/ventas"
                className="shrink-0 rounded-full border border-white/10 px-4 py-1.5 text-sm font-semibold text-amber-300 transition hover:bg-white/5"
              >
                Ventas →
              </Link>
            </div>

            <div className="flex h-3.5 w-full gap-1 overflow-hidden rounded-full">
              {tramos.map((c) => (
                <div
                  key={c.nombre}
                  title={`${c.nombre}: ${c.porcentaje}% (${bs(c.montoBs)})`}
                  style={{ width: `${c.porcentaje}%`, background: c.hex }}
                  className="h-full rounded-full"
                />
              ))}
            </div>

            <ul className="space-y-3">
              {categorias.map((c) => (
                <li
                  key={c.nombre}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="flex items-center gap-3 text-base text-stone-100">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: c.hex }}
                    />
                    <span>{c.emoji}</span>
                    {c.nombre}
                  </span>
                  <span className="text-base font-extrabold text-white">
                    {c.porcentaje}%{" "}
                    <span className="text-xs font-normal text-stone-400">
                      ({bs(c.montoBs)})
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section
            className={`${tarjeta} aparece space-y-5`}
            style={{ animationDelay: "400ms" }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-extrabold text-white">
                  Inventario
                </h2>
                <p className="text-sm text-stone-400">
                  Insumos en base de datos
                </p>
              </div>
              <Link
                href="/admin/inventario-compras"
                className="shrink-0 rounded-full border border-white/10 px-4 py-1.5 text-sm font-semibold text-amber-300 transition hover:bg-white/5"
              >
                Ver todo →
              </Link>
            </div>

            {insumos.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-white/10 py-8 text-center text-sm text-stone-400">
                Sin insumos registrados o por configurar en inventario.
              </p>
            ) : (
              <ul className="space-y-5">
                {insumos.map((item, i) => (
                  <li key={item.id} className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2.5 text-base text-stone-100">
                        <span className="text-xl">{item.emoji}</span>
                        {item.nombre}
                      </span>
                      <span
                        className="rounded-full px-3 py-0.5 text-sm font-bold"
                        style={{
                          color: item.hex,
                          background: `${item.hex}1f`,
                        }}
                      >
                        {item.estado}
                      </span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-stone-800">
                      <div
                        style={{
                          width: `${item.nivel}%`,
                          background: item.hex,
                          animationDelay: `${500 + i * 100}ms`,
                        }}
                        className="llena h-full rounded-full"
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <footer className="pb-2 pt-2 text-center text-xs text-stone-600">
          La Caprichosa Grill &amp; Burger
        </footer>
      </div>
    </main>
  );
}
