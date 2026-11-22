// Utilidades de fechas (hora de Bolivia, UTC-4 fija) y formatos para reportes

export const ZONA_BO = "America/La_Paz";
const OFFSET_BO = "-04:00";

export type PresetRango =
  | "hoy"
  | "ayer"
  | "3h"
  | "semana"
  | "mes"
  | "personalizado";

/** Rango en ISO con offset de Bolivia, ej. 2026-11-21T00:00:00-04:00 */
export type Rango = { desde: string; hasta: string };

function partes(d: Date) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_BO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const o: Record<string, string> = {};
  f.formatToParts(d).forEach((p) => {
    if (p.type !== "literal") o[p.type] = p.value;
  });
  return o;
}

/** YYYY-MM-DD en Bolivia */
export function fechaBo(d?: Date): string {
  const p = partes(d ?? new Date());
  return `${p.year}-${p.month}-${p.day}`;
}

export function sumarDias(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
}

export const inicioDia = (fecha: string) => `${fecha}T00:00:00${OFFSET_BO}`;
export const finDia = (fecha: string) => `${fecha}T23:59:59${OFFSET_BO}`;

/** Date -> ISO con offset de Bolivia (sin milisegundos) */
export function isoBo(d: Date): string {
  const p = partes(d);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${OFFSET_BO}`;
}

/** ISO -> valor para <input type="datetime-local"> (hora de Bolivia) */
export function aInputLocal(iso: string): string {
  const p = partes(new Date(iso));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

export const deInputLocalInicio = (v: string) => `${v}:00${OFFSET_BO}`;
export const deInputLocalFin = (v: string) => `${v}:59${OFFSET_BO}`;

export function rangoPreset(
  preset: Exclude<PresetRango, "personalizado">,
  ahora: Date,
): Rango {
  const hoy = fechaBo(ahora);
  switch (preset) {
    case "hoy":
      return { desde: inicioDia(hoy), hasta: finDia(hoy) };
    case "ayer": {
      const a = sumarDias(hoy, -1);
      return { desde: inicioDia(a), hasta: finDia(a) };
    }
    case "3h":
      return {
        desde: isoBo(new Date(ahora.getTime() - 3 * 3600000)),
        hasta: isoBo(new Date(ahora.getTime() + 60000)),
      };
    case "semana": {
      const [y, m, d] = hoy.split("-").map(Number);
      const dt = new Date(0);
      dt.setUTCFullYear(y, m - 1, d);
      dt.setUTCHours(12, 0, 0, 0);
      const dow = dt.getUTCDay();
      const lunes = sumarDias(hoy, -((dow + 6) % 7));
      return { desde: inicioDia(lunes), hasta: finDia(hoy) };
    }
    case "mes":
      return {
        desde: inicioDia(`${hoy.slice(0, 8)}01`),
        hasta: finDia(hoy),
      };
  }
}

export const mismoDia = (a: string, b: string) =>
  fechaBo(new Date(a)) === fechaBo(new Date(b));

/* ----------------------------- formatos ----------------------------- */

const fHora = new Intl.DateTimeFormat("es-BO", {
  timeZone: ZONA_BO,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const fCorta = new Intl.DateTimeFormat("es-BO", {
  timeZone: ZONA_BO,
  day: "2-digit",
  month: "2-digit",
});
const fDiaLargo = new Intl.DateTimeFormat("es-BO", {
  timeZone: ZONA_BO,
  weekday: "short",
  day: "numeric",
  month: "short",
});

export function formatHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : fHora.format(d);
}
export function formatFechaCorta(iso: string): string {
  return fCorta.format(new Date(iso));
}
export function formatDiaLargo(iso: string): string {
  return fDiaLargo.format(new Date(iso));
}
export function formatFechaHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  return `${formatFechaCorta(iso)} ${formatHora(iso)}`;
}

const fMonto = new Intl.NumberFormat("es-BO", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
export const bs = (n: number) => `Bs ${fMonto.format(n)}`;
export const horasTxt = (h: number) => `${h.toFixed(1)} h`;

/* ------------------- clasificación por negocio ------------------- */

export type Negocio = "churrasqueria" | "hamburgueseria";
export type ClaseItem = Negocio | "compartido";

const RE_BEBIDA = /\b(soda|sodas|cola|gaseosa|agua|jugo|cerveza|refresco)\b/;
const RE_PARRILLA =
  /(churrasco|parrilla|asado|bife|matambre|chuleta|tomahawk|fest[ií]n|parrillada)/;

/**
- Regla del negocio: bebidas/sodas se reparten 50/50 entre los dos negocios.
- Parrilla = churrasquería. El resto = hamburguesería.
 */
export function clasificarItem(
  lineaNegocio: string | null,
  nombre: string,
): ClaseItem {
  const linea = (lineaNegocio || "").toLowerCase();
  const nom = (nombre || "").toLowerCase();

  if (
    linea === "unidad" ||
    linea === "bebidas" ||
    linea === "sodas" ||
    RE_BEBIDA.test(nom)
  ) {
    return "compartido";
  }
  if (linea === "parrilla" || linea === "churrasqueria") {
    return "churrasqueria";
  }
  if (RE_PARRILLA.test(nom)) return "churrasqueria";
  return "hamburgueseria";
}

export function negocioDeTexto(t: string | null | undefined): Negocio | "general" {
  const x = (t || "").toLowerCase();
  if (x.includes("hamb") || x.includes("burger")) return "hamburgueseria";
  if (x.includes("parr") || x.includes("churr")) return "churrasqueria";
  return "general";
}
export type CobroAgrupadoPedido = {
  pedidoId: string | null;
  metodos: string[];
  esMixto: boolean;
  etiquetaMetodo: string;
  totalMonto: number;
  totalPropina: number;
  partes: { metodo: string; monto: number; propina: number }[];
};

export function agruparCobrosPorPedido<
  T extends {
    pedido_id: string | null;
    metodo: string;
    monto: number;
    propina?: number;
  },
>(cobros: T[]): Map<string, CobroAgrupadoPedido> {
  const mapa = new Map<string, CobroAgrupadoPedido>();

  cobros.forEach((c) => {
    const clave = c.pedido_id ?? `sin-pedido-${Math.random().toString(36).slice(2, 8)}`;
    const actual = mapa.get(clave) ?? {
      pedidoId: c.pedido_id,
      metodos: [],
      esMixto: false,
      etiquetaMetodo: "",
      totalMonto: 0,
      totalPropina: 0,
      partes: [],
    };

    const metodoNorm = (c.metodo || "efectivo").toLowerCase();
    const montoNum = Number(c.monto || 0);
    const propinaNum = Number(c.propina || 0);

    actual.partes.push({
      metodo: metodoNorm,
      monto: montoNum,
      propina: propinaNum,
    });
    actual.totalMonto += montoNum;
    actual.totalPropina += propinaNum;

    if (!actual.metodos.includes(metodoNorm)) {
      actual.metodos.push(metodoNorm);
    }

    actual.esMixto = actual.partes.length > 1 || actual.metodos.length > 1;
    actual.etiquetaMetodo = actual.esMixto
      ? `MIXTO (${actual.metodos.map((m) => m.toUpperCase()).join(" + ")})`
      : metodoNorm.toUpperCase();

    mapa.set(clave, actual);
  });

  return mapa;
}