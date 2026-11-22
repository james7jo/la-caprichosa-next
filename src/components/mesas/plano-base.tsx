"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent, PointerEvent as ReactPointerEvent } from "react";

/* ------------------------------------------------------------------ */
/*  Tipos y utilidades compartidas                                     */
/* ------------------------------------------------------------------ */

export type MesaPlanoItem = {
  id: string;
  numero: number;
  nombre?: string | null;
  zona: string;
  capacidad: number;
  estado: "disponible" | "ocupada" | "sucia";
  habilitada: boolean;
  solo_fin_de_semana?: boolean;
  mesero_actual_id?: string | null;
  /** Si tiene valor, esta mesa está unida a la mesa principal con ese id */
  unida_con_id?: string | null;
  pos_x?: number | null;
  pos_y?: number | null;
};

export type ObjetoTipo =
  | "puerta"
  | "caja"
  | "cocina"
  | "barra"
  | "banos"
  | "parqueo"
  | "otro";

export type ObjetoPlano = {
  id: string;
  zona: string;
  tipo: ObjetoTipo;
  etiqueta: string;
  pos_x: number;
  pos_y: number;
};

export type Pos = { x: number; y: number };

export const TIPOS_OBJETO: Record<
  ObjetoTipo,
  { emoji: string; nombre: string; clase: string }
> = {
  puerta: {
    emoji: "🚪",
    nombre: "Entrada",
    clase: "border-sky-400/50 bg-sky-950 text-sky-200",
  },
  caja: {
    emoji: "💰",
    nombre: "Caja",
    clase: "border-emerald-400/50 bg-emerald-950 text-emerald-200",
  },
  cocina: {
    emoji: "🔥",
    nombre: "Cocina",
    clase: "border-amber-400/50 bg-amber-950 text-amber-200",
  },
  barra: {
    emoji: "🍹",
    nombre: "Barra",
    clase: "border-violet-400/50 bg-violet-950 text-violet-200",
  },
  banos: {
    emoji: "🚻",
    nombre: "Baños",
    clase: "border-cyan-400/50 bg-cyan-950 text-cyan-200",
  },
  parqueo: {
    emoji: "🚗",
    nombre: "Parqueo",
    clase: "border-stone-400/50 bg-stone-800 text-stone-200",
  },
  otro: {
    emoji: "📍",
    nombre: "Otro",
    clase: "border-pink-400/50 bg-pink-950 text-pink-200",
  },
};

// Límites (en %) y paso de la cuadrícula magnética
export const PLANO_LIMITES = { xMin: 8, xMax: 90, yMin: 10, yMax: 88 };
export const PASO_IMAN = 5;

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));
export const redondear = (v: number, paso: number) =>
  Math.round(v / paso) * paso;

export const clampPos = (p: Pos): Pos => ({
  x: clamp(p.x, PLANO_LIMITES.xMin, PLANO_LIMITES.xMax),
  y: clamp(p.y, PLANO_LIMITES.yMin, PLANO_LIMITES.yMax),
});

function posDe(item: { pos_x?: number | null; pos_y?: number | null }): Pos {
  return clampPos({
    x: Number(item.pos_x ?? 50),
    y: Number(item.pos_y ?? 50),
  });
}

/*
 * El plano es un LIENZO de tamaño fijo (en px "virtuales") que se escala
 * para caber en la pantalla. Así las mesas nunca se encimen distinto en
 * celular que en PC, y el tamaño de todo es proporcional.
 */
const LIENZO = {
  horizontal: { w: 640, h: 420 },
  vertical: { w: 420, h: 640 },
} as const;
// En celular (pantalla angosta) el lienzo es más alto, así el croquis
// ocupa casi toda la pantalla en vez de ser una tira baja.
const LIENZO_MOVIL = {
  horizontal: { w: 480, h: 560 },
  vertical: { w: 440, h: 660 },
} as const;
const ANCHO_MOVIL = 560;
const ZOOMS = [1, 1.5, 2, 3];
const ESCALA_MAX_AJUSTE = 1.25;

type ManejadoresArrastre = {
  onIniciar: (e: ReactPointerEvent<HTMLElement>) => void;
  onMover: (e: ReactPointerEvent<HTMLElement>) => void;
  onTerminar: (e: ReactPointerEvent<HTMLElement>) => void;
};

/* ------------------------------------------------------------------ */
/*  Mesa                                                               */
/* ------------------------------------------------------------------ */

const MesaBoton = memo(function MesaBoton({
  mesa: m,
  x,
  y,
  userId,
  grupo,
  compacto,
  seleccionada,
  arrastrable,
  onClick,
  arrastre,
}: {
  mesa: MesaPlanoItem;
  x: number;
  y: number;
  userId?: string;
  /** Ej. "3+2" si la mesa forma parte de un grupo unido */
  grupo: string | null;
  compacto: boolean;
  seleccionada: boolean;
  arrastrable: boolean;
  onClick: (m: MesaPlanoItem) => void;
  arrastre: ManejadoresArrastre;
}) {
  const esMia = m.estado === "ocupada" && m.mesero_actual_id === userId;
  const ordenYaTomada = m.estado === "ocupada" && m.mesero_actual_id !== userId;
  const sucia = m.estado === "sucia";

  const estilo = !m.habilitada
    ? "border-white/10 bg-stone-900/60 text-stone-500 opacity-55"
    : sucia
      ? "border-rose-500/50 bg-rose-950 text-rose-200"
      : ordenYaTomada
        ? "border-white/15 bg-stone-900 text-stone-400 opacity-70"
        : esMia
          ? "border-amber-400 bg-amber-950 text-white"
          : grupo
            ? "border-indigo-400 bg-indigo-950 text-indigo-100"
            : "border-emerald-400/50 bg-stone-900 text-white";

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick(m);
      }}
      onPointerDown={arrastrable ? arrastre.onIniciar : undefined}
      onPointerMove={arrastrable ? arrastre.onMover : undefined}
      onPointerUp={arrastrable ? arrastre.onTerminar : undefined}
      onPointerCancel={arrastrable ? arrastre.onTerminar : undefined}
      style={{ left: `${x}%`, top: `${y}%` }}
      className={`absolute flex ${compacto ? "h-[66px] w-[66px]" : "h-[84px] w-[84px]"} -translate-x-1/2 -translate-y-1/2 select-none flex-col items-center justify-center rounded-2xl border-2 text-center ${estilo} ${
        seleccionada ? "z-20 ring-4 ring-amber-400" : "z-10"
      } ${arrastrable ? "touch-none" : ""}`}
    >
      {grupo && (
        <span className="absolute -right-2 -top-2 grid h-7 w-7 place-items-center rounded-full border-2 border-stone-950 bg-indigo-500 text-[14px]">
          🔗
        </span>
      )}
      <span
        className={`${compacto ? "text-[12px]" : "text-[13px]"} leading-none opacity-80`}
      >
        👥 {m.capacidad || 4}
      </span>
      <span
        className={`my-0.5 ${compacto ? "text-[28px]" : "text-[34px]"} font-black leading-none`}
      >
        {m.numero}
      </span>
      <span
        className={`${compacto ? "text-[11px]" : "text-[13px]"} max-w-full overflow-hidden whitespace-nowrap font-bold leading-none opacity-90`}
      >
        {!m.habilitada
          ? "Off"
          : sucia
            ? "Sucia"
            : ordenYaTomada
              ? "Ocupada"
              : esMia
                ? "Tuya"
                : grupo
                  ? compacto
                    ? grupo
                    : `Unida ${grupo}`
                  : "Libre"}
      </span>
    </button>
  );
});

/* ------------------------------------------------------------------ */
/*  Objeto identificador                                               */
/* ------------------------------------------------------------------ */

const ObjetoBoton = memo(function ObjetoBoton({
  objeto: o,
  x,
  y,
  editable,
  compacto,
  seleccionado,
  arrastrable,
  onClick,
  arrastre,
}: {
  objeto: ObjetoPlano;
  x: number;
  y: number;
  editable: boolean;
  compacto: boolean;
  seleccionado: boolean;
  arrastrable: boolean;
  onClick: (o: ObjetoPlano) => void;
  arrastre: ManejadoresArrastre;
}) {
  const tipo = TIPOS_OBJETO[o.tipo] ?? TIPOS_OBJETO.otro;
  return (
    <button
      type="button"
      disabled={!editable}
      onClick={(e) => {
        e.stopPropagation();
        onClick(o);
      }}
      onPointerDown={arrastrable ? arrastre.onIniciar : undefined}
      onPointerMove={arrastrable ? arrastre.onMover : undefined}
      onPointerUp={arrastrable ? arrastre.onTerminar : undefined}
      onPointerCancel={arrastrable ? arrastre.onTerminar : undefined}
      style={{ left: `${x}%`, top: `${y}%` }}
      className={`absolute flex -translate-x-1/2 -translate-y-1/2 select-none items-center gap-1.5 whitespace-nowrap rounded-xl border-2 ${compacto ? "px-2 py-1 text-[14px]" : "px-3 py-1.5 text-[17px]"} font-extrabold ${tipo.clase} ${
        !editable
          ? "pointer-events-none z-[5]"
          : seleccionado
            ? "z-20 ring-4 ring-amber-400"
            : "z-[5]"
      } ${arrastrable ? "touch-none" : ""}`}
    >
      <span
        className={`${compacto ? "text-[18px]" : "text-[22px]"} leading-none`}
      >
        {tipo.emoji}
      </span>
      {o.etiqueta || tipo.nombre}
    </button>
  );
});

/* ------------------------------------------------------------------ */
/*  Plano base                                                         */
/* ------------------------------------------------------------------ */

type Arrastre = {
  tipo: "mesa" | "objeto";
  id: string;
  moved: boolean;
  startX: number;
  startY: number;
  pos: Pos | null;
};

export function PlanoBase({
  tituloSector,
  orientacion,
  mesas,
  objetos = [],
  userId,
  modoEditor = false,
  modoSeleccion = false,
  todasLasMesas,
  iman = true,
  mesaSeleccionadaId = null,
  objetoSeleccionadoId = null,
  onClickPlano,
  onClickMesa,
  onClickObjeto,
  onMoverMesa,
  onMoverObjeto,
}: {
  tituloSector: string;
  orientacion: "horizontal" | "vertical";
  mesas: MesaPlanoItem[];
  objetos?: ObjetoPlano[];
  userId?: string;
  modoEditor?: boolean;
  /** Resalta la mesa seleccionada sin activar el modo diseño (ej. modo unir) */
  modoSeleccion?: boolean;
  /** Todas las mesas (de todos los sectores) para detectar grupos unidos */
  todasLasMesas?: MesaPlanoItem[];
  iman?: boolean;
  mesaSeleccionadaId?: string | null;
  objetoSeleccionadoId?: string | null;
  /** Se llama con la posición ya ajustada (imán + límites) en % */
  onClickPlano: (xPct: number, yPct: number) => void;
  onClickMesa: (mesa: MesaPlanoItem) => void;
  onClickObjeto?: (objeto: ObjetoPlano) => void;
  onMoverMesa?: (id: string, pos: Pos) => void;
  onMoverObjeto?: (id: string, pos: Pos) => void;
}) {
  const areaRef = useRef<HTMLDivElement>(null);
  const cajaRef = useRef<HTMLDivElement>(null);
  const arrastre = useRef<Arrastre | null>(null);

  const [zi, setZi] = useState(0);
  const [ancho, setAncho] = useState(0);

  const movil = ancho > 0 && ancho < ANCHO_MOVIL;
  const { w, h } = (movil ? LIENZO_MOVIL : LIENZO)[orientacion];

  // Mide el ancho disponible y escala el lienzo para que quepa
  useEffect(() => {
    const el = cajaRef.current;
    if (!el) return;
    const medir = () => setAncho(el.clientWidth);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const ajuste = ancho ? Math.min(ancho / w, ESCALA_MAX_AJUSTE) : 0.5;
  const escala = ajuste * ZOOMS[zi];

  const propsRef = useRef({
    iman,
    onClickMesa,
    onClickObjeto,
    onMoverMesa,
    onMoverObjeto,
  });
  propsRef.current = {
    iman,
    onClickMesa,
    onClickObjeto,
    onMoverMesa,
    onMoverObjeto,
  };

  // El rect del lienzo ya viene escalado, por eso el % sale bien
  const calcPos = useCallback((cx: number, cy: number): Pos | null => {
    const el = areaRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    let x = ((cx - r.left) / r.width) * 100;
    let y = ((cy - r.top) / r.height) * 100;
    if (propsRef.current.iman) {
      x = redondear(x, PASO_IMAN);
      y = redondear(y, PASO_IMAN);
    }
    return clampPos({ x, y });
  }, []);

  const crearManejadores = useCallback(
    (tipo: "mesa" | "objeto", id: string): ManejadoresArrastre => ({
      onIniciar: (e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        arrastre.current = {
          tipo,
          id,
          moved: false,
          startX: e.clientX,
          startY: e.clientY,
          pos: null,
        };
      },
      onMover: (e) => {
        const a = arrastre.current;
        if (!a) return;
        if (
          !a.moved &&
          Math.abs(e.clientX - a.startX) < 5 &&
          Math.abs(e.clientY - a.startY) < 5
        ) {
          return;
        }
        a.moved = true;
        const pos = calcPos(e.clientX, e.clientY);
        if (!pos) return;
        a.pos = pos;
        e.currentTarget.style.left = `${pos.x}%`;
        e.currentTarget.style.top = `${pos.y}%`;
      },
      onTerminar: (e) => {
        const a = arrastre.current;
        arrastre.current = null;
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          /* ya liberado */
        }
        if (a?.moved && a.pos) {
          if (a.tipo === "mesa") propsRef.current.onMoverMesa?.(a.id, a.pos);
          else propsRef.current.onMoverObjeto?.(a.id, a.pos);
        }
      },
    }),
    [calcPos],
  );

  const manejadoresMesa = useRef<Record<string, ManejadoresArrastre>>({});
  const manejadoresObjeto = useRef<Record<string, ManejadoresArrastre>>({});
  const manejadorDe = (tipo: "mesa" | "objeto", id: string) => {
    const cache = tipo === "mesa" ? manejadoresMesa : manejadoresObjeto;
    return (cache.current[id] ??= crearManejadores(tipo, id));
  };

  const clickMesa = useCallback(
    (m: MesaPlanoItem) => propsRef.current.onClickMesa(m),
    [],
  );
  const clickObjeto = useCallback(
    (o: ObjetoPlano) => propsRef.current.onClickObjeto?.(o),
    [],
  );

  function handlePlanoClick(e: MouseEvent<HTMLDivElement>) {
    if (!modoEditor || (!mesaSeleccionadaId && !objetoSeleccionadoId)) return;
    const pos = calcPos(e.clientX, e.clientY);
    if (pos) onClickPlano(pos.x, pos.y);
  }

  // Grupos de mesas unidas: id de mesa -> "3+2" (principal primero)
  const grupos = useMemo(() => {
    const todas = todasLasMesas ?? mesas;
    const texto = new Map<string, string>();
    const cabezas = new Set<string>();
    todas.forEach((m) => {
      if (m.unida_con_id) cabezas.add(m.unida_con_id);
    });
    cabezas.forEach((cid) => {
      const miembros = todas.filter(
        (m) => m.id === cid || m.unida_con_id === cid,
      );
      if (miembros.length < 2) return;
      const cabeza = miembros.find((m) => m.id === cid);
      const resto = miembros
        .filter((m) => m.id !== cid)
        .sort((a, b) => a.numero - b.numero);
      const nums = [...(cabeza ? [cabeza] : []), ...resto].map((m) => m.numero);
      const t = nums.join("+");
      miembros.forEach((m) => texto.set(m.id, t));
    });
    return texto;
  }, [todasLasMesas, mesas]);

  // Líneas que conectan visualmente las mesas unidas
  const lineas = mesas
    .filter((m) => m.unida_con_id)
    .flatMap((m) => {
      const cab = mesas.find((h) => h.id === m.unida_con_id);
      return cab ? [{ id: m.id, a: posDe(cab), b: posDe(m) }] : [];
    });

  const hayObjetos = objetos.length > 0;
  const hayAlgo = mesas.length > 0 || hayObjetos;
  const editando =
    (modoEditor || modoSeleccion) &&
    (mesaSeleccionadaId || objetoSeleccionadoId);

  const btnZoom =
    "grid h-9 w-9 place-items-center rounded-xl border border-white/15 bg-stone-800 text-lg font-black text-white active:bg-amber-400 active:text-stone-950 disabled:opacity-35";

  return (
    <div
      className={`rounded-3xl border bg-stone-950 p-2 ${
        orientacion === "vertical" ? "mx-auto w-full max-w-md" : "w-full"
      } ${editando ? "border-amber-400/70" : "border-white/10"}`}
    >
      {/* Barra: sector + zoom (fuera del lienzo, siempre del mismo tamaño) */}
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <span className="truncate rounded-lg border border-white/10 bg-stone-900 px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-stone-300">
          📍 {tituloSector}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label="Alejar"
            disabled={zi === 0}
            onClick={() => setZi((v) => Math.max(0, v - 1))}
            className={btnZoom}
          >
            −
          </button>
          <span className="w-10 text-center text-[11px] font-bold text-stone-400">
            {Math.round(ZOOMS[zi] * 100)}%
          </span>
          <button
            type="button"
            aria-label="Acercar"
            disabled={zi === ZOOMS.length - 1}
            onClick={() => setZi((v) => Math.min(ZOOMS.length - 1, v + 1))}
            className={btnZoom}
          >
            +
          </button>
        </div>
      </div>

      {/* Zona con desplazamiento (se mueve con el dedo si hay zoom) */}
      <div
        ref={cajaRef}
        className="max-h-[78vh] overflow-auto overscroll-contain rounded-2xl [scrollbar-gutter:stable] sm:max-h-[68vh]"
      >
        <div
          style={{ width: w * escala, height: h * escala }}
          className="mx-auto"
        >
          <div
            ref={areaRef}
            onClick={handlePlanoClick}
            style={{
              width: w,
              height: h,
              transform: `scale(${escala})`,
              transformOrigin: "top left",
            }}
            className="relative select-none overflow-hidden rounded-2xl bg-stone-900/40"
          >
            {/* Cuadrícula guía: solo al diseñar */}
            {modoEditor && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-25"
                style={{
                  backgroundImage:
                    "linear-gradient(to right, rgba(255,255,255,0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.12) 1px, transparent 1px)",
                  backgroundSize: `${PASO_IMAN * 2}% ${PASO_IMAN * 2}%`,
                }}
              />
            )}

            {/* Rótulos de relleno mientras no haya objetos reales */}
            {!hayObjetos && (
              <div className="pointer-events-none absolute inset-x-3 top-2 flex items-center justify-between text-[14px] font-bold uppercase tracking-wider text-stone-500">
                <span className="rounded-lg border border-white/5 bg-stone-900 px-2 py-1">
                  🚪 Entrada
                </span>
                <span className="rounded-lg border border-amber-400/20 bg-amber-400/5 px-2 py-1 text-amber-300/80">
                  🔥 Cocina
                </span>
                <span className="rounded-lg border border-white/5 bg-stone-900 px-2 py-1">
                  💰 Caja
                </span>
              </div>
            )}

            {!hayAlgo && (
              <div className="absolute inset-0 grid place-items-center px-6 text-center">
                <div>
                  <p className="text-[20px] font-bold text-stone-300">
                    Aún no hay mesas en {tituloSector}
                  </p>
                  <p className="mt-1 text-[15px] text-stone-500">
                    {modoEditor
                      ? "Toca «+ Mesa» para agregar y ubicar mesas aquí."
                      : "Sin mesas habilitadas en este sector."}
                  </p>
                </div>
              </div>
            )}

            {lineas.length > 0 && (
              <svg
                aria-hidden
                className="pointer-events-none absolute inset-0 z-[1]"
                width={w}
                height={h}
              >
                {lineas.map((l) => (
                  <line
                    key={l.id}
                    x1={(l.a.x / 100) * w}
                    y1={(l.a.y / 100) * h}
                    x2={(l.b.x / 100) * w}
                    y2={(l.b.y / 100) * h}
                    stroke="#818cf8"
                    strokeWidth={6}
                    strokeDasharray="14 9"
                    strokeLinecap="round"
                    opacity={0.9}
                  />
                ))}
              </svg>
            )}

            {objetos.map((o) => {
              const p = posDe(o);
              const sel = modoEditor && objetoSeleccionadoId === o.id;
              return (
                <ObjetoBoton
                  key={o.id}
                  objeto={o}
                  x={p.x}
                  y={p.y}
                  editable={modoEditor}
                  compacto={movil}
                  seleccionado={sel}
                  arrastrable={sel && !!onMoverObjeto}
                  onClick={clickObjeto}
                  arrastre={manejadorDe("objeto", o.id)}
                />
              );
            })}

            {mesas.map((m) => {
              const p = posDe(m);
              const sel =
                (modoEditor || modoSeleccion) && mesaSeleccionadaId === m.id;
              return (
                <MesaBoton
                  key={m.id}
                  mesa={m}
                  x={p.x}
                  y={p.y}
                  userId={userId}
                  grupo={grupos.get(m.id) ?? null}
                  compacto={movil}
                  seleccionada={sel}
                  arrastrable={modoEditor && sel && !!onMoverMesa}
                  onClick={clickMesa}
                  arrastre={manejadorDe("mesa", m.id)}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
