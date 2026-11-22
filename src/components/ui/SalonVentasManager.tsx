"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  agregarItemAPedido,
  cobrarPedido,
  crearMesa,
  marcarMesaLimpia,
  separarMesas,
  toggleHabilitarMesa,
  toggleZonaHabilitada,
  unirMesas,
  type SeleccionPersonalizacion,
} from "@/actions/ventas-mesas.actions";
import type { GrupoPersonalizacion } from "@/actions/menu.actions";

export type MesaOperacion = {
  id: string;
  numero: number;
  nombre?: string | null;
  zona: string;
  capacidad: number;
  estado: "disponible" | "ocupada" | "sucia";
  habilitada: boolean;
  solo_fin_de_semana?: boolean;
  unida_con_id?: string | null;
  mesero_actual_id?: string | null;
};

export type CategoriaVenta = {
  id: string;
  nombre: string;
  label: string;
  emoji: string;
};

export type ProductoVenta = {
  id: string;
  nombre: string;
  descripcion: string;
  categoria: string;
  tipo_item?: "plato" | "unidad" | null;
  precio_base: number;
  guarnicion_incluida?: string | null;
  imagen_url?: string | null;
  personalizacion?: GrupoPersonalizacion[] | null;
  stock_actual: number;
  controlar_stock: boolean;
  activo: boolean;
};

export type DetallePedidoActivo = {
  id: string;
  pedido_id: string;
  nombre_item: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  notas_item?: string | null;
};

export type PedidoActivo = {
  id: string;
  origen: "salon" | "mostrador" | "ecommerce";
  estado: "abierto" | "en_cocina" | "por_cobrar" | "pagado" | "cancelado";
  mesa_id?: string | null;
  cliente_nombre?: string | null;
  notas?: string | null;
  total: number;
  created_at: string;
  items: DetallePedidoActivo[];
};

const inputCls =
  "w-full rounded-xl border border-white/10 bg-stone-950 px-3.5 py-2.5 text-sm text-white placeholder:text-stone-600 focus:border-amber-400 focus:outline-none";
const labelCls =
  "text-xs font-semibold uppercase tracking-wider text-stone-400";

export function SalonVentasManager({
  mesasIniciales,
  categorias,
  productos,
  pedidosIniciales,
  ventasHoyBs = 0,
  esAdmin = false,
}: {
  mesasIniciales: MesaOperacion[];
  categorias: CategoriaVenta[];
  productos: ProductoVenta[];
  pedidosIniciales: PedidoActivo[];
  ventasHoyBs?: number;
  esAdmin?: boolean;
}) {
  const router = useRouter();
  const [mesas, setMesas] = useState<MesaOperacion[]>(mesasIniciales);
  const [pedidos, setPedidos] = useState<PedidoActivo[]>(pedidosIniciales);

  const [zonaFiltro, setZonaFiltro] = useState<string>("Todas");
  const [modoCroquis, setModoCroquis] = useState(false);

  // Panel activo de comanda (por mesa o para llevar)
  const [mesaSeleccionadaId, setMesaSeleccionadaId] = useState<string | null>(
    null,
  );
  const [pedidoMostradorId, setPedidoMostradorId] = useState<string | null>(
    null,
  );
  const [comandaAbierta, setComandaAbierta] = useState(false);
  const [clienteLlevar, setClienteLlevar] = useState("");

  // Selección de producto y personalizaciones
  const [catMenuFiltro, setCatMenuFiltro] = useState<string>("Todas");
  const [busquedaMenu, setBusquedaMenu] = useState("");
  const [productoParaPersonalizar, setProductoParaPersonalizar] =
    useState<ProductoVenta | null>(null);
  const [cantidadElegida, setCantidadElegida] = useState(1);
  const [radioElegido, setRadioElegido] = useState<Record<string, string>>({});
  const [checksElegidos, setChecksElegidos] = useState<
    Record<string, string[]>
  >({});
  const [notaItem, setNotaItem] = useState("");

  // Unir mesa
  const [mesaAUnirId, setMesaAUnirId] = useState("");

  // Cobro
  const [metodoCobro, setMetodoCobro] = useState<
    "efectivo" | "qr" | "transferencia" | "tarjeta"
  >("efectivo");

  // Crear nueva mesa en modo croquis
  const [nuevaMesaNum, setNuevaMesaNum] = useState("");
  const [nuevaMesaZona, setNuevaMesaZona] = useState("Salón Principal");
  const [nuevaMesaCap, setNuevaMesaCap] = useState("4");
  const [nuevaMesaFinSemana, setNuevaMesaFinSemana] = useState(false);

  const [mensaje, setMensaje] = useState<{
    tipo: "ok" | "error";
    texto: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setMesas(mesasIniciales);
  }, [mesasIniciales]);

  useEffect(() => {
    setPedidos(pedidosIniciales);
  }, [pedidosIniciales]);

  const zonasDisponibles = Array.from(
    new Set(mesas.map((m) => m.zona || "Salón Principal")),
  );

  const mesasFiltradas = mesas.filter((m) => {
    if (!modoCroquis && !m.habilitada) return false;
    if (zonaFiltro === "Todas") return true;
    return m.zona === zonaFiltro;
  });

  const mesaActual = mesaSeleccionadaId
    ? (mesas.find((m) => m.id === mesaSeleccionadaId) ?? null)
    : null;

  const mesasUnidasActuales = mesaActual
    ? mesas.filter((m) => m.unida_con_id === mesaActual.id)
    : [];

  const pedidoActual: PedidoActivo | null = mesaActual
    ? (pedidos.find(
        (p) =>
          p.mesa_id === mesaActual.id &&
          ["abierto", "en_cocina", "por_cobrar"].includes(p.estado),
      ) ?? null)
    : pedidoMostradorId
      ? (pedidos.find((p) => p.id === pedidoMostradorId) ?? null)
      : null;

  const mesasDisponiblesParaUnir = mesas.filter(
    (m) =>
      m.habilitada &&
      m.estado === "disponible" &&
      !m.unida_con_id &&
      m.id !== mesaActual?.id,
  );

  function abrirComandaMesa(mesa: MesaOperacion) {
    setMensaje(null);
    if (!mesa.habilitada) return;

    if (mesa.estado === "sucia") {
      setMensaje({
        tipo: "error",
        texto: `${mesa.nombre || `Mesa ${mesa.numero}`} está marcada como sucia. Límpiala primero.`,
      });
      return;
    }

    // Si esta mesa es secundaria de otra unión, redirigir a la principal
    const principal = mesa.unida_con_id
      ? (mesas.find((m) => m.id === mesa.unida_con_id) ?? mesa)
      : mesa;

    setPedidoMostradorId(null);
    setMesaSeleccionadaId(principal.id);
    setMesaAUnirId("");
    setProductoParaPersonalizar(null);
    setComandaAbierta(true);
  }

  function abrirParaLlevar(pedidoExistenteId?: string) {
    setMensaje(null);
    setMesaSeleccionadaId(null);
    setPedidoMostradorId(pedidoExistenteId ?? null);
    setProductoParaPersonalizar(null);
    setComandaAbierta(true);
  }

  function prepararProducto(prod: ProductoVenta) {
    setProductoParaPersonalizar(prod);
    setCantidadElegida(1);
    setNotaItem("");

    const radiosIniciales: Record<string, string> = {};
    const checksIniciales: Record<string, string[]> = {};

    (prod.personalizacion ?? []).forEach((grupo) => {
      if (grupo.tipo === "radio" && grupo.opciones.length > 0) {
        radiosIniciales[grupo.titulo] = grupo.opciones[0].nombre;
      }
      if (grupo.tipo === "checkbox") {
        checksIniciales[grupo.titulo] = [];
      }
    });

    setRadioElegido(radiosIniciales);
    setChecksElegidos(checksIniciales);
  }

  function calcularExtrasProducto(prod: ProductoVenta): {
    totalExtras: number;
    detalle: SeleccionPersonalizacion[];
  } {
    const detalle: SeleccionPersonalizacion[] = [];
    let totalExtras = 0;

    (prod.personalizacion ?? []).forEach((grupo) => {
      if (grupo.tipo === "radio") {
        const sel = radioElegido[grupo.titulo];
        if (sel) {
          const op = grupo.opciones.find((o) => o.nombre === sel);
          const extra = Number(op?.precioExtra || 0);
          totalExtras += extra;
          detalle.push({ grupo: grupo.titulo, seleccion: sel, extraBs: extra });
        }
      } else {
        const sels = checksElegidos[grupo.titulo] ?? [];
        if (sels.length > 0) {
          const extra = sels.reduce((acc, nombreOp) => {
            const op = grupo.opciones.find((o) => o.nombre === nombreOp);
            return acc + Number(op?.precioExtra || 0);
          }, 0);
          totalExtras += extra;
          detalle.push({
            grupo: grupo.titulo,
            seleccion: sels,
            extraBs: extra,
          });
        }
      }
    });

    return { totalExtras, detalle };
  }

  function handleConfirmarAgregarItem() {
    if (!productoParaPersonalizar) return;
    setMensaje(null);

    const { detalle } = calcularExtrasProducto(productoParaPersonalizar);

    startTransition(async () => {
      const res = await agregarItemAPedido({
        pedidoId: pedidoActual?.id ?? null,
        mesaId: mesaActual?.id ?? null,
        clienteNombre: !mesaActual ? clienteLlevar : null,
        menuItemId: productoParaPersonalizar.id,
        cantidad: cantidadElegida,
        personalizaciones: detalle,
        notasItem: notaItem,
      });

      if (res?.error) {
        setMensaje({ tipo: "error", texto: res.error });
        return;
      }

      if (!mesaActual && res?.pedidoId) {
        setPedidoMostradorId(res.pedidoId);
      }

      setMensaje({
        tipo: "ok",
        texto: `Agregado ${cantidadElegida}x ${productoParaPersonalizar.nombre} a la comanda.`,
      });
      setProductoParaPersonalizar(null);
      router.refresh();
    });
  }

  function handleCobrar() {
    if (!pedidoActual) return;
    setMensaje(null);

    startTransition(async () => {
      const res = await cobrarPedido(pedidoActual.id, metodoCobro);
      if (res?.error) {
        setMensaje({ tipo: "error", texto: res.error });
        return;
      }

      setMensaje({
        tipo: "ok",
        texto: `Cobrado Bs ${Number(pedidoActual.total).toFixed(2)} por ${metodoCobro.toUpperCase()}.`,
      });
      setComandaAbierta(false);
      setMesaSeleccionadaId(null);
      setPedidoMostradorId(null);
      router.refresh();
    });
  }

  function handleMarcarLimpia(mesaId: string) {
    setMensaje(null);
    startTransition(async () => {
      const res = await marcarMesaLimpia(mesaId);
      if (res?.error) {
        setMensaje({ tipo: "error", texto: res.error });
        return;
      }
      setMensaje({ tipo: "ok", texto: "Mesa limpia y disponible." });
      router.refresh();
    });
  }

  function handleUnirMesa() {
    if (!mesaActual || !mesaAUnirId) return;
    setMensaje(null);
    startTransition(async () => {
      const res = await unirMesas(mesaActual.id, mesaAUnirId);
      if (res?.error) {
        setMensaje({ tipo: "error", texto: res.error });
        return;
      }
      setMesaAUnirId("");
      setMensaje({ tipo: "ok", texto: "Mesas unidas en la misma cuenta." });
      router.refresh();
    });
  }

  function handleSepararMesas() {
    if (!mesaActual) return;
    setMensaje(null);
    startTransition(async () => {
      const res = await separarMesas(mesaActual.id);
      if (res?.error) {
        setMensaje({ tipo: "error", texto: res.error });
        return;
      }
      setMensaje({ tipo: "ok", texto: "Mesas separadas." });
      router.refresh();
    });
  }

  function handleCrearMesa(e: React.FormEvent) {
    e.preventDefault();
    setMensaje(null);
    startTransition(async () => {
      const res = await crearMesa({
        numero: Number(nuevaMesaNum),
        zona: nuevaMesaZona,
        capacidad: Number(nuevaMesaCap),
        habilitada: !nuevaMesaFinSemana,
        soloFinDeSemana: nuevaMesaFinSemana,
      });
      if (res?.error) {
        setMensaje({ tipo: "error", texto: res.error });
        return;
      }
      setNuevaMesaNum("");
      setMensaje({ tipo: "ok", texto: "Mesa agregada al salón." });
      router.refresh();
    });
  }

  const mesasOcupadasCount = mesas.filter(
    (m) => m.habilitada && m.estado === "ocupada" && !m.unida_con_id,
  ).length;
  const mesasSuciasCount = mesas.filter(
    (m) => m.habilitada && m.estado === "sucia",
  ).length;
  const pedidosMostradorAbiertos = pedidos.filter(
    (p) =>
      !p.mesa_id && ["abierto", "en_cocina", "por_cobrar"].includes(p.estado),
  );

  const productosFiltrados = productos.filter((p) => {
    if (!p.activo) return false;
    const okCat = catMenuFiltro === "Todas" || p.categoria === catMenuFiltro;
    const q = busquedaMenu.trim().toLowerCase();
    const okTxt = !q || p.nombre.toLowerCase().includes(q);
    return okCat && okTxt;
  });

  return (
    <div className="space-y-6">
      {mensaje && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm font-medium ${
            mensaje.tipo === "ok"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              : "border-rose-500/30 bg-rose-500/10 text-rose-200"
          }`}
        >
          {mensaje.texto}
        </div>
      )}

      {/* Resumen en vivo (plus del Jefe en Ventas) */}
      {esAdmin && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-3xl border border-white/[0.07] bg-stone-900/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">
              Cobrado hoy
            </p>
            <p className="mt-1 text-2xl font-extrabold text-emerald-300">
              Bs {Number(ventasHoyBs).toFixed(2)}
            </p>
          </div>
          <div className="rounded-3xl border border-white/[0.07] bg-stone-900/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">
              Cuentas / mesas ocupadas
            </p>
            <p className="mt-1 text-2xl font-extrabold text-amber-300">
              {mesasOcupadasCount + pedidosMostradorAbiertos.length}
            </p>
          </div>
          <div className="rounded-3xl border border-white/[0.07] bg-stone-900/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">
              Mesas por limpiar
            </p>
            <p className="mt-1 text-2xl font-extrabold text-rose-300">
              {mesasSuciasCount}
            </p>
          </div>
        </div>
      )}

      {/* Filtros de zona + Para llevar + Modo Croquis */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {["Todas", ...zonasDisponibles].map((z) => (
            <button
              key={z}
              type="button"
              onClick={() => setZonaFiltro(z)}
              className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                zonaFiltro === z
                  ? "bg-amber-400 text-stone-950"
                  : "border border-white/10 bg-stone-900 text-stone-300 hover:bg-white/5"
              }`}
            >
              {z}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => abrirParaLlevar()}
            className="rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 px-4 py-2.5 text-xs font-extrabold text-stone-950 shadow-lg shadow-orange-600/20 hover:brightness-110 active:scale-95"
          >
            🛍️ Para llevar / Mostrador
          </button>

          {esAdmin && (
            <button
              type="button"
              onClick={() => setModoCroquis((v) => !v)}
              className={`rounded-2xl border px-4 py-2.5 text-xs font-bold transition ${
                modoCroquis
                  ? "border-amber-400 bg-amber-500/20 text-amber-200"
                  : "border-white/15 bg-stone-900 text-stone-300 hover:bg-white/5"
              }`}
            >
              🗺️{" "}
              {modoCroquis
                ? "Salir de editar mesas"
                : "Habilitar / unir / crear mesas"}
            </button>
          )}
        </div>
      </div>

      {/* Panel de administración de mesas y sectores (solo Jefe cuando activa el modo) */}
      {esAdmin && modoCroquis && (
        <div className="space-y-4 rounded-3xl border border-amber-400/30 bg-stone-900/90 p-5 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] pb-3">
            <div>
              <h2 className="text-base font-extrabold text-white">
                Gestión de zonas y mesas (días normales / fines de semana)
              </h2>
              <p className="text-xs text-stone-400">
                Habilita o cierra zonas completas o crea nuevas mesas.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {zonasDisponibles.map((z) => (
                <div
                  key={z}
                  className="flex items-center gap-1 rounded-xl border border-white/10 bg-stone-950 px-2.5 py-1.5 text-xs"
                >
                  <span className="font-bold text-stone-200">{z}:</span>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      startTransition(async () => {
                        await toggleZonaHabilitada(z, true);
                        router.refresh();
                      })
                    }
                    className="rounded bg-emerald-500/20 px-1.5 py-0.5 font-bold text-emerald-300"
                  >
                    Abrir
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      startTransition(async () => {
                        await toggleZonaHabilitada(z, false);
                        router.refresh();
                      })
                    }
                    className="rounded bg-stone-700 px-1.5 py-0.5 font-bold text-stone-300"
                  >
                    Cerrar
                  </button>
                </div>
              ))}
            </div>
          </div>

          <form
            onSubmit={handleCrearMesa}
            className="grid grid-cols-1 gap-3 sm:grid-cols-5 items-end"
          >
            <div className="space-y-1">
              <label className={labelCls}>N° Mesa</label>
              <input
                type="number"
                min="1"
                required
                value={nuevaMesaNum}
                onChange={(e) => setNuevaMesaNum(e.target.value)}
                placeholder="Ej. 10"
                className={inputCls}
              />
            </div>
            <div className="space-y-1">
              <label className={labelCls}>Zona</label>
              <input
                value={nuevaMesaZona}
                onChange={(e) => setNuevaMesaZona(e.target.value)}
                placeholder="Salón Principal / Terraza"
                className={inputCls}
              />
            </div>
            <div className="space-y-1">
              <label className={labelCls}>Personas</label>
              <input
                type="number"
                min="1"
                value={nuevaMesaCap}
                onChange={(e) => setNuevaMesaCap(e.target.value)}
                className={inputCls}
              />
            </div>
            <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-stone-950 px-3 py-2.5 text-xs font-semibold text-stone-300">
              <input
                type="checkbox"
                checked={nuevaMesaFinSemana}
                onChange={(e) => setNuevaMesaFinSemana(e.target.checked)}
                className="h-4 w-4 accent-amber-400"
              />
              <span>Solo fin de semana</span>
            </label>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 px-4 py-2.5 text-sm font-extrabold text-stone-950 hover:brightness-110 disabled:opacity-50"
            >
              + Agregar mesa
            </button>
          </form>
        </div>
      )}

      {/* Grilla de mesas */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {mesasFiltradas.map((m) => {
          const mesaPrincipal = m.unida_con_id
            ? mesas.find((x) => x.id === m.unida_con_id)
            : null;
          const pedidoMesa = pedidos.find(
            (p) =>
              p.mesa_id === (mesaPrincipal ? mesaPrincipal.id : m.id) &&
              ["abierto", "en_cocina", "por_cobrar"].includes(p.estado),
          );

          const colorEstado = !m.habilitada
            ? "border-stone-800 bg-stone-900/40 opacity-55"
            : m.estado === "ocupada"
              ? "border-amber-500/50 bg-amber-500/10"
              : m.estado === "sucia"
                ? "border-rose-500/40 bg-rose-500/10"
                : "border-emerald-500/35 bg-stone-900/80 hover:border-emerald-400";

          return (
            <div
              key={m.id}
              onClick={() => {
                if (!modoCroquis) abrirComandaMesa(m);
              }}
              className={`rounded-3xl border p-4 transition ${colorEstado} ${
                !modoCroquis && m.habilitada
                  ? "cursor-pointer active:scale-[0.99]"
                  : ""
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-base font-extrabold text-white">
                    {m.nombre || `Mesa ${m.numero}`}
                  </p>
                  <p className="text-[11px] text-stone-400">
                    {m.zona} · {m.capacidad} pers.
                  </p>
                </div>

                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                    !m.habilitada
                      ? "bg-stone-800 text-stone-400"
                      : m.estado === "ocupada"
                        ? "bg-amber-400 text-stone-950"
                        : m.estado === "sucia"
                          ? "bg-rose-500/20 text-rose-300"
                          : "bg-emerald-500/20 text-emerald-300"
                  }`}
                >
                  {!m.habilitada
                    ? "Cerrada"
                    : m.estado === "ocupada"
                      ? mesaPrincipal
                        ? `Unida a M${mesaPrincipal.numero}`
                        : "Ocupada"
                      : m.estado === "sucia"
                        ? "Sucia"
                        : "Libre"}
                </span>
              </div>

              {pedidoMesa && m.habilitada && (
                <p className="mt-3 text-sm font-extrabold text-amber-300">
                  Bs {Number(pedidoMesa.total).toFixed(2)}
                </p>
              )}

              <div
                onClick={(e) => e.stopPropagation()}
                className="mt-3 flex flex-wrap gap-1.5"
              >
                {m.habilitada && m.estado === "sucia" && (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleMarcarLimpia(m.id)}
                    className="w-full rounded-xl bg-emerald-500/20 border border-emerald-500/30 py-1.5 text-xs font-bold text-emerald-200 hover:bg-emerald-500/30"
                  >
                    ✨ Marcar limpia
                  </button>
                )}

                {esAdmin && modoCroquis && (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      startTransition(async () => {
                        await toggleHabilitarMesa(m.id, !m.habilitada);
                        router.refresh();
                      })
                    }
                    className="w-full rounded-xl border border-white/15 bg-white/5 py-1.5 text-xs font-bold text-stone-200 hover:bg-white/10"
                  >
                    {m.habilitada ? "Inhabilitar hoy" : "Habilitar hoy"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Pedidos activos Para llevar / Mostrador */}
      {pedidosMostradorAbiertos.length > 0 && (
        <div className="space-y-2.5 rounded-3xl border border-white/[0.07] bg-stone-900/70 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-amber-300">
            Pedidos Para llevar / Mostrador abiertos
          </p>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            {pedidosMostradorAbiertos.map((ped) => (
              <button
                key={ped.id}
                type="button"
                onClick={() => abrirParaLlevar(ped.id)}
                className="flex items-center justify-between rounded-2xl border border-white/10 bg-stone-950 px-4 py-3 text-left hover:border-amber-400/50"
              >
                <div>
                  <p className="text-sm font-bold text-white">
                    {ped.cliente_nombre || "Mostrador / Llevar"}
                  </p>
                  <p className="text-xs text-stone-400">
                    {ped.items.reduce((a, b) => a + b.cantidad, 0)} ítem(s)
                  </p>
                </div>
                <span className="text-sm font-extrabold text-amber-300">
                  Bs {Number(ped.total).toFixed(2)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Modal / panel de comanda + menú + cobro */}
      {comandaAbierta && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 sm:items-center sm:p-4 backdrop-blur-sm">
          <div className="flex h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-3xl border border-amber-400/30 bg-stone-900 shadow-2xl sm:rounded-3xl">
            {/* Cabecera */}
            <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
              <div>
                <h2 className="text-lg font-extrabold text-white">
                  {mesaActual
                    ? `${mesaActual.nombre || `Mesa ${mesaActual.numero}`} (${mesaActual.zona})`
                    : "🛍️ Pedido Para llevar / Mostrador"}
                </h2>
                <p className="text-xs text-stone-400">
                  {mesasUnidasActuales.length > 0
                    ? `Unida con: ${mesasUnidasActuales.map((u) => u.nombre || `Mesa ${u.numero}`).join(", ")}`
                    : "Selecciona platos, bebidas o extras del menú."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setComandaAbierta(false);
                  setProductoParaPersonalizar(null);
                }}
                className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5 text-stone-300 hover:bg-white/10"
              >
                ✕
              </button>
            </div>

            {/* Cuerpo dividido: Menú a la izquierda, Cuenta y Cobro a la derecha */}
            <div className="grid flex-1 grid-cols-1 overflow-y-auto md:grid-cols-12">
              {/* Menú */}
              <div className="space-y-3 border-b border-white/[0.07] p-4 md:col-span-7 md:border-b-0 md:border-r md:overflow-y-auto">
                {!mesaActual && !pedidoActual && (
                  <div className="space-y-1">
                    <label className={labelCls}>
                      Nombre cliente / referencia
                    </label>
                    <input
                      value={clienteLlevar}
                      onChange={(e) => setClienteLlevar(e.target.value)}
                      placeholder="Ej. Juan / Delivery"
                      className={inputCls}
                    />
                  </div>
                )}

                <div className="flex flex-wrap gap-1.5">
                  {["Todas", ...categorias.map((c) => c.nombre)].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCatMenuFiltro(c)}
                      className={`rounded-xl px-3 py-1.5 text-xs font-bold ${
                        catMenuFiltro === c
                          ? "bg-amber-400 text-stone-950"
                          : "bg-stone-950 text-stone-300 border border-white/10"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>

                <input
                  value={busquedaMenu}
                  onChange={(e) => setBusquedaMenu(e.target.value)}
                  placeholder="Buscar plato, bebida o extra..."
                  className={inputCls}
                />

                {productoParaPersonalizar ? (
                  <div className="space-y-4 rounded-2xl border border-amber-400/40 bg-stone-950 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-base font-extrabold text-white">
                          {productoParaPersonalizar.nombre}
                        </p>
                        <p className="text-xs text-amber-300">
                          Base: Bs{" "}
                          {Number(productoParaPersonalizar.precio_base).toFixed(
                            2,
                          )}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setProductoParaPersonalizar(null)}
                        className="text-xs font-bold text-stone-400 hover:text-white"
                      >
                        ← Volver al menú
                      </button>
                    </div>

                    {(productoParaPersonalizar.personalizacion ?? []).map(
                      (grupo) => (
                        <div key={grupo.titulo} className="space-y-2">
                          <p className="text-xs font-bold uppercase tracking-wider text-amber-300">
                            {grupo.titulo}
                          </p>
                          {grupo.tipo === "radio" ? (
                            <div className="space-y-1.5">
                              {grupo.opciones.map((op) => (
                                <label
                                  key={op.nombre}
                                  className="flex cursor-pointer items-center justify-between rounded-xl border border-white/10 bg-stone-900 px-3 py-2 text-xs text-white"
                                >
                                  <span className="flex items-center gap-2">
                                    <input
                                      type="radio"
                                      name={grupo.titulo}
                                      checked={
                                        radioElegido[grupo.titulo] === op.nombre
                                      }
                                      onChange={() =>
                                        setRadioElegido((prev) => ({
                                          ...prev,
                                          [grupo.titulo]: op.nombre,
                                        }))
                                      }
                                      className="accent-amber-400"
                                    />
                                    <span>{op.nombre}</span>
                                  </span>
                                  {op.precioExtra > 0 && (
                                    <span className="font-bold text-amber-300">
                                      +Bs {op.precioExtra}
                                    </span>
                                  )}
                                </label>
                              ))}
                            </div>
                          ) : (
                            <div className="space-y-1.5">
                              {grupo.opciones.map((op) => {
                                const actuales =
                                  checksElegidos[grupo.titulo] ?? [];
                                const marcado = actuales.includes(op.nombre);
                                return (
                                  <label
                                    key={op.nombre}
                                    className="flex cursor-pointer items-center justify-between rounded-xl border border-white/10 bg-stone-900 px-3 py-2 text-xs text-white"
                                  >
                                    <span className="flex items-center gap-2">
                                      <input
                                        type="checkbox"
                                        checked={marcado}
                                        onChange={() =>
                                          setChecksElegidos((prev) => {
                                            const prevList =
                                              prev[grupo.titulo] ?? [];
                                            return {
                                              ...prev,
                                              [grupo.titulo]: marcado
                                                ? prevList.filter(
                                                    (x) => x !== op.nombre,
                                                  )
                                                : [...prevList, op.nombre],
                                            };
                                          })
                                        }
                                        className="accent-amber-400"
                                      />
                                      <span>{op.nombre}</span>
                                    </span>
                                    {op.precioExtra > 0 && (
                                      <span className="font-bold text-amber-300">
                                        +Bs {op.precioExtra}
                                      </span>
                                    )}
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ),
                    )}

                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-stone-400">
                          Cantidad:
                        </span>
                        <input
                          type="number"
                          min="1"
                          value={cantidadElegida}
                          onChange={(e) =>
                            setCantidadElegida(
                              Math.max(1, Number(e.target.value) || 1),
                            )
                          }
                          className="w-20 rounded-xl border border-white/10 bg-stone-900 px-3 py-2 text-center text-sm font-bold text-white"
                        />
                      </div>

                      <input
                        value={notaItem}
                        onChange={(e) => setNotaItem(e.target.value)}
                        placeholder="Nota para cocina..."
                        className="flex-1 rounded-xl border border-white/10 bg-stone-900 px-3 py-2 text-xs text-white"
                      />
                    </div>

                    <button
                      type="button"
                      disabled={isPending}
                      onClick={handleConfirmarAgregarItem}
                      className="w-full rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 py-3 text-sm font-extrabold text-stone-950 hover:brightness-110 disabled:opacity-50"
                    >
                      {isPending ? "Agregando..." : "Agregar a la comanda"}
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    {productosFiltrados.map((prod) => {
                      const agotado =
                        prod.controlar_stock && prod.stock_actual <= 0;
                      return (
                        <button
                          key={prod.id}
                          type="button"
                          disabled={isPending || agotado}
                          onClick={() => prepararProducto(prod)}
                          className={`flex items-center gap-3 rounded-2xl border p-2.5 text-left transition ${
                            agotado
                              ? "border-rose-500/20 bg-stone-950/50 opacity-50 cursor-not-allowed"
                              : "border-white/10 bg-stone-950 hover:border-amber-400/50"
                          }`}
                        >
                          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-stone-900 grid place-items-center text-xl">
                            {prod.imagen_url ? (
                              <img
                                src={prod.imagen_url}
                                alt={prod.nombre}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <span>🍽️</span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-white">
                              {prod.nombre}
                            </p>
                            <p className="text-xs font-extrabold text-amber-300">
                              Bs {Number(prod.precio_base).toFixed(2)}
                            </p>
                            {prod.controlar_stock && (
                              <p className="text-[10px] text-stone-400">
                                {agotado
                                  ? "Agotado"
                                  : `Stock: ${prod.stock_actual}`}
                              </p>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Cuenta actual, unión de mesas y cobro */}
              <div className="flex flex-col justify-between space-y-4 p-4 md:col-span-5 md:overflow-y-auto">
                <div className="space-y-3">
                  <h3 className="text-sm font-extrabold uppercase tracking-wider text-amber-300">
                    Cuenta actual
                  </h3>

                  {!pedidoActual || pedidoActual.items.length === 0 ? (
                    <p className="rounded-2xl border border-white/[0.07] bg-stone-950/60 p-4 text-xs text-stone-400">
                      Aún no hay ítems en este pedido. Toca un producto del
                      menú.
                    </p>
                  ) : (
                    <div className="space-y-2 rounded-2xl border border-white/[0.07] bg-stone-950/60 p-3">
                      {pedidoActual.items.map((it) => (
                        <div
                          key={it.id}
                          className="flex items-start justify-between gap-2 border-b border-white/[0.05] pb-2 last:border-b-0 last:pb-0"
                        >
                          <div>
                            <p className="text-xs font-bold text-white">
                              {it.cantidad}x {it.nombre_item}
                            </p>
                            {it.notas_item && (
                              <p className="text-[11px] text-amber-300/80">
                                {it.notas_item}
                              </p>
                            )}
                          </div>
                          <span className="text-xs font-extrabold text-stone-200">
                            Bs {Number(it.subtotal).toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Unir / separar mesas */}
                  {mesaActual && (
                    <div className="space-y-2 rounded-2xl border border-white/[0.07] bg-stone-950/60 p-3">
                      <p className="text-xs font-bold text-stone-300">
                        Unir mesas en esta cuenta
                      </p>
                      <div className="flex gap-2">
                        <select
                          value={mesaAUnirId}
                          onChange={(e) => setMesaAUnirId(e.target.value)}
                          className="flex-1 rounded-xl border border-white/10 bg-stone-900 px-2.5 py-2 text-xs text-white"
                        >
                          <option value="">Elegir mesa libre...</option>
                          {mesasDisponiblesParaUnir.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.nombre || `Mesa ${m.numero}`} ({m.zona})
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={isPending || !mesaAUnirId}
                          onClick={handleUnirMesa}
                          className="rounded-xl bg-amber-400 px-3 py-2 text-xs font-extrabold text-stone-950 disabled:opacity-50"
                        >
                          Unir
                        </button>
                      </div>
                      {mesasUnidasActuales.length > 0 && (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={handleSepararMesas}
                          className="w-full rounded-xl border border-white/15 bg-white/5 py-1.5 text-xs font-semibold text-stone-300 hover:bg-white/10"
                        >
                          Separar mesas unidas
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Total y cobro */}
                {pedidoActual && Number(pedidoActual.total) > 0 && (
                  <div className="space-y-3 rounded-2xl border border-amber-400/30 bg-stone-950 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-stone-400">
                        Total a cobrar
                      </span>
                      <span className="text-xl font-black text-amber-300">
                        Bs {Number(pedidoActual.total).toFixed(2)}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5">
                      {(
                        ["efectivo", "qr", "transferencia", "tarjeta"] as const
                      ).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setMetodoCobro(m)}
                          className={`rounded-xl py-2 text-xs font-bold capitalize ${
                            metodoCobro === m
                              ? "bg-amber-400 text-stone-950"
                              : "border border-white/10 bg-stone-900 text-stone-300"
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      disabled={isPending}
                      onClick={handleCobrar}
                      className="w-full rounded-2xl bg-gradient-to-r from-emerald-400 to-teal-500 py-3 text-sm font-extrabold text-stone-950 shadow-lg hover:brightness-110 disabled:opacity-50"
                    >
                      {isPending
                        ? "Cobrado..."
                        : `Cobrar Bs ${Number(pedidoActual.total).toFixed(2)}`}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
