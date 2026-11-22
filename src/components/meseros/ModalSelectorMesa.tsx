"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { MesaPlanoItem } from "@/components/mesas/plano-base";

const CroquisSalonPrincipal = dynamic(
  () =>
    import("@/components/mesas/croquis-salon-principal").then(
      (m) => m.CroquisSalonPrincipal,
    ),
  { ssr: false },
);

const CroquisJardin = dynamic(
  () =>
    import("@/components/mesas/croquis-jardin").then((m) => m.CroquisJardin),
  { ssr: false },
);

const CroquisHamburgueseria = dynamic(
  () =>
    import("@/components/mesas/croquis-hamburgueseria").then(
      (m) => m.CroquisHamburgueseria,
    ),
  { ssr: false },
);

const CroquisGaraje = dynamic(
  () =>
    import("@/components/mesas/croquis-garaje").then((m) => m.CroquisGaraje),
  { ssr: false },
);

export type MesaSelectorItem = MesaPlanoItem;

const nomMesa = (m: Pick<MesaSelectorItem, "nombre" | "numero">) =>
  m.nombre || `Mesa ${m.numero}`;

export function ModalSelectorMesa({
  abierto,
  onCerrar,
  userId,
  mesas,
  onElegirMesa,
  onLimpiarMesa,
}: {
  abierto: boolean;
  onCerrar: () => void;
  userId: string;
  mesas: MesaSelectorItem[];
  onElegirMesa: (mesa: MesaSelectorItem) => void;
  onLimpiarMesa?: (mesa: MesaSelectorItem) => void;
}) {
  const [zonaElegida, setZonaElegida] = useState<string>("");
  const [confirmarMesa, setConfirmarMesa] = useState<MesaSelectorItem | null>(
    null,
  );
  const [mesaSuciaActiva, setMesaSuciaActiva] =
    useState<MesaSelectorItem | null>(null);

  const habilitadas = mesas.filter((m) => m.habilitada);
  const zonas = Array.from(
    new Set(habilitadas.map((m) => m.zona || "Salón Principal")),
  );
  const zonaActiva =
    zonaElegida && zonas.includes(zonaElegida)
      ? zonaElegida
      : (zonas[0] ?? "Salón Principal");

  useEffect(() => {
    if (!abierto) {
      setConfirmarMesa(null);
      setMesaSuciaActiva(null);
    }
  }, [abierto]);

  if (!abierto) return null;

  const mesasDeZona = habilitadas.filter(
    (m) => (m.zona || "Salón Principal") === zonaActiva,
  );

  function handleTocarMesa(m: MesaSelectorItem) {
    if (!m.habilitada) return;

    if (m.estado === "sucia") {
      setConfirmarMesa(null);
      setMesaSuciaActiva(m);
      return;
    }

    if (m.estado === "ocupada" && m.mesero_actual_id !== userId) {
      return;
    }

    setMesaSuciaActiva(null);
    setConfirmarMesa(m);
  }

  const propsCroquis = {
    mesas: mesasDeZona,
    userId,
    modoEditor: false,
    mesaSeleccionadaId: confirmarMesa?.id ?? mesaSuciaActiva?.id ?? null,
    onClickPlano: () => {},
    onClickMesa: handleTocarMesa,
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onCerrar}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-stone-900 shadow-2xl sm:rounded-3xl"
      >
        {/* Cabecera */}
        <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
          <div>
            <h2 className="text-lg font-extrabold text-white">
              Croquis por sección
            </h2>
            <p className="text-xs text-stone-400">
              Elige la sección y toca la mesa en el croquis para hacerte cargo.
            </p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar selector de mesas"
            className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-base font-bold text-white hover:bg-white/15"
          >
            ✕
          </button>
        </div>

        {/* Pestañas de secciones */}
        <div className="flex gap-2 overflow-x-auto px-5 pt-3 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {zonas.map((z) => (
            <button
              key={z}
              type="button"
              onClick={() => {
                setZonaElegida(z);
                setConfirmarMesa(null);
                setMesaSuciaActiva(null);
              }}
              className={`min-h-[40px] shrink-0 rounded-full px-4 py-2 text-xs font-extrabold transition active:scale-95 ${
                zonaActiva === z
                  ? "bg-gradient-to-r from-amber-400 to-orange-500 text-stone-950"
                  : "border border-white/10 bg-stone-950 text-stone-300 hover:border-white/25"
              }`}
            >
              {z}
            </button>
          ))}
        </div>

        {/* Leyenda de estados */}
        <div className="flex flex-wrap items-center gap-4 px-5 pb-3 text-[11px] font-semibold text-stone-400">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" /> Libre
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Tuya
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-stone-500" /> Orden ya
            tomada
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-400" /> Sucia
          </span>
        </div>

        {/* Confirmación: ¿Me hago cargo de la Mesa X? */}
        {confirmarMesa && (
          <div className="mx-5 mb-3 space-y-3 rounded-2xl border border-amber-400/50 bg-stone-950 p-4">
            <p className="text-sm font-black text-white">
              ¿Me hago cargo de la {nomMesa(confirmarMesa)}?
            </p>
            <p className="text-xs text-stone-400">
              Al confirmar, abres el menú directo para tomar la orden.
            </p>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmarMesa(null)}
                className="min-h-[44px] flex-1 rounded-xl border border-white/15 bg-white/5 py-2.5 text-xs font-bold text-stone-300"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  const elegida = confirmarMesa;
                  setConfirmarMesa(null);
                  onElegirMesa(elegida);
                }}
                className="min-h-[44px] flex-1 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 py-2.5 text-xs font-black text-stone-950"
              >
                Sí, me hago cargo
              </button>
            </div>
          </div>
        )}

        {/* Aviso de mesa sucia */}
        {mesaSuciaActiva && (
          <div className="mx-5 mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-400/40 bg-rose-950/30 p-3.5">
            <span className="text-xs font-bold text-rose-200">
              {nomMesa(mesaSuciaActiva)} está sucia. Límpiala antes de volver a
              tomar orden.
            </span>
            <div className="flex items-center gap-2">
              {onLimpiarMesa && (
                <button
                  type="button"
                  onClick={() => {
                    const objetivo = mesaSuciaActiva;
                    setMesaSuciaActiva(null);
                    onLimpiarMesa(objetivo);
                  }}
                  className="min-h-[38px] rounded-xl bg-emerald-400 px-3 py-1.5 text-xs font-black text-stone-950"
                >
                  🧹 Ya limpié la mesa
                </button>
              )}
              <button
                type="button"
                onClick={() => setMesaSuciaActiva(null)}
                className="rounded-xl px-2.5 py-1.5 text-xs font-bold text-stone-300"
              >
                Cerrar
              </button>
            </div>
          </div>
        )}

        {/* Croquis real de la sección elegida */}
        <div
          className="overflow-y-auto px-5 pt-1 pb-6"
          style={{
            paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))",
          }}
        >
          {zonaActiva === "Jardín" ? (
            <CroquisJardin {...propsCroquis} />
          ) : zonaActiva === "Hamburguesería" ? (
            <CroquisHamburgueseria {...propsCroquis} />
          ) : zonaActiva === "Garaje" ? (
            <CroquisGaraje {...propsCroquis} />
          ) : (
            <CroquisSalonPrincipal {...propsCroquis} />
          )}
        </div>
      </div>
    </div>
  );
}
