"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { obtenerInfoHoraBolivia } from "@/lib/hora-bolivia";
import { registrarYcerrarSesionMesero } from "@/actions/operaciones.actions";
import { marcarMesaLimpia } from "@/actions/ventas-mesas.actions";
import {
  ModalSelectorMesa,
  type MesaSelectorItem,
} from "@/components/meseros/ModalSelectorMesa";
import {
  ModalMenuComanda,
  type CategoriaComanda,
  type PedidoComanda,
  type ProductoComanda,
} from "@/components/meseros/ModalMenuComanda";

type Stats = {
  nombre: string;
  mesasHoy: number;
  localHoy: number;
  llevarHoy: number;
  ventasBs: number;
  propinasBs: number;
  fueraHorario: boolean;
  horaBo: string;
};

const META_BS = 600;

const ESTADO_BADGE: Record<string, { texto: string; cls: string }> = {
  abierto: { texto: "Abierto", cls: "bg-sky-400/15 text-sky-300" },
  en_cocina: { texto: "En preparación", cls: "bg-amber-400/15 text-amber-300" },
  por_cobrar: {
    texto: "Por cobrar",
    cls: "bg-emerald-400/15 text-emerald-300",
  },
};

const horaBoCorta = (iso: string) =>
  new Intl.DateTimeFormat("es-BO", {
    timeZone: "America/La_Paz",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));

const nomMesa = (m: Pick<MesaSelectorItem, "nombre" | "numero">) =>
  m.nombre || `Mesa ${m.numero}`;

export default function MeseroDashboardPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [stats, setStats] = useState<Stats>({
    nombre: "Mesero",
    mesasHoy: 0,
    localHoy: 0,
    llevarHoy: 0,
    ventasBs: 0,
    propinasBs: 0,
    fueraHorario: false,
    horaBo: "",
  });
  const [mesas, setMesas] = useState<MesaSelectorItem[]>([]);
  const [categorias, setCategorias] = useState<CategoriaComanda[]>([]);
  const [productos, setProductos] = useState<ProductoComanda[]>([]);
  const [pedidos, setPedidos] = useState<PedidoComanda[]>([]);

  const [abrirMesas, setAbrirMesas] = useState(false);
  const [abrirComanda, setAbrirComanda] = useState(false);
  const [mesaActiva, setMesaActiva] = useState<MesaSelectorItem | null>(null);
  const [esLlevar, setEsLlevar] = useState(false);

  const [modalSalir, setModalSalir] = useState<boolean>(false);
  const [motivo, setMotivo] = useState("");
  const [cargando, setCargando] = useState(true);
  const [aviso, setAviso] = useState<{
    tipo: "ok" | "error" | "alerta";
    texto: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  const cargarDatos = useCallback(async () => {
    const supabase = createClient();
    const bo = obtenerInfoHoraBolivia();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) {
      setCargando(false);
      return;
    }
    setUserId(user.id);

    const [
      { data: prof },
      { data: pHoy },
      { data: cHoy },
      { data: mData },
      { data: catData },
      { data: prodData },
      { data: pAct },
      { data: dAct },
    ] = await Promise.all([
      supabase.from("profiles").select("nombre").eq("id", user.id).single(),
      supabase
        .from("pedidos")
        .select("id, origen, mesa_id, total")
        .eq("mesero_id", user.id)
        .gte("created_at", `${bo.fechaBolivia}T00:00:00.000-04:00`),
      supabase
        .from("cobros")
        .select("monto, propina")
        .eq("mesero_id", user.id)
        .gte("created_at", `${bo.fechaBolivia}T00:00:00.000-04:00`),
      supabase
        .from("mesas")
        .select(
          "id, numero, nombre, zona, capacidad, estado, habilitada, solo_fin_de_semana, unida_con_id, mesero_actual_id, pos_x, pos_y",
        )
        .order("numero", { ascending: true }),
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

    const hoy = pHoy ?? [];
    const vCob = (cHoy ?? []).reduce((a, b) => a + Number(b.monto || 0), 0);
    const vPed = hoy.reduce((a, b) => a + Number(b.total || 0), 0);

    setStats({
      nombre: prof?.nombre || user.email || "Mesero",
      mesasHoy: new Set(hoy.map((x) => x.mesa_id).filter(Boolean)).size,
      localHoy: hoy.filter((x) => x.origen === "salon").length,
      llevarHoy: hoy.filter((x) => x.origen !== "salon").length,
      ventasBs: vCob > 0 ? vCob : vPed,
      propinasBs: (cHoy ?? []).reduce((a, b) => a + Number(b.propina || 0), 0),
      fueraHorario: bo.fueraDeHorario,
      horaBo: bo.horaBoliviaTexto,
    });

    const detMap = new Map<string, PedidoComanda["items"]>();
    (dAct ?? []).forEach((d) => {
      const list = detMap.get(d.pedido_id) ?? [];
      list.push({
        id: d.id,
        pedido_id: d.pedido_id,
        nombre_item: d.nombre_item || "Ítem",
        cantidad: Number(d.cantidad || 1),
        subtotal: Number(d.subtotal || 0),
        notas_item: d.notas_item,
      });
      detMap.set(d.pedido_id, list);
    });

    setMesas((mData ?? []) as MesaSelectorItem[]);
    if (catData) setCategorias(catData as CategoriaComanda[]);
    if (prodData) setProductos(prodData as ProductoComanda[]);
    if (pAct) {
      setPedidos(
        (pAct as Omit<PedidoComanda, "items">[]).map((p) => ({
          ...p,
          total: Number(p.total || 0),
          items: detMap.get(p.id) ?? [],
        })),
      );
    }
    setCargando(false);
  }, []);

  useEffect(() => {
    void cargarDatos();
    const supabase = createClient();
    const canal = supabase
      .channel("mesero-rt-dashboard")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "mesas" },
        cargarDatos,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pedidos" },
        cargarDatos,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "detalle_pedidos" },
        cargarDatos,
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(canal);
    };
  }, [cargarDatos]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 2000);
    return () => clearTimeout(t);
  }, [aviso]);

  function pedirOperacion(mesa: MesaSelectorItem | null, llevar: boolean) {
    setAviso(null);
    if (!llevar && !mesa) {
      setAbrirMesas(true);
      return;
    }
    setMesaActiva(mesa);
    setEsLlevar(llevar);
    setAbrirComanda(true);
  }

  const misMesas = mesas.filter(
    (m) =>
      m.habilitada &&
      m.estado === "ocupada" &&
      !m.unida_con_id &&
      m.mesero_actual_id === userId,
  );
  const pct = Math.min(100, Math.round((stats.ventasBs / META_BS) * 100));
  const radio = 52;
  const circ = 2 * Math.PI * radio;
  const offset = circ * (1 - pct / 100);

  return (
    <div className="min-h-dvh bg-stone-950 text-stone-100">
      <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-stone-950/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-lg font-black text-stone-950">
            {(stats.nombre || "M").trim().charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-extrabold text-white sm:text-lg">
              Hola, {stats.nombre}
            </h1>
            <p className="truncate text-[11px] text-stone-400 sm:text-xs">
              <span className="tabular-nums">{stats.horaBo || "--:--:--"}</span>{" "}
              BO · {stats.fueraHorario ? "Fuera de horario" : "Horario activo"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setModalSalir(true)}
            className="min-h-[42px] rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-bold text-stone-200 transition active:scale-95 hover:border-rose-400/40 hover:bg-rose-500/10 hover:text-rose-200"
          >
            Salir
          </button>
        </div>
      </header>

      {aviso && (
        <div className="pointer-events-none fixed inset-x-0 top-[76px] z-40 flex justify-center px-4">
          <div
            role="status"
            className={`pointer-events-auto flex w-full max-w-lg items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold shadow-2xl ${
              aviso.tipo === "ok"
                ? "border-emerald-400/40 bg-emerald-950/90 text-emerald-100"
                : aviso.tipo === "alerta"
                  ? "border-amber-400/50 bg-amber-950/90 text-amber-100"
                  : "border-rose-400/40 bg-rose-950/90 text-rose-100"
            }`}
          >
            <span>{aviso.texto}</span>
            <button
              type="button"
              onClick={() => setAviso(null)}
              className="text-xs opacity-70"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <main className="mx-auto grid max-w-6xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_350px] lg:gap-6">
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3.5 sm:gap-4">
            <button
              type="button"
              onClick={() => pedirOperacion(null, false)}
              className="flex min-h-[118px] flex-col justify-between rounded-3xl bg-gradient-to-br from-amber-400 to-orange-500 p-4 text-left text-stone-950 shadow-lg shadow-amber-500/20 transition active:scale-[0.97]"
            >
              <span className="text-3xl">🪑</span>
              <div>
                <p className="text-base font-black sm:text-lg">Mesas</p>
                <p className="text-xs font-semibold opacity-85">
                  Elegir sector y mesa
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => pedirOperacion(null, true)}
              className="flex min-h-[118px] flex-col justify-between rounded-3xl border border-white/15 bg-stone-900 p-4 text-left text-white transition active:scale-[0.97] hover:border-amber-400/60"
            >
              <span className="text-3xl">🛍️</span>
              <div>
                <p className="text-base font-black sm:text-lg">Para llevar</p>
                <p className="text-xs font-semibold text-stone-400">
                  Pedido rápido
                </p>
              </div>
            </button>
          </div>

          <section className="space-y-4 rounded-3xl border border-white/[0.07] bg-stone-900/70 p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-extrabold text-white sm:text-lg">
                  Mis mesas ({misMesas.length})
                </h2>
                <p className="text-xs text-stone-400">
                  Toca una mesa para sumar platos o bebidas al toque.
                </p>
              </div>
              <span className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-[11px] font-bold text-emerald-300">
                ● En vivo
              </span>
            </div>

            {misMesas.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-white/10 py-8 text-center text-xs text-stone-500">
                No tienes mesas ocupadas ahora.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {misMesas.map((m) => {
                  const ped = pedidos.find((p) => p.mesa_id === m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => pedirOperacion(m, false)}
                      className="flex min-h-[112px] flex-col justify-between gap-2.5 rounded-2xl border border-white/10 bg-stone-950 p-4 text-left transition active:scale-[0.98] hover:border-amber-400/60"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-base font-extrabold text-white">
                            {nomMesa(m)}
                          </p>
                          <p className="text-xs text-stone-400">
                            {m.zona}
                            {ped?.created_at
                              ? ` · desde ${horaBoCorta(ped.created_at)}`
                              : ""}
                          </p>
                        </div>
                        {ped && ESTADO_BADGE[ped.estado] && (
                          <span
                            className={`rounded-full px-2 py-1 text-[10px] font-bold ${ESTADO_BADGE[ped.estado].cls}`}
                          >
                            {ESTADO_BADGE[ped.estado].texto}
                          </span>
                        )}
                      </div>
                      <div className="space-y-1">
                        {(ped?.items ?? []).slice(0, 3).map((it) => (
                          <p
                            key={it.id}
                            className="truncate text-xs text-stone-300"
                          >
                            <strong className="text-amber-300">
                              {it.cantidad}×
                            </strong>{" "}
                            {it.nombre_item}
                          </p>
                        ))}
                      </div>
                      <div className="pt-1 text-right text-sm font-black tabular-nums text-amber-300">
                        Bs {Number(ped?.total || 0).toFixed(2)}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <aside className="lg:sticky lg:top-[88px] lg:self-start">
          <section className="space-y-5 rounded-3xl border border-white/[0.07] bg-stone-900/70 p-5">
            <div>
              <h2 className="text-base font-extrabold text-white">
                Tu rendimiento de hoy
              </h2>
              <p className="text-xs text-stone-400">
                {pct >= 85
                  ? "Excelente ritmo"
                  : pct >= 45
                    ? "Buen ritmo"
                    : "Por debajo del estándar"}
              </p>
            </div>
            <div className="flex items-center gap-5">
              <div className="relative h-32 w-32 shrink-0">
                <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
                  <circle
                    cx="60"
                    cy="60"
                    r={radio}
                    fill="none"
                    strokeWidth="10"
                    className="stroke-white/10"
                  />
                  <circle
                    cx="60"
                    cy="60"
                    r={radio}
                    fill="none"
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={circ}
                    strokeDashoffset={offset}
                    className={
                      pct >= 85 ? "stroke-emerald-400" : "stroke-amber-400"
                    }
                  />
                </svg>
                <div className="absolute inset-0 grid place-items-center text-center">
                  <div>
                    <p className="text-2xl font-black tabular-nums text-white">
                      {cargando ? "—" : `${pct}%`}
                    </p>
                    <p className="text-[10px] text-stone-400">de la meta</p>
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-[11px] text-stone-400">Ventas</p>
                  <p className="text-xl font-black tabular-nums text-amber-300">
                    {cargando ? "—" : `Bs ${stats.ventasBs.toFixed(2)}`}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-stone-400">Propinas</p>
                  <p className="text-xl font-black tabular-nums text-emerald-300">
                    {cargando ? "—" : `Bs ${stats.propinasBs.toFixed(2)}`}
                  </p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2.5 text-center">
              <div className="rounded-2xl border border-white/[0.06] bg-stone-950/70 p-3">
                <p className="text-xl font-black text-white">
                  {cargando ? "—" : stats.mesasHoy}
                </p>
                <p className="text-[11px] text-stone-400">Mesas</p>
              </div>
              <div className="rounded-2xl border border-white/[0.06] bg-stone-950/70 p-3">
                <p className="text-xl font-black text-white">
                  {cargando ? "—" : stats.localHoy}
                </p>
                <p className="text-[11px] text-stone-400">Local</p>
              </div>
              <div className="rounded-2xl border border-white/[0.06] bg-stone-950/70 p-3">
                <p className="text-xl font-black text-white">
                  {cargando ? "—" : stats.llevarHoy}
                </p>
                <p className="text-[11px] text-stone-400">Llevar</p>
              </div>
            </div>
          </section>
        </aside>
      </main>

      <ModalSelectorMesa
        abierto={abrirMesas}
        onCerrar={() => setAbrirMesas(false)}
        userId={userId}
        mesas={mesas}
        onElegirMesa={(m) => {
          setAbrirMesas(false);
          setMesaActiva(m);
          setEsLlevar(false);
          setAbrirComanda(true);
        }}
        onLimpiarMesa={async (m) => {
          const res = await marcarMesaLimpia(m.id);
          if (res?.error) {
            setAviso({ tipo: "error", texto: res.error });
            return;
          }
          setAviso({
            tipo: "ok",
            texto: `${nomMesa(m)} marcada como limpia y disponible.`,
          });
          await cargarDatos();
        }}
      />

      <ModalMenuComanda
        abierto={abrirComanda}
        onCerrar={() => setAbrirComanda(false)}
        mesaActiva={mesaActiva}
        todasLasMesas={mesas}
        esLlevar={esLlevar}
        categorias={categorias}
        productos={productos}
        pedidos={pedidos}
        onPedidoActualizado={cargarDatos}
        onNotificar={(msg) => setAviso(msg)}
      />

      {modalSalir === true && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 sm:items-center sm:p-4"
          onClick={() => setModalSalir(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md space-y-4 rounded-t-3xl border border-rose-400/30 bg-stone-900 p-6 sm:rounded-3xl"
          >
            <h3 className="text-lg font-extrabold text-white">
              ⚠️ ¿Seguro que deseas cerrar sesión?
            </h3>
            <p className="text-xs leading-relaxed text-stone-300">
              Se guardará la <strong>hora exacta de Bolivia</strong>. El jefe lo
              sabrá y, si cierras antes de horario o sin cuadrar, serás el{" "}
              <strong>primer sospechoso</strong> ante cualquier falta de dinero.
            </p>
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Motivo u observación (opcional)"
              className="w-full rounded-xl border border-white/10 bg-stone-950 px-3.5 py-2.5 text-sm text-white"
            />
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setModalSalir(false)}
                className="min-h-[44px] flex-1 rounded-xl border border-white/15 py-2.5 text-xs font-bold text-stone-200"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    await registrarYcerrarSesionMesero(motivo);
                    router.push("/login");
                    router.refresh();
                  })
                }
                className="min-h-[44px] flex-1 rounded-xl bg-rose-500 py-2.5 text-xs font-extrabold text-white"
              >
                {isPending ? "Registrando..." : "Registrar y salir"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
