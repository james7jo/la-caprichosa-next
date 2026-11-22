"use client";

import { useEffect, useState } from "react";
import {
  rangoPreset,
  type PresetRango,
  type Rango,
  deInputLocalInicio,
  deInputLocalFin,
} from "@/lib/reportes/utilidades";

export type SeleccionRango = {
  preset: PresetRango;
  rango: Rango;
  etiqueta: string;
};

type Props = {
  value?: SeleccionRango;
  onChange: (seleccion: SeleccionRango) => void;
};

const PRESETS: { id: Exclude<PresetRango, "personalizado">; label: string }[] =
  [
    { id: "hoy", label: "Hoy" },
    { id: "ayer", label: "Ayer" },
    { id: "3h", label: "Últimas 3h" },
    { id: "semana", label: "Semana" },
    { id: "mes", label: "Mes" },
  ];

export function SelectorRango({ value, onChange }: Props) {
  const [presetActivo, setPresetActivo] = useState<PresetRango>(
    value?.preset ?? "hoy",
  );
  const [desdeLocal, setDesdeLocal] = useState("");
  const [hastaLocal, setHastaLocal] = useState("");

  useEffect(() => {
    if (!value) {
      const ahora = new Date();
      onChange({
        preset: "hoy",
        rango: rangoPreset("hoy", ahora),
        etiqueta: "Hoy",
      });
    }
  }, [value, onChange]);

  function elegir(
    preset: Exclude<PresetRango, "personalizado">,
    label: string,
  ) {
    const ahora = new Date();
    setPresetActivo(preset);
    onChange({
      preset,
      rango: rangoPreset(preset, ahora),
      etiqueta: label,
    });
  }

  function aplicarPersonalizado() {
    if (!desdeLocal || !hastaLocal) return;
    setPresetActivo("personalizado");
    onChange({
      preset: "personalizado",
      rango: {
        desde: deInputLocalInicio(desdeLocal),
        hasta: deInputLocalFin(hastaLocal),
      },
      etiqueta: "Personalizado",
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      {PRESETS.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => elegir(p.id, p.label)}
          className={`rounded-xl px-2.5 py-1.5 font-bold transition ${
            presetActivo === p.id
              ? "bg-amber-400 text-stone-950"
              : "border border-white/10 bg-stone-950 text-stone-300 hover:bg-white/5"
          }`}
        >
          {p.label}
        </button>
      ))}

      <div className="flex flex-wrap items-center gap-1">
        <input
          type="datetime-local"
          value={desdeLocal}
          onChange={(e) => setDesdeLocal(e.target.value)}
          className="rounded-xl border border-white/10 bg-stone-950 px-2 py-1 text-[11px] text-stone-200"
        />
        <input
          type="datetime-local"
          value={hastaLocal}
          onChange={(e) => setHastaLocal(e.target.value)}
          className="rounded-xl border border-white/10 bg-stone-950 px-2 py-1 text-[11px] text-stone-200"
        />
        <button
          type="button"
          onClick={aplicarPersonalizado}
          className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-[11px] font-bold text-amber-300 hover:bg-amber-400/20"
        >
          Aplicar
        </button>
      </div>
    </div>
  );
}
