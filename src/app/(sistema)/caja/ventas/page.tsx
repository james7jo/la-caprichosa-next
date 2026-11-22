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

export default function CajaVentasPage() {
  const [userId, setUserId] = useState("");
  const [mesas, setMesas] = useState<MesaPlanoItem[]>([]);
  const [meseros, setMeseros] = useState<MeseroOpcion[]>([]);
  const [nombresMeseros, setNombresMeseros] = useState<Record<string, string>>(
    {},
  );
  const [categorias, setCategorias] = useState<CategoriaComanda[]>([]);
  const [productos, setProductos] = useState<ProductoComanda[]>([]);
  const [pedidos, setPedidos] = useState<PedidoComanda[]>([]);

  const [seccionActiva, setSeccionActiva] = useState<string>("Salón Principal");
  const [modoUnir, setModoUnir] = useState(false);
  const [mesaBaseUnirId, setMesaBaseUnirId] = useState<string | null>(null);
  const [uniendoMesa, setUniendoMesa] = useState(false);

  const [mesaSeleccionada, setMesaSeleccionada] =
    useState<MesaPlanoItem | null>(null);
  const [comandaAbierta, setComandaAbierta] = useState(false);
  const [esLlevar, setEsLlevar] = useState(false);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    const supabase = createClient();

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
    setCargando(false);
  }, []);

  useEffect(() => {
    void cargar();
    const supabase = createClient();
    const canal = supabase
      .channel("caja-ventas-croquis-rt")
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

  async function handleMarcarLimpia(mesa: MesaPlanoItem) {
    const res = await marcarMesaLimpia(mesa.id);
    if (res?.error) return;
    setMesaSeleccionada(null);
    await cargar();
  }

  async function handleLiberarSinConsumo(mesaId: string) {
    const res = await liberarMesaSinConsumo(mesaId);
    if (res?.error) return;
    setMesaSeleccionada(null);
    setMesaBaseUnirId(null);
    await cargar();
  }

  async function handleTocarMesa(mesa: MesaPlanoItem) {
    if (!mesa.habilitada || uniendoMesa) return;

    if (modoUnir) {
      if (mesa.estado === "sucia") return;

      if (!mesaBaseUnirId) {
        setMesaBaseUnirId(mesa.id);
        return;
      }

      if (mesa.id === mesaBaseUnirId) {
        setMesaBaseUnirId(null);
        return;
      }

      setUniendoMesa(true);
      try {
        const res = await unirMesas(mesaBaseUnirId, mesa.id);
        if (!res?.error) {
          await cargar();
        }
      } finally {
        setUniendoMesa(false);
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
    const objetivoId =
      mesaBaseUnirId ||
      mesasSeccion.find((m) => mesas.some((h) => h.unida_con_id === m.id))
        ?.id ||
      mesasSeccion.find((m) => m.unida_con_id)?.unida_con_id ||
      null;

    if (!objetivoId) return;

    const res = await separarMesas(objetivoId);
    if (res?.error) return;
    setMesaBaseUnirId(null);
    await cargar();
  }

  const propsCroquis = {
    mesas: mesasSeccion,
    userId,
    modoEditor: false,
    mesaSeleccionadaId: mesaBaseUnirId,
    onClickPlano: () => {},
    onClickMesa: handleTocarMesa,
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-white">
            Ventas en turno
          </h2>
          <p className="mt-1 text-xs text-stone-400 sm:text-sm">
            Atención de mesas y comandas cuando cubres apoyo en piso.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setModoUnir((v) => {
                const siguiente = !v;
                setMesaBaseUnirId(null);
                setMesaSeleccionada(null);
                setUniendoMesa(false);
                return siguiente;
              });
            }}
            className={`rounded-xl border px-3.5 py-2 text-xs font-extrabold transition ${
              modoUnir
                ? "border-amber-400 bg-amber-400 text-stone-950"
                : "border-amber-400/40 bg-amber-400/15 text-amber-300"
            }`}
          >
            {modoUnir ? "✕ Salir unir" : "🔗 Unir mesas"}
          </button>

          {tieneUnidasEnSeccion && (
            <button
              type="button"
              disabled={uniendoMesa}
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

      {modoUnir && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-xs font-bold text-amber-200">
          <span>
            {mesaBaseUnir
              ? `Base: ${mesaBaseUnir.nombre || `Mesa ${mesaBaseUnir.numero}`}. Toca otra mesa para unirla.`
              : "Modo unir activo: toca la mesa principal y luego toca otra mesa para unirla."}
          </span>
          <div className="flex items-center gap-2">
            {mesaBaseUnir && (
              <button
                type="button"
                disabled={uniendoMesa}
                onClick={() => handleLiberarSinConsumo(mesaBaseUnir.id)}
                className="rounded-xl bg-emerald-400 px-3 py-1.5 text-xs font-black text-stone-950 hover:brightness-110"
              >
                🟢 Liberar mesa sin consumo
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setModoUnir(false);
                setMesaBaseUnirId(null);
                setUniendoMesa(false);
              }}
              className="rounded-xl border border-white/15 bg-stone-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-stone-800"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {mesaSeleccionada && mesaSeleccionada.estado === "sucia" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-400/40 bg-stone-900 px-4 py-3">
          <span className="text-xs font-bold text-rose-200">
            {mesaSeleccionada.nombre || `Mesa ${mesaSeleccionada.numero}`} está
            sucia · Atendió esta mesa:{" "}
            {mesaSeleccionada.mesero_actual_id
              ? nombresMeseros[mesaSeleccionada.mesero_actual_id] || "Mesero"
              : "Sin asignar"}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={uniendoMesa}
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
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
                className={`rounded-full px-4 py-2 text-xs font-extrabold transition ${
                  seccionActiva === sec
                    ? "bg-amber-400 text-stone-950"
                    : "border border-white/10 bg-stone-900 text-stone-300 hover:border-white/25"
                }`}
              >
                {sec} ({disp} libres)
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3 text-xs font-bold">
          <span className="text-emerald-300">🟢 Libres: {libresSeccion}</span>
          <span className="text-amber-300">🟡 Ocupadas: {ocupadasSeccion}</span>
          <span className="text-rose-300">🔴 Sucias: {suciasSeccion}</span>
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
  );
}
