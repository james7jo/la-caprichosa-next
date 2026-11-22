"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  crearMesa,
  editarMesa,
  eliminarMesa,
  guardarPosicionMesa,
  toggleZonaHabilitada,
} from "@/actions/ventas-mesas.actions";
import { PASO_IMAN, clampPos, redondear, type Pos } from "./plano-base";
import { CroquisSector, type CroquisSectorProps } from "./croquis-sector";
import { CroquisSalonPrincipal } from "./croquis-salon-principal";
import { CroquisJardin } from "./croquis-jardin";
import { CroquisHamburgueseria } from "./croquis-hamburgueseria";
import { CroquisGaraje } from "./croquis-garaje";
import {
  PanelMesaSeleccionada,
  PanelNuevaMesa,
  type DatosMesaEditada,
  type DatosMesaNueva,
} from "./editor-mesa-panel";

export type MesaCroquis = {
  id: string;
  numero: number;
  nombre?: string | null;
  zona: string;
  capacidad: number;
  estado: "disponible" | "ocupada" | "sucia";
  habilitada: boolean;
  solo_fin_de_semana?: boolean;
  mesero_actual_id?: string | null;
  pos_x?: number | null;
  pos_y?: number | null;
};

// El nombre debe ser IDÉNTICO al valor guardado en mesas.zona
const SECTORES_BASE = ["Salón Principal", "Jardín", "Hamburguesería", "Garaje"];

const COMPONENTES: Record<string, (p: CroquisSectorProps) => React.ReactNode> =
  {
    "Salón Principal": CroquisSalonPrincipal,
    Jardín: CroquisJardin,
    Hamburguesería: CroquisHamburgueseria,
    Garaje: CroquisGaraje,
  };

export function CroquisSalon({
  mesas,
  userId,
  esAdmin = false,
  onTocarMesaOperacion,
  onActualizado,
}: {
  mesas: MesaCroquis[];
  userId?: string;
  esAdmin?: boolean;
  onTocarMesaOperacion?: (mesa: MesaCroquis) => void;
  onActualizado?: () => Promise<void> | void;
}) {
  const router = useRouter();

  const sectores = useMemo(
    () =>
      Array.from(
        new Set([
          ...SECTORES_BASE,
          ...mesas.map((m) => m.zona).filter(Boolean),
        ]),
      ),
    [mesas],
  );

  const [sectorActivo, setSectorActivo] = useState<string>(sectores[0]);
  const [modoEditor, setModoEditor] = useState(esAdmin && mesas.length === 0);
  const [mesaSeleccionadaId, setMesaSeleccionadaId] = useState<string | null>(
    null,
  );
  const [iman, setIman] = useState(true);
  const [verNuevaMesa, setVerNuevaMesa] = useState(false);
  const [posLocal, setPosLocal] = useState<Record<string, Pos>>({});
  const [aviso, setAviso] = useState<{
    tipo: "ok" | "error";
    texto: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  const onActualizadoRef = useRef(onActualizado);
  onActualizadoRef.current = onActualizado;

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 3500);
    return () => clearTimeout(t);
  }, [aviso]);

  const refrescar = useCallback(async () => {
    if (onActualizadoRef.current) await onActualizadoRef.current();
    else router.refresh();
  }, [router]);

  // Mesas del sector con la posición optimista encima. Solo cambia el
  // objeto de la mesa movida, así el resto no se redibuja.
  const mesasSector = useMemo(
    () =>
      mesas
        .filter((m) => m.zona === sectorActivo && (esAdmin || m.habilitada))
        .map((m) =>
          posLocal[m.id]
            ? { ...m, pos_x: posLocal[m.id].x, pos_y: posLocal[m.id].y }
            : m,
        ),
    [mesas, sectorActivo, esAdmin, posLocal],
  );

  const sectorTieneHabilitadas = mesas
    .filter((m) => m.zona === sectorActivo)
    .some((m) => m.habilitada);

  const siguienteNumero = useMemo(
    () => Math.max(0, ...mesas.map((m) => Number(m.numero) || 0)) + 1,
    [mesas],
  );

  const mesaEditando = mesas.find((m) => m.id === mesaSeleccionadaId) ?? null;

  /* -------------------- posición: mover y guardar -------------------- */

  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const versiones = useRef<Record<string, number>>({});

  const soltarLocal = useCallback((id: string) => {
    setPosLocal((p) => {
      if (!(id in p)) return p;
      const { [id]: _quitada, ...resto } = p;
      return resto;
    });
  }, []);

  const guardarPos = useCallback(
    (id: string, pos: Pos, demora = 400) => {
      setPosLocal((p) => ({ ...p, [id]: pos }));
      clearTimeout(timers.current[id]);
      const version = (versiones.current[id] ?? 0) + 1;
      versiones.current[id] = version;

      timers.current[id] = setTimeout(async () => {
        try {
          const res = await guardarPosicionMesa(id, pos.x, pos.y);
          if (res?.error) {
            setAviso({ tipo: "error", texto: res.error });
            soltarLocal(id);
            return;
          }
          if (onActualizadoRef.current) await onActualizadoRef.current();
        } catch {
          setAviso({
            tipo: "error",
            texto: "No se pudo guardar la ubicación. Revisa tu conexión.",
          });
        }
        if (versiones.current[id] === version) soltarLocal(id);
      }, demora);
    },
    [soltarLocal],
  );

  function moverPaso(dx: number, dy: number) {
    if (!mesaEditando) return;
    const actual = posLocal[mesaEditando.id] ?? {
      x: Number(mesaEditando.pos_x ?? 50),
      y: Number(mesaEditando.pos_y ?? 50),
    };
    const paso = iman ? PASO_IMAN : 1;
    let x = actual.x + dx * paso;
    let y = actual.y + dy * paso;
    if (iman) {
      x = redondear(x, PASO_IMAN);
      y = redondear(y, PASO_IMAN);
    }
    guardarPos(mesaEditando.id, clampPos({ x, y }));
  }

  // Busca un lugar libre para que la mesa nueva no se encime
  function posLibre(): Pos {
    const xs = [20, 40, 60, 80];
    const ys = [18, 38, 58, 78];
    for (const y of ys) {
      for (const x of xs) {
        const ocupado = mesasSector.some(
          (m) =>
            Math.abs(Number(m.pos_x ?? 50) - x) < 15 &&
            Math.abs(Number(m.pos_y ?? 50) - y) < 16,
        );
        if (!ocupado) return { x, y };
      }
    }
    return { x: 50, y: 50 };
  }

  /* ------------------------------ acciones ------------------------------ */

  function handleCrearMesa(d: DatosMesaNueva) {
    setAviso(null);
    if (d.numero <= 0) {
      setAviso({ tipo: "error", texto: "Escribe un número de mesa válido." });
      return;
    }
    const { x, y } = posLibre();
    startTransition(async () => {
      const res = await crearMesa({
        numero: d.numero,
        nombre: d.nombre || `Mesa ${d.numero}`,
        zona: sectorActivo,
        capacidad: d.capacidad,
        habilitada: !d.soloFinDeSemana,
        soloFinDeSemana: d.soloFinDeSemana,
        posX: x,
        posY: y,
      });
      if (res?.error) {
        setAviso({ tipo: "error", texto: res.error });
        return;
      }
      setAviso({
        tipo: "ok",
        texto: `Mesa ${d.numero} agregada. Tócala en el plano para moverla.`,
      });
      await refrescar();
    });
  }

  function handleGuardarEdicion(d: DatosMesaEditada) {
    if (!mesaEditando) return;
    startTransition(async () => {
      const res = await editarMesa(mesaEditando.id, {
        numero: d.numero,
        nombre: d.nombre || `Mesa ${d.numero}`,
        zona: d.zona,
        capacidad: d.capacidad,
        habilitada: mesaEditando.habilitada,
        soloFinDeSemana: d.soloFinDeSemana,
      });
      if (res?.error) {
        setAviso({ tipo: "error", texto: res.error });
        return;
      }
      setAviso({ tipo: "ok", texto: "Cambios guardados." });
      await refrescar();
    });
  }

  function handleToggleHabilitada() {
    if (!mesaEditando) return;
    startTransition(async () => {
      const res = await editarMesa(mesaEditando.id, {
        numero: mesaEditando.numero,
        nombre: mesaEditando.nombre || `Mesa ${mesaEditando.numero}`,
        zona: mesaEditando.zona,
        capacidad: mesaEditando.capacidad,
        habilitada: !mesaEditando.habilitada,
        soloFinDeSemana: Boolean(mesaEditando.solo_fin_de_semana),
      });
      if (res?.error) {
        setAviso({ tipo: "error", texto: res.error });
        return;
      }
      await refrescar();
    });
  }

  function handleEliminarMesa() {
    if (!mesaEditando) return;
    startTransition(async () => {
      const res = await eliminarMesa(mesaEditando.id);
      if (res?.error) {
        setAviso({ tipo: "error", texto: res.error });
        return;
      }
      setMesaSeleccionadaId(null);
      setAviso({ tipo: "ok", texto: "Mesa eliminada." });
      await refrescar();
    });
  }

  /* -------------------------------- vista -------------------------------- */

  const propsSector: CroquisSectorProps = {
    mesas: mesasSector,
    userId,
    modoEditor,
    todasLasMesas: mesas,
    mesaSeleccionadaId,
    iman,
    onClickPlano: (x, y) => {
      if (mesaSeleccionadaId) guardarPos(mesaSeleccionadaId, { x, y }, 150);
    },
    onClickMesa: (m) => {
      if (modoEditor) {
        setMesaSeleccionadaId(m.id);
        return;
      }
      const original = mesas.find((x) => x.id === m.id);
      if (original) onTocarMesaOperacion?.(original);
    },
    onMoverMesa: (id, pos) => guardarPos(id, pos, 150),
    onObjetoSeleccionado: () => setMesaSeleccionadaId(null),
  };

  const ComponenteSector = COMPONENTES[sectorActivo];

  return (
    <div className="space-y-3">
      {aviso && (
        <div
          role="status"
          className={`rounded-2xl border px-4 py-3 text-xs font-bold ${
            aviso.tipo === "ok"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              : "border-rose-500/30 bg-rose-500/10 text-rose-200"
          }`}
        >
          {aviso.texto}
        </div>
      )}

      {/* Sectores (deslizables en celular) */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {sectores.map((sec) => {
          const count = mesas.filter((m) => m.zona === sec).length;
          return (
            <button
              key={sec}
              type="button"
              onClick={() => {
                setSectorActivo(sec);
                setMesaSeleccionadaId(null);
              }}
              className={`h-10 shrink-0 whitespace-nowrap rounded-full px-4 text-xs font-extrabold ${
                sectorActivo === sec
                  ? "bg-amber-400 text-stone-950"
                  : "border border-white/10 bg-stone-900 text-stone-300"
              }`}
            >
              {sec} ({count})
            </button>
          );
        })}
      </div>

      {/* Controles del Jefe */}
      {esAdmin && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setModoEditor((v) => !v);
              setMesaSeleccionadaId(null);
              setVerNuevaMesa(false);
            }}
            className={`h-11 flex-1 rounded-xl px-4 text-xs font-black sm:flex-none ${
              modoEditor
                ? "bg-amber-400 text-stone-950"
                : "border border-amber-400/40 bg-amber-400/15 text-amber-300"
            }`}
          >
            {modoEditor ? "✓ Terminar diseño" : "✏️ Diseñar croquis"}
          </button>

          {modoEditor && (
            <>
              <button
                type="button"
                onClick={() => setVerNuevaMesa((v) => !v)}
                className="h-11 flex-1 rounded-xl border border-sky-400/40 bg-sky-400/10 px-4 text-xs font-black text-sky-300 sm:flex-none"
              >
                {verNuevaMesa ? "Cerrar" : "+ Mesa"}
              </button>
              <button
                type="button"
                onClick={() => setIman((v) => !v)}
                className={`h-11 rounded-xl border px-3 text-xs font-bold ${
                  iman
                    ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
                    : "border-white/10 bg-stone-900 text-stone-400"
                }`}
              >
                🧲 Imán {iman ? "ON" : "OFF"}
              </button>
            </>
          )}

          {!modoEditor && mesas.some((m) => m.zona === sectorActivo) && (
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  await toggleZonaHabilitada(
                    sectorActivo,
                    !sectorTieneHabilitadas,
                  );
                  await refrescar();
                })
              }
              className={`h-11 rounded-xl border px-3 text-xs font-bold ${
                sectorTieneHabilitadas
                  ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                  : "border-stone-600 bg-stone-900 text-stone-400"
              }`}
            >
              {sectorTieneHabilitadas
                ? "🟢 Sector abierto"
                : "⚫ Sector cerrado"}
            </button>
          )}
        </div>
      )}

      {esAdmin && modoEditor && verNuevaMesa && (
        <PanelNuevaMesa
          sector={sectorActivo}
          siguienteNumero={siguienteNumero}
          ocupado={isPending}
          onCrear={handleCrearMesa}
        />
      )}

      {esAdmin && modoEditor && !mesaEditando && (
        <p className="rounded-2xl border border-dashed border-white/10 px-3 py-2 text-center text-xs text-stone-400">
          Toca una mesa u objeto para seleccionarlo. Luego arrástralo, usa las
          flechas o toca el lugar del plano donde va.
        </p>
      )}

      {/* Plano del sector (incluye objetos y su barra de edición) */}
      {ComponenteSector ? (
        <ComponenteSector {...propsSector} />
      ) : (
        <CroquisSector
          {...propsSector}
          zona={sectorActivo}
          orientacion="vertical"
        />
      )}

      {esAdmin && modoEditor && mesaEditando && (
        <PanelMesaSeleccionada
          key={mesaEditando.id}
          mesa={mesaEditando}
          sectores={sectores}
          ocupado={isPending}
          onMover={moverPaso}
          onToggleHabilitada={handleToggleHabilitada}
          onGuardar={handleGuardarEdicion}
          onEliminar={handleEliminarMesa}
          onCerrar={() => setMesaSeleccionadaId(null)}
        />
      )}
    </div>
  );
}
