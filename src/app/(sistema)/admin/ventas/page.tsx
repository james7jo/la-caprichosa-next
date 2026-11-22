"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  liberarMesaSinConsumo,
  marcarMesaLimpia,
  separarMesas,
  unirMesas,
} from "@/actions/ventas-mesas.actions";
import type { MesaPlanoItem } from "@/components/mesas/plano-base";
import {
  ModalMenuComanda,
  type CategoriaComanda,
  type MeseroOpcion,
  type PedidoComanda,
  type ProductoComanda,
} from "@/components/mesas/ModalMenuComanda";

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

const SECCIONES = [
  "Salón Principal",
  "Jardín",
  "Hamburguesería",
  "Garaje",
] as const;

export default function AdminVentasPage() {
  const [userId, setUserId] = useState("");
  const [mesas, setMesas] = useState<MesaPlanoItem[]>([]);
  const [meseros, setMeseros] = useState<MeseroOpcion[]>([]);
  const [nombresMeseros, setNombresMeseros] = useState<Record<string, string>>(
    {},
  );
  const [categorias, setCategorias] = useState<CategoriaComanda[]>([]);
  const [productos, setProductos] = useState<ProductoComanda[]>([]);
  const [pedidos, setPedidos] = useState<PedidoComanda[]>([]);
  const [ventasHoyBs, setVentasHoyBs] = useState(0);

  const [seccionActiva, setSeccionActiva] = useState<string>("Salón Principal");
  const [modoUnir, setModoUnir] = useState(false);
  const [mesaBaseUnirId, setMesaBaseUnirId] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const [mesaSeleccionada, setMesaSeleccionada] =
    useState<MesaPlanoItem | null>(null);
  const [comandaAbierta, setComandaAbierta] = useState(false);
  const [esLlevar, setEsLlevar] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [aviso, setAviso] = useState<{
    tipo: "ok" | "error" | "info";
    texto: string;
  } | null>(null);

  const cargar = useCallback(async () => {
    const supabase = createClient();
    const hoy = new Date().toISOString().slice(0, 10);

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.user) setUserId(session.user.id);

    const [
      { data: mData },
      { data: perfData },
      { data: cData },
      { data: pData },
      { data: pedData },
      { data: dData },
      { data: cobData },
    ] = await Promise.all([
      supabase
        .from("mesas")
        .select(
          "id, numero, nombre, zona, capacidad, estado, habilitada, solo_fin_de_semana, unida_con_id, mesero_actual_id, pos_x, pos_y",
        )
        .order("numero", { ascending: true }),
      supabase.from("profiles").select("id, nombre, activo"),
      supabase
        .from("menu_categorias")
        .select("id, nombre, emoji")
        .order("orden", { ascending: true }),
      supabase
        .from("menu_items")
        .select(
          "id, nombre, categoria, precio_base, imagen_url, personalizacion, stock_actual, controlar_stock, activo",
        )
        .order("nombre", { ascending: true }),
      supabase
        .from("pedidos")
        .select(
          "id, origen, estado, mesa_id, mesero_id, cliente_nombre, total, created_at",
        )
        .in("estado", ["abierto", "en_cocina", "por_cobrar"])
        .order("created_at", { ascending: false }),
      supabase
        .from("detalle_pedidos")
        .select("id, pedido_id, nombre_item, cantidad, subtotal, notas_item"),
      supabase
        .from("cobros")
        .select("monto")
        .gte("created_at", `${hoy}T00:00:00.000Z`),
    ]);

    const mapaMeseros: Record<string, string> = {};
    const listaMeseros: MeseroOpcion[] = [];
    (perfData ?? []).forEach((u) => {
      if (u.id) {
        const nom = u.nombre || "Mesero";
        mapaMeseros[u.id] = nom;
        if (u.activo !== false) {
          listaMeseros.push({ id: u.id, nombre: nom });
        }
      }
    });

    const mapa = new Map<string, PedidoComanda["items"]>();
    (dData ?? []).forEach((d) => {
      const arr = mapa.get(d.pedido_id) ?? [];
      arr.push({
        id: d.id,
        pedido_id: d.pedido_id,
        nombre_item: d.nombre_item || "Ítem",
        cantidad: Number(d.cantidad || 1),
        subtotal: Number(d.subtotal || 0),
        notas_item: d.notas_item,
      });
      mapa.set(d.pedido_id, arr);
    });

    setNombresMeseros(mapaMeseros);
    setMeseros(listaMeseros);
    setMesas((mData ?? []) as MesaPlanoItem[]);
    if (cData) setCategorias(cData as CategoriaComanda[]);
    if (pData) setProductos(pData as ProductoComanda[]);
    if (pedData) {
      setPedidos(
        (pedData as Omit<PedidoComanda, "items">[]).map((p) => ({
          ...p,
          total: Number(p.total || 0),
          items: mapa.get(p.id) ?? [],
        })),
      );
    }
    setVentasHoyBs(
      (cobData ?? []).reduce((acc, row) => acc + Number(row.monto || 0), 0),
    );
    setCargando(false);
  }, []);

  useEffect(() => {
    void cargar();
    const supabase = createClient();
    const canal = supabase
      .channel("admin-ventas-croquis-rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "mesas" },
        () => {
          void cargar();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pedidos" },
        () => {
          void cargar();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "detalle_pedidos" },
        () => {
          void cargar();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(canal);
    };
  }, [cargar]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 4500);
    return () => clearTimeout(t);
  }, [aviso]);

  const mesasSeccion = mesas.filter((m) => m.zona === seccionActiva);
  const libresSeccion = mesasSeccion.filter(
    (m) => m.habilitada && m.estado === "disponible",
  ).length;
  const ocupadasSeccion = mesasSeccion.filter(
    (m) => m.habilitada && m.estado === "ocupada",
  ).length;
  const suciasSeccion = mesasSeccion.filter(
    (m) => m.habilitada && m.estado === "sucia",
  ).length;

  const mesaBaseUnir = mesas.find((m) => m.id === mesaBaseUnirId) ?? null;
  const tieneUnidasEnSeccion = mesasSeccion.some(
    (m) =>
      Boolean(m.unida_con_id) || mesas.some((h) => h.unida_con_id === m.id),
  );

  // Grupo (mesa principal + unidas) de la mesa base elegida en modo unir
  const cabezaUnirId = mesaBaseUnir
    ? (mesaBaseUnir.unida_con_id ?? mesaBaseUnir.id)
    : null;
  const grupoUnir = cabezaUnirId
    ? mesas
        .filter((m) => m.id === cabezaUnirId || m.unida_con_id === cabezaUnirId)
        .sort((a, b) =>
          a.id === cabezaUnirId
            ? -1
            : b.id === cabezaUnirId
              ? 1
              : a.numero - b.numero,
        )
    : [];

  const gruposSeccion = new Set(
    mesasSeccion
      .map(
        (m) =>
          m.unida_con_id ??
          (mesas.some((h) => h.unida_con_id === m.id) ? m.id : null),
      )
      .filter(Boolean),
  ).size;

  async function handleMarcarLimpia(mesa: MesaPlanoItem) {
    if (ocupado) return;
    setOcupado(true);
    try {
      const res = await marcarMesaLimpia(mesa.id);
      if (res?.error) {
        setAviso({ tipo: "error", texto: res.error });
        return;
      }
      setMesaSeleccionada(null);
      await cargar();
    } finally {
      setOcupado(false);
    }
  }

  async function handleLiberarSinConsumo(mesaId: string) {
    if (ocupado) return;
    setOcupado(true);
    try {
      const res = await liberarMesaSinConsumo(mesaId);
      if (res?.error) {
        setAviso({ tipo: "error", texto: res.error });
        return;
      }
      setAviso({ tipo: "ok", texto: "Mesa liberada." });
      setMesaSeleccionada(null);
      setMesaBaseUnirId(null);
      await cargar();
    } finally {
      setOcupado(false);
    }
  }

  async function handleTocarMesa(mesa: MesaPlanoItem) {
    if (!mesa.habilitada || ocupado) return;

    if (modoUnir) {
      if (!mesaBaseUnirId) {
        setMesaBaseUnirId(mesa.id);
        return;
      }
      if (mesa.id === mesaBaseUnirId) {
        setMesaBaseUnirId(null);
        return;
      }

      const base = mesas.find((m) => m.id === mesaBaseUnirId);
      const cabezaId = base ? (base.unida_con_id ?? base.id) : mesaBaseUnirId;

      if (mesa.id === cabezaId || mesa.unida_con_id === cabezaId) {
        setAviso({
          tipo: "info",
          texto: `La Mesa ${mesa.numero} ya está en este grupo.`,
        });
        return;
      }
      if (
        (mesa.unida_con_id && mesa.unida_con_id !== cabezaId) ||
        mesas.some((h) => h.unida_con_id === mesa.id)
      ) {
        setAviso({
          tipo: "error",
          texto: `La Mesa ${mesa.numero} ya está unida a otro grupo. Sepárala primero.`,
        });
        return;
      }

      setOcupado(true);
      try {
        const res = await unirMesas(mesaBaseUnirId, mesa.id);
        if (res?.error) {
          setAviso({ tipo: "error", texto: res.error });
        } else {
          await cargar();
          setAviso({
            tipo: "ok",
            texto: `🔗 Mesa ${mesa.numero} unida con la Mesa ${base?.numero ?? ""}. Toca otra para agregar más o pulsa «Listo unir».`,
          });
        }
      } finally {
        setOcupado(false);
      }
      return;
    }

    if (mesa.estado === "sucia") {
      setMesaSeleccionada(mesa);
      return;
    }

    setMesaSeleccionada(mesa);
    setEsLlevar(false);
    setComandaAbierta(true);
  }

  async function handleSepararGrupo() {
    if (ocupado) return;
    const objetivoId =
      mesaBaseUnirId ||
      mesasSeccion.find((m) => mesas.some((h) => h.unida_con_id === m.id))
        ?.id ||
      mesasSeccion.find((m) => m.unida_con_id)?.unida_con_id ||
      null;

    if (!objetivoId) return;

    setOcupado(true);
    try {
      const res = await separarMesas(objetivoId);
      if (res?.error) {
        setAviso({ tipo: "error", texto: res.error });
        return;
      }
      setAviso({ tipo: "ok", texto: "✂️ Mesas separadas." });
      setMesaBaseUnirId(null);
      await cargar();
    } finally {
      setOcupado(false);
    }
  }

  const propsCroquis = {
    mesas: mesasSeccion,
    userId,
    modoEditor: false,
    modoSeleccion: modoUnir,
    todasLasMesas: mesas,
    mesaSeleccionadaId: mesaBaseUnirId,
    onClickPlano: () => {},
    onClickMesa: handleTocarMesa,
  };

  return (
    <main className="min-h-full bg-stone-950 p-2 text-stone-100 sm:p-6 md:p-8">
      <div className="mx-auto max-w-6xl space-y-3 sm:space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-white sm:text-3xl">
              Ventas por sección
            </h1>
            <p className="mt-1 hidden text-xs text-stone-400 sm:block sm:text-sm">
              Disponible → comanda enviada pasa a ocupada → pago en caja pasa a
              sucia → limpia y vuelve a disponible.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-xs font-extrabold text-emerald-300">
              Cobrado hoy: Bs {ventasHoyBs.toFixed(2)}
            </span>

            <button
              type="button"
              onClick={() => {
                setModoUnir((v) => {
                  const sig = !v;
                  setMesaBaseUnirId(null);
                  setMesaSeleccionada(null);
                  return sig;
                });
              }}
              className={`rounded-xl border px-3.5 py-2 text-xs font-extrabold transition ${
                modoUnir
                  ? "border-amber-400 bg-amber-400 text-stone-950"
                  : "border-amber-400/40 bg-amber-400/15 text-amber-300"
              }`}
            >
              {modoUnir ? "✓ Listo unir" : "🔗 Unir mesas"}
            </button>

            {tieneUnidasEnSeccion && (
              <button
                type="button"
                disabled={ocupado}
                onClick={handleSepararGrupo}
                className="rounded-xl border border-rose-400/40 bg-rose-500/15 px-3.5 py-2 text-xs font-extrabold text-rose-200"
              >
                ✂️ Separar mesas
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setModoUnir(false);
                setMesaBaseUnirId(null);
                setMesaSeleccionada(null);
                setEsLlevar(true);
                setComandaAbierta(true);
              }}
              className="rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 px-4 py-2 text-xs font-black text-stone-950"
            >
              🛍️ Para llevar
            </button>
          </div>
        </div>

        {aviso && (
          <div
            role="status"
            className={`rounded-2xl border px-4 py-3 text-xs font-bold ${
              aviso.tipo === "ok"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                : aviso.tipo === "error"
                  ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
                  : "border-sky-500/30 bg-sky-500/10 text-sky-200"
            }`}
          >
            {aviso.texto}
          </div>
        )}

        {modoUnir && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-xs font-bold text-amber-200">
            <span>
              {mesaBaseUnir
                ? `Mesa principal: ${mesaBaseUnir.nombre || `Mesa ${mesaBaseUnir.numero}`}.${grupoUnir.length > 1 ? ` Grupo actual: ${grupoUnir.map((m) => m.numero).join(" + ")}.` : ""} Toca otra mesa para unirla.`
                : "Modo unir activo: primero toca la mesa principal en el croquis."}
            </span>
            {mesaBaseUnir && (
              <button
                type="button"
                disabled={ocupado}
                onClick={() => handleLiberarSinConsumo(mesaBaseUnir.id)}
                className="rounded-xl bg-emerald-400 px-3 py-1.5 text-xs font-black text-stone-950 hover:brightness-110"
              >
                🟢 Liberar mesa sin consumo
              </button>
            )}
          </div>
        )}

        {mesaSeleccionada && mesaSeleccionada.estado === "sucia" && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-400/40 bg-stone-900 px-4 py-3">
            <span className="text-xs font-bold text-rose-200">
              {mesaSeleccionada.nombre || `Mesa ${mesaSeleccionada.numero}`}{" "}
              está sucia · Atendió esta mesa:{" "}
              {mesaSeleccionada.mesero_actual_id
                ? nombresMeseros[mesaSeleccionada.mesero_actual_id] || "Mesero"
                : "Sin asignar"}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={ocupado}
                onClick={() => handleMarcarLimpia(mesaSeleccionada)}
                className="rounded-xl bg-emerald-400 px-3.5 py-2 text-xs font-black text-stone-950 hover:brightness-110"
              >
                🧹 Ya limpié la mesa
              </button>
              <button
                type="button"
                onClick={() => setMesaSeleccionada(null)}
                className="rounded-xl px-2.5 py-2 text-xs text-stone-400 hover:text-white"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
            {SECCIONES.map((sec) => {
              const disp = mesas.filter(
                (m) =>
                  m.zona === sec && m.habilitada && m.estado === "disponible",
              ).length;
              return (
                <button
                  key={sec}
                  type="button"
                  onClick={() => {
                    setSeccionActiva(sec);
                    setMesaBaseUnirId(null);
                    setMesaSeleccionada(null);
                  }}
                  className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-xs font-extrabold transition ${
                    seccionActiva === sec
                      ? "bg-amber-400 text-stone-950"
                      : "border border-white/10 bg-stone-900 text-stone-300 hover:border-white/25"
                  }`}
                >
                  {sec} ({disp}
                  <span className="hidden sm:inline"> libres</span>)
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold sm:text-xs">
            <span className="text-emerald-300">
              🟢 <span className="hidden sm:inline">Libres: </span>
              {libresSeccion}
            </span>
            <span className="text-amber-300">
              🟡 <span className="hidden sm:inline">Ocupadas: </span>
              {ocupadasSeccion}
            </span>
            <span className="text-rose-300">
              🔴 <span className="hidden sm:inline">Sucias: </span>
              {suciasSeccion}
            </span>
            <span className="text-indigo-300">
              🔗 <span className="hidden sm:inline">Unidas: </span>
              {gruposSeccion}
            </span>
          </div>
        </div>

        {cargando ? (
          <div className="h-[400px] animate-pulse rounded-3xl border border-white/10 bg-stone-900/60" />
        ) : seccionActiva === "Jardín" ? (
          <CroquisJardin {...propsCroquis} />
        ) : seccionActiva === "Hamburguesería" ? (
          <CroquisHamburgueseria {...propsCroquis} />
        ) : seccionActiva === "Garaje" ? (
          <CroquisGaraje {...propsCroquis} />
        ) : (
          <CroquisSalonPrincipal {...propsCroquis} />
        )}

        <ModalMenuComanda
          abierto={comandaAbierta}
          onCerrar={() => setComandaAbierta(false)}
          mesaActiva={
            mesaSeleccionada
              ? {
                  id: mesaSeleccionada.id,
                  numero: mesaSeleccionada.numero,
                  nombre: mesaSeleccionada.nombre,
                  zona: mesaSeleccionada.zona,
                  estado: mesaSeleccionada.estado,
                  habilitada: mesaSeleccionada.habilitada,
                  mesero_actual_id: mesaSeleccionada.mesero_actual_id,
                  unida_con_id: mesaSeleccionada.unida_con_id,
                  capacidad: mesaSeleccionada.capacidad,
                }
              : null
          }
          todasLasMesas={mesas}
          meseros={meseros}
          esLlevar={esLlevar}
          categorias={categorias}
          productos={productos}
          pedidos={pedidos}
          onPedidoActualizado={cargar}
          onNotificar={() => {}}
        />
      </div>
    </main>
  );
}
