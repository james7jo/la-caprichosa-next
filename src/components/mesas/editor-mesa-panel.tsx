"use client";

import { useState } from "react";

const inputCls =
  "h-11 w-full rounded-xl border border-white/10 bg-stone-950 px-3 text-base text-white sm:h-10 sm:text-sm";
const flechaCls =
  "grid h-12 w-12 place-items-center rounded-xl border border-white/15 bg-stone-800 text-xl font-black text-white active:bg-amber-400 active:text-stone-950";

export type MesaEditable = {
  id: string;
  numero: number;
  nombre?: string | null;
  zona: string;
  capacidad: number;
  habilitada: boolean;
  solo_fin_de_semana?: boolean;
};

export type DatosMesaNueva = {
  numero: number;
  nombre: string;
  capacidad: number;
  soloFinDeSemana: boolean;
};

export type DatosMesaEditada = {
  numero: number;
  nombre: string;
  zona: string;
  capacidad: number;
  soloFinDeSemana: boolean;
};

/* ------------------------------------------------------------------ */
/*  Formulario: nueva mesa                                             */
/* ------------------------------------------------------------------ */

export function PanelNuevaMesa({
  sector,
  siguienteNumero,
  ocupado,
  onCrear,
}: {
  sector: string;
  siguienteNumero: number;
  ocupado: boolean;
  onCrear: (d: DatosMesaNueva) => void;
}) {
  const [num, setNum] = useState("");
  const [etiqueta, setEtiqueta] = useState("");
  const [cap, setCap] = useState(4);
  const [finde, setFinde] = useState(false);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onCrear({
          numero: Number(num) || siguienteNumero,
          nombre: etiqueta.trim(),
          capacidad: cap,
          soloFinDeSemana: finde,
        });
        setNum("");
        setEtiqueta("");
      }}
      className="space-y-3 rounded-3xl border border-amber-400/30 bg-stone-900/90 p-4"
    >
      <p className="text-xs font-extrabold uppercase tracking-wider text-amber-300">
        + Nueva mesa en {sector}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <input
          type="number"
          inputMode="numeric"
          min="1"
          value={num}
          onChange={(e) => setNum(e.target.value)}
          placeholder={`N° (siguiente: ${siguienteNumero})`}
          className={inputCls}
        />
        <input
          value={etiqueta}
          onChange={(e) => setEtiqueta(e.target.value)}
          placeholder="Etiqueta (opcional)"
          className={inputCls}
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-stone-400">👥 Personas</span>
        {[2, 4, 6, 8].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setCap(n)}
            className={`h-11 w-11 rounded-xl text-sm font-black ${
              cap === n
                ? "bg-amber-400 text-stone-950"
                : "border border-white/10 bg-stone-950 text-stone-300"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-xs text-stone-300">
          <input
            type="checkbox"
            checked={finde}
            onChange={(e) => setFinde(e.target.checked)}
            className="h-5 w-5 accent-amber-400"
          />
          Solo fin de semana
        </label>
        <button
          type="submit"
          disabled={ocupado}
          className="h-11 rounded-xl bg-amber-400 px-5 text-xs font-black text-stone-950 disabled:opacity-60"
        >
          Agregar
        </button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/*  Panel de la mesa seleccionada (abajo en celular, normal en PC)     */
/*  Usar con key={mesa.id} para que el formulario se reinicie.         */
/* ------------------------------------------------------------------ */

export function PanelMesaSeleccionada({
  mesa,
  sectores,
  ocupado,
  onMover,
  onToggleHabilitada,
  onGuardar,
  onEliminar,
  onCerrar,
}: {
  mesa: MesaEditable;
  sectores: string[];
  ocupado: boolean;
  onMover: (dx: number, dy: number) => void;
  onToggleHabilitada: () => void;
  onGuardar: (d: DatosMesaEditada) => void;
  onEliminar: () => void;
  onCerrar: () => void;
}) {
  const [verDatos, setVerDatos] = useState(false);
  const [confirmar, setConfirmar] = useState(false);

  const [num, setNum] = useState(String(mesa.numero));
  const [etiqueta, setEtiqueta] = useState(mesa.nombre || "");
  const [zona, setZona] = useState(mesa.zona);
  const [cap, setCap] = useState(String(mesa.capacidad || 4));
  const [finde, setFinde] = useState(Boolean(mesa.solo_fin_de_semana));

  return (
    <>
      {/* Espacio para que el panel fijo no tape el plano en celular */}
      <div className={verDatos ? "h-[70vh] sm:hidden" : "h-64 sm:hidden"} />

      <div className="fixed inset-x-2 bottom-[5.5rem] z-40 max-h-[55vh] overflow-y-auto rounded-3xl border border-amber-400/40 bg-stone-900 p-3 shadow-2xl sm:static sm:inset-x-auto sm:max-h-none sm:rounded-3xl sm:border sm:p-4 sm:shadow-none">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-extrabold uppercase tracking-wider text-sky-300">
            Mesa {mesa.numero} · {mesa.zona}
          </p>
          <button
            type="button"
            onClick={onCerrar}
            className="h-10 rounded-xl bg-amber-400 px-4 text-xs font-black text-stone-950"
          >
            Listo
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="grid grid-cols-3 gap-1">
            <span />
            <button
              type="button"
              aria-label="Subir"
              onClick={() => onMover(0, -1)}
              className={flechaCls}
            >
              ↑
            </button>
            <span />
            <button
              type="button"
              aria-label="Izquierda"
              onClick={() => onMover(-1, 0)}
              className={flechaCls}
            >
              ←
            </button>
            <button
              type="button"
              aria-label="Bajar"
              onClick={() => onMover(0, 1)}
              className={flechaCls}
            >
              ↓
            </button>
            <button
              type="button"
              aria-label="Derecha"
              onClick={() => onMover(1, 0)}
              className={flechaCls}
            >
              →
            </button>
          </div>

          <div className="flex flex-1 flex-col gap-2">
            <button
              type="button"
              disabled={ocupado}
              onClick={onToggleHabilitada}
              className={`h-11 rounded-xl border px-3 text-xs font-bold ${
                mesa.habilitada
                  ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
                  : "border-stone-600 bg-stone-950 text-stone-400"
              }`}
            >
              {mesa.habilitada ? "🟢 Habilitada" : "⚫ Apagada"}
            </button>
            <button
              type="button"
              onClick={() => setVerDatos((v) => !v)}
              className="h-11 rounded-xl border border-white/10 bg-stone-950 px-3 text-xs font-bold text-stone-200"
            >
              {verDatos ? "Ocultar datos" : "✏️ Editar datos"}
            </button>
            <button
              type="button"
              disabled={ocupado}
              onClick={() => {
                if (!confirmar) {
                  setConfirmar(true);
                  return;
                }
                onEliminar();
              }}
              className={`h-11 rounded-xl px-3 text-xs font-bold ${
                confirmar
                  ? "bg-rose-500 text-white"
                  : "bg-rose-500/20 text-rose-300"
              }`}
            >
              {confirmar ? "¿Seguro? Toca otra vez" : "Eliminar"}
            </button>
          </div>
        </div>

        {verDatos && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onGuardar({
                numero: Number(num),
                nombre: etiqueta.trim(),
                zona,
                capacidad: Number(cap) || 4,
                soloFinDeSemana: finde,
              });
              setVerDatos(false);
            }}
            className="mt-3 space-y-2"
          >
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                inputMode="numeric"
                min="1"
                value={num}
                onChange={(e) => setNum(e.target.value)}
                placeholder="N° mesa"
                className={inputCls}
              />
              <input
                type="number"
                inputMode="numeric"
                min="1"
                value={cap}
                onChange={(e) => setCap(e.target.value)}
                placeholder="Personas"
                className={inputCls}
              />
            </div>
            <input
              value={etiqueta}
              onChange={(e) => setEtiqueta(e.target.value)}
              placeholder="Etiqueta"
              className={inputCls}
            />
            <select
              value={zona}
              onChange={(e) => setZona(e.target.value)}
              className={inputCls}
            >
              {sectores.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-xs text-stone-300">
                <input
                  type="checkbox"
                  checked={finde}
                  onChange={(e) => setFinde(e.target.checked)}
                  className="h-5 w-5 accent-amber-400"
                />
                Solo fin de semana
              </label>
              <button
                type="submit"
                disabled={ocupado}
                className="h-11 rounded-xl bg-emerald-400 px-5 text-xs font-black text-stone-950 disabled:opacity-60"
              >
                Guardar
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
