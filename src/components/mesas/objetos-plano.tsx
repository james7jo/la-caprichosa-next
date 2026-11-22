"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  crearObjetoPlano,
  editarObjetoPlano,
  eliminarObjetoPlano,
  moverObjetoPlano,
} from "@/actions/objetos-plano.actions";
import {
  PASO_IMAN,
  TIPOS_OBJETO,
  clampPos,
  redondear,
  type ObjetoPlano,
  type ObjetoTipo,
  type Pos,
} from "./plano-base";

/* ------------------------------------------------------------------ */
/*  Hook: carga, crea, mueve, renombra y elimina objetos de un sector  */
/* ------------------------------------------------------------------ */

function posLibre(existentes: ObjetoPlano[]): Pos {
  const xs = [15, 35, 50, 65, 85];
  const ys = [15, 35, 55, 75, 88];
  for (const y of ys) {
    for (const x of xs) {
      const ocupado = existentes.some(
        (o) =>
          Math.abs(Number(o.pos_x) - x) < 16 &&
          Math.abs(Number(o.pos_y) - y) < 12,
      );
      if (!ocupado) return { x, y };
    }
  }
  return { x: 50, y: 50 };
}

export function useObjetosPlano(
  zona: string,
  opciones?: { alSeleccionar?: () => void },
) {
  const [todos, setTodos] = useState<ObjetoPlano[]>([]);
  const [local, setLocal] = useState<Record<string, Pos>>({});
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const versiones = useRef<Record<string, number>>({});
  const alSeleccionarRef = useRef(opciones?.alSeleccionar);
  alSeleccionarRef.current = opciones?.alSeleccionar;

  const cargar = useCallback(async () => {
    const supabase = createClient();
    const { data, error: err } = await supabase
      .from("plano_objetos")
      .select("id, zona, tipo, etiqueta, pos_x, pos_y")
      .order("creado_en", { ascending: true });
    if (err) {
      setError(err.message);
      return;
    }
    setTodos((data ?? []) as ObjetoPlano[]);
  }, []);

  useEffect(() => {
    cargar();
    const supabase = createClient();
    const canal = supabase
      .channel(`plano-objetos-${zona}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "plano_objetos" },
        cargar,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [cargar, zona]);

  // Objetos de este sector, con la posición local (optimista) encima
  const objetos = useMemo(
    () =>
      todos
        .filter((o) => o.zona === zona)
        .map((o) =>
          local[o.id]
            ? { ...o, pos_x: local[o.id].x, pos_y: local[o.id].y }
            : o,
        ),
    [todos, zona, local],
  );

  const seleccionado = objetos.find((o) => o.id === seleccionadoId) ?? null;

  const seleccionar = useCallback((id: string | null) => {
    setSeleccionadoId(id);
    if (id) alSeleccionarRef.current?.();
  }, []);

  const soltarLocal = useCallback((id: string) => {
    setLocal((p) => {
      if (!(id in p)) return p;
      const { [id]: _quitado, ...resto } = p;
      return resto;
    });
  }, []);

  // Mueve al instante en pantalla y guarda una sola vez (con retraso)
  const mover = useCallback(
    (id: string, pos: Pos, demora = 400) => {
      setLocal((p) => ({ ...p, [id]: pos }));
      clearTimeout(timers.current[id]);
      const version = (versiones.current[id] ?? 0) + 1;
      versiones.current[id] = version;

      timers.current[id] = setTimeout(async () => {
        try {
          const res = await moverObjetoPlano(id, pos.x, pos.y);
          if (res?.error) {
            setError(res.error);
          } else {
            setTodos((p) =>
              p.map((o) =>
                o.id === id ? { ...o, pos_x: pos.x, pos_y: pos.y } : o,
              ),
            );
          }
        } catch {
          setError("No se pudo guardar. Revisa tu conexión.");
        }
        if (versiones.current[id] === version) soltarLocal(id);
      }, demora);
    },
    [soltarLocal],
  );

  const moverPaso = useCallback(
    (dx: number, dy: number, iman: boolean) => {
      if (!seleccionado) return;
      const paso = iman ? PASO_IMAN : 1;
      let x = Number(seleccionado.pos_x) + dx * paso;
      let y = Number(seleccionado.pos_y) + dy * paso;
      if (iman) {
        x = redondear(x, PASO_IMAN);
        y = redondear(y, PASO_IMAN);
      }
      mover(seleccionado.id, clampPos({ x, y }));
    },
    [seleccionado, mover],
  );

  const crear = useCallback(
    async (tipo: ObjetoTipo) => {
      setError(null);
      const etiqueta = TIPOS_OBJETO[tipo].nombre;
      const pos = posLibre(objetos);
      const res = await crearObjetoPlano({
        zona,
        tipo,
        etiqueta,
        posX: pos.x,
        posY: pos.y,
      });
      if (res.error || !res.id) {
        setError(res.error ?? "No se pudo crear el objeto.");
        return;
      }
      const nuevo: ObjetoPlano = {
        id: res.id,
        zona,
        tipo,
        etiqueta,
        pos_x: pos.x,
        pos_y: pos.y,
      };
      setTodos((p) => [...p, nuevo]);
      seleccionar(res.id);
    },
    [objetos, zona, seleccionar],
  );

  const editarEtiqueta = useCallback(async (id: string, etiqueta: string) => {
    setError(null);
    const res = await editarObjetoPlano(id, etiqueta);
    if (res?.error) {
      setError(res.error);
      return;
    }
    setTodos((p) => p.map((o) => (o.id === id ? { ...o, etiqueta } : o)));
  }, []);

  const eliminar = useCallback(async (id: string) => {
    setError(null);
    const res = await eliminarObjetoPlano(id);
    if (res?.error) {
      setError(res.error);
      return;
    }
    setTodos((p) => p.filter((o) => o.id !== id));
    setSeleccionadoId(null);
  }, []);

  return {
    objetos,
    seleccionado,
    seleccionadoId,
    seleccionar,
    crear,
    mover,
    moverPaso,
    editarEtiqueta,
    eliminar,
    error,
    limpiarError: () => setError(null),
  };
}

/* ------------------------------------------------------------------ */
/*  Barra del editor: paleta de objetos + panel del objeto elegido     */
/* ------------------------------------------------------------------ */

export function BarraObjetos({
  api,
  iman,
  zona,
}: {
  api: ReturnType<typeof useObjetosPlano>;
  iman: boolean;
  zona: string;
}) {
  const { seleccionado } = api;
  const [nombre, setNombre] = useState("");
  const [confirmar, setConfirmar] = useState(false);

  useEffect(() => {
    setNombre(seleccionado?.etiqueta ?? "");
    setConfirmar(false);
  }, [seleccionado?.id, seleccionado?.etiqueta]);

  const flechaCls =
    "grid h-12 w-12 place-items-center rounded-xl border border-white/15 bg-stone-800 text-xl font-black text-white active:bg-amber-400 active:text-stone-950";

  const tipos = Object.entries(TIPOS_OBJETO) as [
    ObjetoTipo,
    (typeof TIPOS_OBJETO)[ObjetoTipo],
  ][];

  return (
    <div className="space-y-2">
      {api.error && (
        <div className="flex items-start justify-between gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-200">
          <span>{api.error}</span>
          <button type="button" onClick={api.limpiarError} aria-label="Cerrar">
            ✕
          </button>
        </div>
      )}

      <div className="rounded-3xl border border-white/10 bg-stone-900/80 p-3">
        <p className="text-[11px] font-extrabold uppercase tracking-wider text-violet-300">
          Objetos del plano · {zona}
        </p>
        <p className="mt-0.5 text-[11px] text-stone-400">
          Agrega puerta, caja, cocina… para que los meseros se ubiquen.
        </p>
        <div className="-mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-1">
          {tipos.map(([tipo, def]) => (
            <button
              key={tipo}
              type="button"
              onClick={() => api.crear(tipo)}
              className={`h-11 shrink-0 whitespace-nowrap rounded-xl border px-3 text-xs font-bold ${def.clase}`}
            >
              + {def.emoji} {def.nombre}
            </button>
          ))}
        </div>
      </div>

      {seleccionado && (
        <>
          <div className="h-64 sm:hidden" />
          <div className="fixed inset-x-2 bottom-[5.5rem] z-40 max-h-[55vh] overflow-y-auto rounded-3xl border border-violet-400/40 bg-stone-900 p-3 shadow-2xl sm:static sm:inset-x-auto sm:max-h-none sm:rounded-3xl sm:border sm:p-4 sm:shadow-none">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-extrabold uppercase tracking-wider text-violet-300">
                {TIPOS_OBJETO[seleccionado.tipo]?.emoji}{" "}
                {TIPOS_OBJETO[seleccionado.tipo]?.nombre}
              </p>
              <button
                type="button"
                onClick={() => api.seleccionar(null)}
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
                  onClick={() => api.moverPaso(0, -1, iman)}
                  className={flechaCls}
                >
                  ↑
                </button>
                <span />
                <button
                  type="button"
                  aria-label="Izquierda"
                  onClick={() => api.moverPaso(-1, 0, iman)}
                  className={flechaCls}
                >
                  ←
                </button>
                <button
                  type="button"
                  aria-label="Bajar"
                  onClick={() => api.moverPaso(0, 1, iman)}
                  className={flechaCls}
                >
                  ↓
                </button>
                <button
                  type="button"
                  aria-label="Derecha"
                  onClick={() => api.moverPaso(1, 0, iman)}
                  className={flechaCls}
                >
                  →
                </button>
              </div>

              <div className="flex flex-1 flex-col gap-2">
                <input
                  value={nombre}
                  maxLength={24}
                  onChange={(e) => setNombre(e.target.value)}
                  onBlur={() => {
                    const limpio = nombre.trim();
                    if (limpio && limpio !== seleccionado.etiqueta) {
                      api.editarEtiqueta(seleccionado.id, limpio);
                    }
                  }}
                  placeholder="Nombre en el plano"
                  className="h-11 w-full rounded-xl border border-white/10 bg-stone-950 px-3 text-base text-white sm:text-sm"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!confirmar) {
                      setConfirmar(true);
                      return;
                    }
                    api.eliminar(seleccionado.id);
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
          </div>
        </>
      )}
    </div>
  );
}
