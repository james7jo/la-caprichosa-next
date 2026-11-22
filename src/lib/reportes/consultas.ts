import { createClient } from "@/lib/supabase/client";
import {
  clasificarItem,
  fechaBo,
  formatFechaHora,
  formatHora,
  negocioDeTexto,
  type ClaseItem,
  type Negocio,
  type Rango,
} from "./utilidades";

export type FiltroNegocio = "todo" | Negocio;

export type ItemVenta = {
  id: string;
  nombre: string;
  cantidad: number;
  /** Lo que figura en la comanda */
  subtotal: number;
  /** Lo realmente cobrado que corresponde a este ítem */
  importe: number;
  clase: ClaseItem;
};

export type Venta = {
  id: string;
  pedidoId: string | null;
  hora: string;
  horaPedido: string | null;
  etiqueta: string;
  mesaId: string | null;
  meseroId: string | null;
  mesero: string;
  cobradoPorId: string | null;
  cobradoPor: string;
  metodos: string[];
  porMetodo: Record<string, number>;
  monto: number;
  propina: number;
  validada: boolean;
  items: ItemVenta[];
  platos: number;
  neg: { churrasqueria: number; hamburgueseria: number; sinDetalle: number };
};

export type Egreso = {
  id: string;
  motivo: string;
  monto: number;
  negocio: Negocio | "general";
  hora: string;
  registradoPor: string;
};

export type Turno = {
  id: string;
  meseroId: string;
  nombre: string;
  estado: string;
  entrada: string;
  salida: string | null;
  /** Horas dentro del rango elegido */
  horas: number;
};

/** Turno de caja (tabla cierres_caja): apertura y cierre */
export type CierreCaja = {
  id: string;
  abiertoPorId: string | null;
  abiertoPor: string;
  cerradoPorId: string | null;
  cerradoPor: string | null;
  estado: string;
  abiertoEn: string;
  cerradoEn: string | null;
  montoInicial: number;
  totalVentas: number;
  totalParrilla: number;
  totalHamburguesas: number;
  totalEgresos: number;
  efectivoEsperado: number | null;
  efectivoContado: number | null;
  diferencia: number | null;
  observaciones: string | null;
};

export type DatosReporte = {
  rango: Rango;
  generadoEn: string;
  ventas: Venta[];
  egresos: Egreso[];
  turnos: Turno[];
  cierres: CierreCaja[];
  perfiles: Record<string, { nombre: string; rol: string }>;
};

/* ------------------------- acceso a datos ------------------------- */

type Resp = { data: unknown[] | null; error: { message: string } | null };

// Supabase devuelve máx. 1000 filas por consulta: se pide por páginas.
async function traerTodo<T>(
  pagina: (desde: number, hasta: number) => PromiseLike<Resp>,
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await pagina(i, i + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

function trozos<T>(arr: T[], n: number): T[][] {
  const r: T[][] = [];
  for (let i = 0; i < arr.length; i += n) r.push(arr.slice(i, i + n));
  return r;
}

type PerfilRow = { id: string; nombre: string | null; rol: string | null };
type MesaRow = { id: string; numero: number; nombre: string | null };
type CobroRow = {
  id: string | number;
  pedido_id: string | null;
  mesero_id: string | null;
  registrado_por: string | null;
  metodo: string | null;
  monto: number | string | null;
  propina: number | string | null;
  validado_en_caja: boolean | null;
  created_at: string;
};
type EgresoRow = {
  id: string | number;
  motivo: string | null;
  monto: number | string | null;
  linea_negocio: string | null;
  registrado_por: string | null;
  created_at: string;
};
type TurnoRow = {
  id: string | number;
  mesero_id: string;
  estado: string | null;
  abierta_en: string;
  cerrada_en: string | null;
};
type CierreRow = {
  id: string | number;
  abierto_por: string | null;
  cerrado_por: string | null;
  estado: string | null;
  monto_inicial: number | string | null;
  total_ventas: number | string | null;
  total_parrilla: number | string | null;
  total_hamburguesas: number | string | null;
  total_egresos: number | string | null;
  efectivo_esperado: number | string | null;
  efectivo_contado: number | string | null;
  diferencia: number | string | null;
  observaciones: string | null;
  abierto_en: string;
  cerrado_en: string | null;
};

const COLS_CIERRE =
  "id, abierto_por, cerrado_por, estado, monto_inicial, total_ventas, total_parrilla, total_hamburguesas, total_egresos, efectivo_esperado, efectivo_contado, diferencia, observaciones, abierto_en, cerrado_en";

const numONull = (x: number | string | null | undefined) =>
  x === null || x === undefined ? null : Number(x);

function aMapaPerfiles(rows: PerfilRow[]): DatosReporte["perfiles"] {
  const m: DatosReporte["perfiles"] = {};
  rows.forEach((p) => {
    m[p.id] = { nombre: p.nombre || "Sin nombre", rol: p.rol || "personal" };
  });
  return m;
}

function mapCierre(r: CierreRow, perfiles: DatosReporte["perfiles"]): CierreCaja {
  const nom = (id: string | null) => (id ? (perfiles[id]?.nombre ?? "—") : null);
  return {
    id: String(r.id),
    abiertoPorId: r.abierto_por,
    abiertoPor: nom(r.abierto_por) ?? "—",
    cerradoPorId: r.cerrado_por,
    cerradoPor: nom(r.cerrado_por),
    estado: String(r.estado || ""),
    abiertoEn: r.abierto_en,
    cerradoEn: r.cerrado_en,
    montoInicial: Number(r.monto_inicial || 0),
    totalVentas: Number(r.total_ventas || 0),
    totalParrilla: Number(r.total_parrilla || 0),
    totalHamburguesas: Number(r.total_hamburguesas || 0),
    totalEgresos: Number(r.total_egresos || 0),
    efectivoEsperado: numONull(r.efectivo_esperado),
    efectivoContado: numONull(r.efectivo_contado),
    diferencia: numONull(r.diferencia),
    observaciones: r.observaciones,
  };
}

/** Caja abierta ahora (si hay) + los últimos turnos de caja */
export async function cargarEstadoCaja(): Promise<{
  abierta: CierreCaja | null;
  recientes: CierreCaja[];
}> {
  const supabase = createClient();
  const [perfRows, resp] = await Promise.all([
    traerTodo<PerfilRow>((a, b) =>
      supabase.from("profiles").select("id, nombre, rol").order("id").range(a, b),
    ),
    supabase
      .from("cierres_caja")
      .select(COLS_CIERRE)
      .order("abierto_en", { ascending: false })
      .limit(15),
  ]);
  if (resp.error) throw new Error(resp.error.message);
  const perfiles = aMapaPerfiles(perfRows);
  const recientes = ((resp.data ?? []) as unknown as CierreRow[]).map((r) =>
    mapCierre(r, perfiles),
  );
  // "Abierta" = todavía no tiene fecha de cierre
  return { abierta: recientes.find((c) => !c.cerradoEn) ?? null, recientes };
}

type PedidoRow = {
  id: string;
  origen: string | null;
  mesa_id: string | null;
  mesero_id: string | null;
  cliente_nombre: string | null;
  created_at: string;
};
type DetalleRow = {
  id: string | number;
  pedido_id: string;
  nombre_item: string | null;
  linea_negocio: string | null;
  cantidad: number | string | null;
  subtotal: number | string | null;
};

export async function cargarReporte(rango: Rango): Promise<DatosReporte> {
  const supabase = createClient();
  const { desde, hasta } = rango;

  const [perfRows, mesaRows, cobRows, egrRows, turnoRows, cierreRows] =
    await Promise.all([
    traerTodo<PerfilRow>((a, b) =>
      supabase.from("profiles").select("id, nombre, rol").order("id").range(a, b),
    ),
    traerTodo<MesaRow>((a, b) =>
      supabase.from("mesas").select("id, numero, nombre").order("id").range(a, b),
    ),
    traerTodo<CobroRow>((a, b) =>
      supabase
        .from("cobros")
        .select(
          "id, pedido_id, mesero_id, registrado_por, metodo, monto, propina, validado_en_caja, created_at",
        )
        .gte("created_at", desde)
        .lte("created_at", hasta)
        .order("created_at", { ascending: false })
        .order("id")
        .range(a, b),
    ),
    traerTodo<EgresoRow>((a, b) =>
      supabase
        .from("egresos_caja")
        .select("id, motivo, monto, linea_negocio, registrado_por, created_at")
        .gte("created_at", desde)
        .lte("created_at", hasta)
        .order("created_at", { ascending: false })
        .order("id")
        .range(a, b),
    ),
    // Turnos que se cruzan con el rango (incluye los que siguen abiertos)
    traerTodo<TurnoRow>((a, b) =>
      supabase
        .from("operaciones_mesero")
        .select("id, mesero_id, estado, abierta_en, cerrada_en")
        .lte("abierta_en", hasta)
        .or(`cerrada_en.is.null,cerrada_en.gte.${desde}`)
        .order("abierta_en", { ascending: true })
        .order("id")
        .range(a, b),
    ),
    // Turnos de caja que se cruzan con el rango
    traerTodo<CierreRow>((a, b) =>
      supabase
        .from("cierres_caja")
        .select(COLS_CIERRE)
        .lte("abierto_en", hasta)
        .or(`cerrado_en.is.null,cerrado_en.gte.${desde}`)
        .order("abierto_en", { ascending: false })
        .order("id")
        .range(a, b),
    ).catch(() => [] as CierreRow[]), // si no hay permiso, el resto del reporte sigue funcionando
  ]);

  const perfiles = aMapaPerfiles(perfRows);
  const nombreDe = (id: string | null, vacio: string) =>
    id ? (perfiles[id]?.nombre ?? vacio) : vacio;

  const mesaPorId = new Map(mesaRows.map((m) => [m.id, m]));

  // Pedidos y detalle de los cobros (por tandas para no pasar el límite de URL)
  const pedidoIds = Array.from(
    new Set(cobRows.map((c) => c.pedido_id).filter((x): x is string => !!x)),
  );
  const tandas = await Promise.all(
    trozos(pedidoIds, 80).map(async (ids) => {
      const [peds, dets] = await Promise.all([
        traerTodo<PedidoRow>((a, b) =>
          supabase
            .from("pedidos")
            .select("id, origen, mesa_id, mesero_id, cliente_nombre, created_at")
            .in("id", ids)
            .order("id")
            .range(a, b),
        ),
        traerTodo<DetalleRow>((a, b) =>
          supabase
            .from("detalle_pedidos")
            .select("id, pedido_id, nombre_item, linea_negocio, cantidad, subtotal")
            .in("pedido_id", ids)
            .order("id")
            .range(a, b),
        ),
      ]);
      return { peds, dets };
    }),
  );
  const pedidoPorId = new Map<string, PedidoRow>();
  const detallesPorPedido = new Map<string, DetalleRow[]>();
  tandas.forEach(({ peds, dets }) => {
    peds.forEach((p) => pedidoPorId.set(String(p.id), p));
    dets.forEach((d) => {
      const k = String(d.pedido_id);
      const arr = detallesPorPedido.get(k) ?? [];
      arr.push(d);
      detallesPorPedido.set(k, arr);
    });
  });

  // Una "venta" = un pedido (puede tener más de un cobro)
  const grupos = new Map<string, CobroRow[]>();
  cobRows.forEach((c) => {
    const k = c.pedido_id ? `p-${c.pedido_id}` : `c-${c.id}`;
    const arr = grupos.get(k) ?? [];
    arr.push(c);
    grupos.set(k, arr);
  });

  const ventas: Venta[] = [];
  grupos.forEach((cobros, clave) => {
    const pedidoId = cobros[0].pedido_id ? String(cobros[0].pedido_id) : null;
    const ped = pedidoId ? pedidoPorId.get(pedidoId) : undefined;
    const mesa = ped?.mesa_id ? mesaPorId.get(ped.mesa_id) : undefined;

    const monto = cobros.reduce((a, c) => a + Number(c.monto || 0), 0);
    const propina = cobros.reduce((a, c) => a + Number(c.propina || 0), 0);

    const porMetodo: Record<string, number> = {};
    cobros.forEach((c) => {
      const m = String(c.metodo || "efectivo").toLowerCase();
      porMetodo[m] = (porMetodo[m] ?? 0) + Number(c.monto || 0);
    });

    const dets = pedidoId ? (detallesPorPedido.get(pedidoId) ?? []) : [];
    const totalDetalle = dets.reduce((a, d) => a + Number(d.subtotal || 0), 0);
    // Si se cobró menos que la comanda (descuento), se prorratea. Si se cobró
    // más, el excedente queda como "sin detalle".
    const factor = totalDetalle > 0 ? Math.min(1, monto / totalDetalle) : 0;

    const neg = { churrasqueria: 0, hamburgueseria: 0, sinDetalle: 0 };
    const items: ItemVenta[] = dets.map((d) => {
      const subtotal = Number(d.subtotal || 0);
      const importe = subtotal * factor;
      const nombre = d.nombre_item || "Ítem";
      const clase = clasificarItem(d.linea_negocio, nombre);
      if (clase === "compartido") {
        neg.churrasqueria += importe / 2;
        neg.hamburgueseria += importe / 2;
      } else {
        neg[clase] += importe;
      }
      return {
        id: String(d.id),
        nombre,
        cantidad: Number(d.cantidad || 1),
        subtotal,
        importe,
        clase,
      };
    });
    neg.sinDetalle = Math.max(
      0,
      monto - (neg.churrasqueria + neg.hamburgueseria),
    );

    const meseroId = cobros[0].mesero_id || ped?.mesero_id || null;
    const cobradoPorId = cobros[0].registrado_por || null;

    let etiqueta = "Cobro directo";
    if (mesa) etiqueta = mesa.nombre || `Mesa ${mesa.numero}`;
    else if (ped?.origen === "llevar") etiqueta = "Para llevar";
    else if (ped?.origen === "mostrador") etiqueta = "Mostrador";
    if (!mesa && ped?.cliente_nombre) etiqueta += ` · ${ped.cliente_nombre}`;

    ventas.push({
      id: clave,
      pedidoId,
      hora: cobros.map((c) => c.created_at).sort().at(-1) ?? cobros[0].created_at,
      horaPedido: ped?.created_at ?? null,
      etiqueta,
      mesaId: ped?.mesa_id ?? null,
      meseroId,
      mesero: nombreDe(meseroId, "—"),
      cobradoPorId,
      cobradoPor: nombreDe(cobradoPorId, "Caja"),
      metodos: Object.keys(porMetodo),
      porMetodo,
      monto,
      propina,
      validada: cobros.every((c) => Boolean(c.validado_en_caja)),
      items,
      platos: items
        .filter((i) => i.clase !== "compartido")
        .reduce((a, i) => a + i.cantidad, 0),
      neg,
    });
  });
  ventas.sort((a, b) => b.hora.localeCompare(a.hora));

  const egresos: Egreso[] = egrRows.map((e) => ({
    id: String(e.id),
    motivo: e.motivo || "Sin motivo",
    monto: Number(e.monto || 0),
    negocio: negocioDeTexto(e.linea_negocio),
    hora: e.created_at,
    registradoPor: nombreDe(e.registrado_por, "—"),
  }));

  const ahora = Date.now();
  const d0 = Date.parse(desde);
  const d1 = Date.parse(hasta);
  const turnos: Turno[] = turnoRows.map((t) => {
    const ini = Date.parse(t.abierta_en);
    const fin = t.cerrada_en ? Date.parse(t.cerrada_en) : ahora;
    const horas = Math.max(0, (Math.min(fin, d1) - Math.max(ini, d0)) / 3600000);
    return {
      id: String(t.id),
      meseroId: t.mesero_id,
      nombre: nombreDe(t.mesero_id, "Mesero"),
      estado: t.estado || "",
      entrada: t.abierta_en,
      salida: t.cerrada_en,
      horas,
    };
  });

  return {
    rango,
    generadoEn: new Date().toISOString(),
    ventas,
    egresos,
    turnos,
    cierres: cierreRows.map((r) => mapCierre(r, perfiles)),
    perfiles,
  };
}

/* ------------------------------ resumen ------------------------------ */

export type ProductoAgg = {
  clave: string;
  nombre: string;
  clase: ClaseItem;
  cantidad: number;
  importe: number;
};

export type Resumen = {
  total: number;
  cantidad: number;
  ticket: number;
  propinas: number;
  porMetodo: { metodo: string; monto: number; cantidad: number }[];
  /** Siempre sobre todo el rango, sin importar el filtro */
  neg: Record<Negocio, { ventas: number; platos: number; egresos: number }>;
  sinDetalle: number;
  compartido: { monto: number; unidades: number };
  egresosTotal: number;
  egresosGenerales: number;
  neto: number;
  productos: ProductoAgg[];
};

export function montoVenta(v: Venta, filtro: FiltroNegocio): number {
  return filtro === "todo" ? v.monto : v.neg[filtro];
}

export function calcularResumen(
  ventas: Venta[],
  egresos: Egreso[],
  filtro: FiltroNegocio,
): Resumen {
  const neg: Resumen["neg"] = {
    churrasqueria: { ventas: 0, platos: 0, egresos: 0 },
    hamburgueseria: { ventas: 0, platos: 0, egresos: 0 },
  };
  let sinDetalle = 0;
  let compMonto = 0;
  let compUnid = 0;
  let total = 0;
  let propinas = 0;
  let cantidad = 0;
  const metodos = new Map<string, { monto: number; cantidad: number }>();
  const productos = new Map<string, ProductoAgg>();

  for (const v of ventas) {
    neg.churrasqueria.ventas += v.neg.churrasqueria;
    neg.hamburgueseria.ventas += v.neg.hamburgueseria;
    sinDetalle += v.neg.sinDetalle;
    for (const it of v.items) {
      if (it.clase === "compartido") {
        compMonto += it.importe;
        compUnid += it.cantidad;
      } else {
        neg[it.clase].platos += it.cantidad;
      }
    }

    const parte = montoVenta(v, filtro);
    if (parte <= 0.005) continue;
    cantidad += 1;
    total += parte;
    const share = filtro === "todo" || v.monto <= 0 ? 1 : parte / v.monto;
    propinas += v.propina * share;

    for (const [m, monto] of Object.entries(v.porMetodo)) {
      const e = metodos.get(m) ?? { monto: 0, cantidad: 0 };
      e.monto += monto * share;
      e.cantidad += 1;
      metodos.set(m, e);
    }

    for (const it of v.items) {
      if (filtro !== "todo" && it.clase !== filtro && it.clase !== "compartido") {
        continue;
      }
      const imp =
        filtro !== "todo" && it.clase === "compartido"
          ? it.importe / 2
          : it.importe;
      const clave = `${it.clase}|${it.nombre.toLowerCase()}`;
      const p = productos.get(clave) ?? {
        clave,
        nombre: it.nombre,
        clase: it.clase,
        cantidad: 0,
        importe: 0,
      };
      p.cantidad += it.cantidad;
      p.importe += imp;
      productos.set(clave, p);
    }
  }

  let egresosGenerales = 0;
  let egresosTodos = 0;
  for (const e of egresos) {
    egresosTodos += e.monto;
    if (e.negocio === "general") egresosGenerales += e.monto;
    else neg[e.negocio].egresos += e.monto;
  }
  const egresosTotal = filtro === "todo" ? egresosTodos : neg[filtro].egresos;

  return {
    total,
    cantidad,
    ticket: cantidad > 0 ? total / cantidad : 0,
    propinas,
    porMetodo: Array.from(metodos, ([metodo, v]) => ({ metodo, ...v })).sort(
      (a, b) => b.monto - a.monto,
    ),
    neg,
    sinDetalle,
    compartido: { monto: compMonto, unidades: compUnid },
    egresosTotal,
    egresosGenerales,
    neto: total - egresosTotal,
    productos: Array.from(productos.values()).sort((a, b) => b.importe - a.importe),
  };
}

/* -------------------------------- CSV -------------------------------- */

export function ventasACsv(datos: DatosReporte): string {
  const num = (n: number) => n.toFixed(2).replace(".", ",");
  const esc = (x: string | number) => {
    const s = String(x);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const cab = [
    "Fecha y hora",
    "Mesa / Origen",
    "Mesero",
    "Cobró",
    "Método",
    "Monto",
    "Propina",
    "Churrasquería",
    "Hamburguesería",
    "Sin detalle",
    "Platos",
    "Ítems",
  ];
  const filas = datos.ventas.map((v) => [
    formatFechaHora(v.hora),
    v.etiqueta,
    v.mesero,
    v.cobradoPor,
    v.metodos.join(" + "),
    num(v.monto),
    num(v.propina),
    num(v.neg.churrasqueria),
    num(v.neg.hamburgueseria),
    num(v.neg.sinDetalle),
    v.platos,
    v.items.map((i) => `${i.cantidad}x ${i.nombre}`).join(" | "),
  ]);
  return (
    "﻿" +
    [cab, ...filas].map((f) => f.map(esc).join(";")).join("\r\n")
  );
}

export function nombreArchivoCsv(datos: DatosReporte): string {
  return `ventas_${fechaBo(new Date(datos.rango.desde))}_${formatHora(datos.rango.desde).replace(":", "")}.csv`;
}