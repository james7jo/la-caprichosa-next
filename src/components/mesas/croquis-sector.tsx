"use client";

import { PlanoBase, type MesaPlanoItem, type Pos } from "./plano-base";
import { BarraObjetos, useObjetosPlano } from "./objetos-plano";

export type CroquisSectorProps = {
  mesas: MesaPlanoItem[];
  userId?: string;
  modoEditor?: boolean;
  /** Resalta la selección sin activar el modo diseño (ej. modo unir) */
  modoSeleccion?: boolean;
  /** Todas las mesas de todos los sectores (para detectar grupos unidos) */
  todasLasMesas?: MesaPlanoItem[];
  mesaSeleccionadaId?: string | null;
  /** Cuadrícula magnética (por defecto activada) */
  iman?: boolean;
  /** Posición ya ajustada al imán y a los límites, en % */
  onClickPlano: (xPct: number, yPct: number) => void;
  onClickMesa: (mesa: MesaPlanoItem) => void;
  /** Se llama UNA vez al soltar una mesa arrastrada */
  onMoverMesa?: (id: string, pos: Pos) => void;
  /** Se llama cuando se selecciona un objeto (para deseleccionar la mesa) */
  onObjetoSeleccionado?: () => void;
};

/**
 * Lógica común de un sector: plano + objetos identificadores
 * (puerta, caja, cocina...) + barra de edición de objetos.
 * Los 4 croquis solo cambian la zona y la orientación.
 */
export function CroquisSector({
  zona,
  orientacion,
  mesas,
  userId,
  modoEditor = false,
  modoSeleccion = false,
  todasLasMesas,
  mesaSeleccionadaId = null,
  iman = true,
  onClickPlano,
  onClickMesa,
  onMoverMesa,
  onObjetoSeleccionado,
}: CroquisSectorProps & {
  zona: string;
  orientacion: "horizontal" | "vertical";
}) {
  const objetosApi = useObjetosPlano(zona, {
    alSeleccionar: onObjetoSeleccionado,
  });

  return (
    <div className="space-y-3">
      <PlanoBase
        tituloSector={zona}
        orientacion={orientacion}
        mesas={mesas}
        objetos={objetosApi.objetos}
        userId={userId}
        modoEditor={modoEditor}
        modoSeleccion={modoSeleccion}
        todasLasMesas={todasLasMesas}
        iman={iman}
        mesaSeleccionadaId={mesaSeleccionadaId}
        objetoSeleccionadoId={objetosApi.seleccionadoId}
        onClickMesa={(m) => {
          objetosApi.seleccionar(null);
          onClickMesa(m);
        }}
        onClickObjeto={(o) => objetosApi.seleccionar(o.id)}
        onMoverMesa={onMoverMesa}
        onMoverObjeto={(id, pos) => objetosApi.mover(id, pos, 150)}
        onClickPlano={(x, y) => {
          if (objetosApi.seleccionadoId) {
            objetosApi.mover(objetosApi.seleccionadoId, { x, y }, 150);
          } else {
            onClickPlano(x, y);
          }
        }}
      />

      {modoEditor && <BarraObjetos api={objetosApi} iman={iman} zona={zona} />}
    </div>
  );
}
