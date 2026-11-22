"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

const NUMERO_WHATSAPP = "59170000000"; // ← Cambia por el número real de WhatsApp de La Caprichosa

type OpcionPersonalizacion = {
  nombre: string;
  precioExtra: number;
};

type GrupoPersonalizacion = {
  titulo: string;
  tipo: "radio" | "checkbox";
  opciones: OpcionPersonalizacion[];
};

type CategoriaMenu = {
  id: string;
  nombre: string;
  label: string;
  emoji: string;
  orden: number;
};

type ItemMenu = {
  id: string;
  nombre: string;
  descripcion: string;
  categoria: string;
  precio_base: number;
  guarnicion_incluida: string | null;
  imagen_url: string | null;
  personalizacion: GrupoPersonalizacion[];
  stock_actual: number;
  controlar_stock: boolean;
  activo: boolean;
};

type ItemCarrito = {
  uid: string;
  menuItemId: string;
  nombre: string;
  precioUnitario: number;
  cantidad: number;
  extrasTexto: string[];
  nota: string;
};

export default function EcommerceHomePage() {
  const [categorias, setCategorias] = useState<CategoriaMenu[]>([]);
  const [items, setItems] = useState<ItemMenu[]>([]);
  const [cargando, setCargando] = useState(true);

  const [categoriaActiva, setCategoriaActiva] = useState<string>("Todas");
  const [busqueda, setBusqueda] = useState("");

  // Modal de detalle / personalización de producto
  const [productoModal, setProductoModal] = useState<ItemMenu | null>(null);
  const [selecciones, setSelecciones] = useState<Record<string, string[]>>({});
  const [cantidadModal, setCantidadModal] = useState(1);
  const [notaModal, setNotaModal] = useState("");

  // Carrito y drawer móvil/lateral
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [carritoAbierto, setCarritoAbierto] = useState(false);

  // Datos mínimos del pedido (sin crear cuenta)
  const [nombreCliente, setNombreCliente] = useState("");
  const [tipoEntrega, setTipoEntrega] = useState<"recoger" | "delivery">(
    "recoger",
  );
  const [direccionDelivery, setDireccionDelivery] = useState("");
  const [notasPedido, setNotasPedido] = useState("");

  // Modal de Política de Privacidad y Condiciones
  const [mostrarPoliticas, setMostrarPoliticas] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    async function cargarMenu() {
      const [{ data: cats }, { data: prods }] = await Promise.all([
        supabase
          .from("menu_categorias")
          .select("id, nombre, label, emoji, orden")
          .eq("activo", true)
          .order("orden", { ascending: true }),
        supabase
          .from("menu_items")
          .select(
            "id, nombre, descripcion, categoria, precio_base, guarnicion_incluida, imagen_url, personalizacion, stock_actual, controlar_stock, activo",
          )
          .eq("activo", true)
          .order("nombre", { ascending: true }),
      ]);

      if (cats) setCategorias(cats as CategoriaMenu[]);
      if (prods) {
        setItems(
          (prods as ItemMenu[]).map((p) => ({
            ...p,
            personalizacion: Array.isArray(p.personalizacion)
              ? p.personalizacion
              : [],
          })),
        );
      }
      setCargando(false);
    }

    cargarMenu();

    const canal = supabase
      .channel("ecommerce-menu-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "menu_items" },
        () => cargarMenu(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "menu_categorias" },
        () => cargarMenu(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, []);

  const itemsFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return items.filter((item) => {
      const matchCat =
        categoriaActiva === "Todas" || item.categoria === categoriaActiva;
      const matchText =
        !q ||
        item.nombre.toLowerCase().includes(q) ||
        item.descripcion.toLowerCase().includes(q);
      return matchCat && matchText;
    });
  }, [items, categoriaActiva, busqueda]);

  function abrirProducto(item: ItemMenu) {
    if (item.controlar_stock && item.stock_actual <= 0) return;

    const iniciales: Record<string, string[]> = {};
    for (const grupo of item.personalizacion ?? []) {
      if (grupo.tipo === "radio" && grupo.opciones.length > 0) {
        iniciales[grupo.titulo] = [grupo.opciones[0].nombre];
      } else {
        iniciales[grupo.titulo] = [];
      }
    }

    setSelecciones(iniciales);
    setCantidadModal(1);
    setNotaModal("");
    setProductoModal(item);
  }

  function toggleOpcion(grupo: GrupoPersonalizacion, opcionNombre: string) {
    setSelecciones((prev) => {
      const actuales = prev[grupo.titulo] ?? [];
      if (grupo.tipo === "radio") {
        return { ...prev, [grupo.titulo]: [opcionNombre] };
      }
      const existe = actuales.includes(opcionNombre);
      return {
        ...prev,
        [grupo.titulo]: existe
          ? actuales.filter((o) => o !== opcionNombre)
          : [...actuales, opcionNombre],
      };
    });
  }

  const precioModalUnitario = useMemo(() => {
    if (!productoModal) return 0;
    let extra = 0;
    for (const grupo of productoModal.personalizacion ?? []) {
      const elegidas = selecciones[grupo.titulo] ?? [];
      for (const op of grupo.opciones) {
        if (elegidas.includes(op.nombre)) {
          extra += Number(op.precioExtra || 0);
        }
      }
    }
    return Number(productoModal.precio_base) + extra;
  }, [productoModal, selecciones]);

  function agregarAlCarrito() {
    if (!productoModal) return;

    const extrasTexto: string[] = [];
    for (const grupo of productoModal.personalizacion ?? []) {
      const elegidas = selecciones[grupo.titulo] ?? [];
      if (elegidas.length > 0) {
        extrasTexto.push(`${grupo.titulo}: ${elegidas.join(", ")}`);
      }
    }

    const uid = `${productoModal.id}-${extrasTexto.join("|")}-${notaModal.trim()}`;

    setCarrito((prev) => {
      const idx = prev.findIndex((c) => c.uid === uid);
      if (idx >= 0) {
        const copia = [...prev];
        copia[idx] = {
          ...copia[idx],
          cantidad: copia[idx].cantidad + cantidadModal,
        };
        return copia;
      }
      return [
        ...prev,
        {
          uid,
          menuItemId: productoModal.id,
          nombre: productoModal.nombre,
          precioUnitario: precioModalUnitario,
          cantidad: cantidadModal,
          extrasTexto,
          nota: notaModal.trim(),
        },
      ];
    });

    setProductoModal(null);
  }

  function actualizarCantidadCarrito(uid: string, delta: number) {
    setCarrito((prev) =>
      prev
        .map((item) =>
          item.uid === uid
            ? { ...item, cantidad: item.cantidad + delta }
            : item,
        )
        .filter((item) => item.cantidad > 0),
    );
  }

  const totalUnidades = useMemo(
    () => carrito.reduce((acc, i) => acc + i.cantidad, 0),
    [carrito],
  );

  const totalBs = useMemo(
    () => carrito.reduce((acc, i) => acc + i.precioUnitario * i.cantidad, 0),
    [carrito],
  );

  function enviarPedidoWhatsApp() {
    if (carrito.length === 0) return;

    const lineas: string[] = [
      "🔥 *NUEVO PEDIDO — LA CAPRICHOSA GRILL & BURGER*",
      "",
      `👤 *Cliente:* ${nombreCliente.trim() || "Cliente Web"}`,
      `📦 *Modalidad:* ${
        tipoEntrega === "recoger"
          ? "Paso a recoger en local"
          : `Delivery (${direccionDelivery.trim() || "Por coordinar"})`
      }`,
      "",
      "*Detalle del pedido:*",
    ];

    for (const item of carrito) {
      lineas.push(
        `• *${item.cantidad}x ${item.nombre}* — Bs ${(
          item.precioUnitario * item.cantidad
        ).toFixed(2)}`,
      );
      for (const ex of item.extrasTexto) {
        lineas.push(`   ↳ ${ex}`);
      }
      if (item.nota) {
        lineas.push(`   ↳ Nota: ${item.nota}`);
      }
    }

    lineas.push("");
    lineas.push(`💰 *TOTAL ESTIMADO: Bs ${totalBs.toFixed(2)}*`);

    if (notasPedido.trim()) {
      lineas.push(`📝 *Observación:* ${notasPedido.trim()}`);
    }

    const texto = encodeURIComponent(lineas.join("\n"));
    window.open(`https://wa.me/${NUMERO_WHATSAPP}?text=${texto}`, "_blank");
  }

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Cabecera pública */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-stone-950/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-amber-400 via-orange-500 to-rose-600 text-xl shadow-lg shadow-orange-600/30">
              🔥
            </div>
            <div>
              <h1 className="text-base font-black uppercase tracking-tight text-white sm:text-lg">
                La Caprichosa
              </h1>
              <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-amber-400">
                Grill &amp; Burger
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setCarritoAbierto(true)}
              className="relative inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 px-4 py-2.5 text-sm font-extrabold text-stone-950 shadow-lg shadow-orange-600/25 transition hover:brightness-105 active:scale-95"
            >
              <span>🛒</span>
              <span>Mi Pedido</span>
              {totalUnidades > 0 && (
                <span className="rounded-full bg-stone-950 px-2 py-0.5 text-xs font-black text-amber-300">
                  {totalUnidades} · Bs {totalBs.toFixed(0)}
                </span>
              )}
            </button>

            <Link
              href="/login"
              className="hidden rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-stone-400 transition hover:text-white sm:inline-block"
            >
              Personal
            </Link>
          </div>
        </div>
      </header>

      {/* Hero compacto */}
      <section className="relative overflow-hidden border-b border-white/[0.07] bg-gradient-to-b from-stone-900/90 to-stone-950 px-4 py-8 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <span className="inline-block rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-amber-300">
            Carta en vivo · Sin registro ni cuentas
          </span>
          <h2 className="mt-3 text-2xl font-black tracking-tight text-white sm:text-4xl">
            Elige tu corte o burger y pídelo directo por WhatsApp
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-stone-400 sm:text-base">
            Arma tu carrito con términos de cocción y guarniciones a tu gusto, y
            envíanos tu orden para coordinar entrega o recojo en el local.
          </p>

          {/* Buscador y categorías */}
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar churrasco, burger, soda..."
              className="w-full rounded-2xl border border-white/10 bg-stone-900 px-4 py-2.5 text-sm text-white placeholder-stone-500 outline-none focus:border-amber-400 sm:max-w-xs"
            />

            <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <button
                type="button"
                onClick={() => setCategoriaActiva("Todas")}
                className={`shrink-0 rounded-2xl px-3.5 py-2 text-xs font-bold transition ${
                  categoriaActiva === "Todas"
                    ? "bg-amber-400 text-stone-950"
                    : "border border-white/10 bg-white/[0.04] text-stone-300 hover:bg-white/10"
                }`}
              >
                🍽️ Todas
              </button>
              {categorias.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategoriaActiva(cat.nombre)}
                  className={`shrink-0 rounded-2xl px-3.5 py-2 text-xs font-bold transition ${
                    categoriaActiva === cat.nombre
                      ? "bg-amber-400 text-stone-950"
                      : "border border-white/10 bg-white/[0.04] text-stone-300 hover:bg-white/10"
                  }`}
                >
                  {cat.emoji} {cat.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Grilla del menú */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        {cargando ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div
                key={n}
                className="h-64 animate-pulse rounded-3xl border border-white/10 bg-stone-900/60"
              />
            ))}
          </div>
        ) : itemsFiltrados.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-stone-900/50 p-10 text-center">
            <p className="text-lg font-bold text-stone-200">
              No encontramos platos con ese filtro
            </p>
            <p className="mt-1 text-sm text-stone-400">
              Prueba cambiando de categoría o limpiando el buscador.
            </p>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {itemsFiltrados.map((item) => {
              const agotado = item.controlar_stock && item.stock_actual <= 0;
              return (
                <article
                  key={item.id}
                  onClick={() => abrirProducto(item)}
                  className={`group flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-stone-900/80 transition ${
                    agotado
                      ? "cursor-not-allowed opacity-60"
                      : "cursor-pointer hover:border-amber-400/50 hover:bg-stone-900"
                  }`}
                >
                  <div className="relative h-44 w-full overflow-hidden bg-stone-800">
                    {item.imagen_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.imagen_url}
                        alt={item.nombre}
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-4xl">
                        🔥
                      </div>
                    )}

                    <span className="absolute left-3 top-3 rounded-full bg-stone-950/85 px-2.5 py-1 text-[11px] font-bold text-amber-300 backdrop-blur">
                      {item.categoria}
                    </span>

                    {agotado && (
                      <span className="absolute right-3 top-3 rounded-full bg-rose-600 px-2.5 py-1 text-[11px] font-extrabold text-white">
                        Agotado
                      </span>
                    )}
                  </div>

                  <div className="flex flex-1 flex-col justify-between p-4">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-base font-extrabold text-white">
                          {item.nombre}
                        </h3>
                        <span className="shrink-0 rounded-xl bg-amber-400/15 px-2.5 py-1 text-sm font-black text-amber-300">
                          Bs {Number(item.precio_base).toFixed(0)}
                        </span>
                      </div>

                      {item.descripcion && (
                        <p className="mt-1.5 line-clamp-2 text-xs text-stone-400">
                          {item.descripcion}
                        </p>
                      )}

                      {item.guarnicion_incluida && (
                        <p className="mt-2 text-[11px] font-semibold text-emerald-400">
                          ✓ Incluye: {item.guarnicion_incluida}
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={agotado}
                      className="mt-4 w-full rounded-2xl bg-white/[0.07] py-2.5 text-xs font-extrabold text-white transition group-hover:bg-amber-400 group-hover:text-stone-950 disabled:pointer-events-none"
                    >
                      {agotado ? "Sin stock por hoy" : "+ Elegir y agregar"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      {/* Pie de página con política de privacidad clara */}
      <footer className="border-t border-white/10 bg-stone-950 px-4 py-6 text-xs text-stone-400 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 sm:flex-row">
          <p>
            © {new Date().getFullYear()} La Caprichosa Grill &amp; Burger ·
            Pedidos directos sin creación de cuentas.
          </p>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setMostrarPoliticas(true)}
              className="underline decoration-amber-400/60 underline-offset-4 hover:text-amber-300"
            >
              Política de Privacidad y Condiciones de Pedido
            </button>
            <Link href="/login" className="hover:text-white">
              Acceso equipo
            </Link>
          </div>
        </div>
      </footer>

      {/* Modal de personalización del plato */}
      {productoModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/10 bg-stone-900 p-5 sm:rounded-3xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-black text-white">
                  {productoModal.nombre}
                </h3>
                <p className="mt-0.5 text-xs text-stone-400">
                  {productoModal.descripcion}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setProductoModal(null)}
                className="rounded-xl bg-white/10 px-3 py-1.5 text-xs font-bold text-stone-300 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {(productoModal.personalizacion ?? []).map((grupo) => (
                <div
                  key={grupo.titulo}
                  className="rounded-2xl border border-white/10 bg-stone-950/60 p-3.5"
                >
                  <p className="text-xs font-extrabold uppercase tracking-wider text-amber-300">
                    {grupo.titulo}
                  </p>
                  <div className="mt-2 space-y-2">
                    {grupo.opciones.map((op) => {
                      const activa = (selecciones[grupo.titulo] ?? []).includes(
                        op.nombre,
                      );
                      return (
                        <button
                          key={op.nombre}
                          type="button"
                          onClick={() => toggleOpcion(grupo, op.nombre)}
                          className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-xs font-semibold transition ${
                            activa
                              ? "border-amber-400 bg-amber-400/15 text-white"
                              : "border-white/10 bg-white/[0.02] text-stone-300 hover:bg-white/5"
                          }`}
                        >
                          <span>
                            {activa ? "✓ " : ""}
                            {op.nombre}
                          </span>
                          {op.precioExtra > 0 && (
                            <span className="font-bold text-amber-300">
                              + Bs {op.precioExtra}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              <div>
                <label className="block text-xs font-bold text-stone-300">
                  Nota para cocina (opcional)
                </label>
                <input
                  type="text"
                  value={notaModal}
                  onChange={(e) => setNotaModal(e.target.value)}
                  placeholder="Ej. Sin cebolla, bien jugoso..."
                  className="mt-1 w-full rounded-xl border border-white/10 bg-stone-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
                />
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between gap-3 border-t border-white/10 pt-4">
              <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-stone-950 px-2 py-1">
                <button
                  type="button"
                  onClick={() => setCantidadModal((c) => Math.max(1, c - 1))}
                  className="h-8 w-8 rounded-xl bg-white/10 font-bold text-white"
                >
                  -
                </button>
                <span className="w-7 text-center text-sm font-black">
                  {cantidadModal}
                </span>
                <button
                  type="button"
                  onClick={() => setCantidadModal((c) => c + 1)}
                  className="h-8 w-8 rounded-xl bg-white/10 font-bold text-white"
                >
                  +
                </button>
              </div>

              <button
                type="button"
                onClick={agregarAlCarrito}
                className="flex-1 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 py-3 text-sm font-black text-stone-950 shadow-lg shadow-orange-600/25"
              >
                Agregar · Bs {(precioModalUnitario * cantidadModal).toFixed(2)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Drawer del Carrito + WhatsApp */}
      {carritoAbierto && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/75 backdrop-blur-sm">
          <div className="flex h-full w-full max-w-md flex-col border-l border-white/10 bg-stone-900 p-5">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-lg font-black text-white">🛒 Tu Pedido</h3>
              <button
                type="button"
                onClick={() => setCarritoAbierto(false)}
                className="rounded-xl bg-white/10 px-3 py-1.5 text-xs font-bold text-stone-300"
              >
                Cerrar
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto py-4">
              {carrito.length === 0 ? (
                <p className="py-12 text-center text-sm text-stone-400">
                  Aún no agregaste platos o bebidas a tu carrito.
                </p>
              ) : (
                <>
                  {carrito.map((item) => (
                    <div
                      key={item.uid}
                      className="rounded-2xl border border-white/10 bg-stone-950/70 p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-extrabold text-white">
                            {item.nombre}
                          </p>
                          {item.extrasTexto.map((ex) => (
                            <p key={ex} className="text-[11px] text-stone-400">
                              {ex}
                            </p>
                          ))}
                          {item.nota && (
                            <p className="text-[11px] text-amber-300">
                              Nota: {item.nota}
                            </p>
                          )}
                        </div>
                        <span className="text-sm font-black text-amber-300">
                          Bs {(item.precioUnitario * item.cantidad).toFixed(2)}
                        </span>
                      </div>

                      <div className="mt-2.5 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            actualizarCantidadCarrito(item.uid, -1)
                          }
                          className="h-7 w-7 rounded-lg bg-white/10 text-xs font-bold"
                        >
                          -
                        </button>
                        <span className="text-xs font-bold">
                          {item.cantidad}
                        </span>
                        <button
                          type="button"
                          onClick={() => actualizarCantidadCarrito(item.uid, 1)}
                          className="h-7 w-7 rounded-lg bg-white/10 text-xs font-bold"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Datos mínimos para coordinar */}
                  <div className="space-y-3 rounded-2xl border border-white/10 bg-stone-950/60 p-3.5">
                    <p className="text-xs font-extrabold uppercase tracking-wider text-amber-300">
                      Datos para coordinar
                    </p>

                    <input
                      type="text"
                      value={nombreCliente}
                      onChange={(e) => setNombreCliente(e.target.value)}
                      placeholder="Tu nombre o apodo"
                      className="w-full rounded-xl border border-white/10 bg-stone-900 px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
                    />

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setTipoEntrega("recoger")}
                        className={`rounded-xl py-2 text-xs font-extrabold transition ${
                          tipoEntrega === "recoger"
                            ? "bg-amber-400 text-stone-950"
                            : "border border-white/10 bg-stone-900 text-stone-300"
                        }`}
                      >
                        🏪 Paso a recoger
                      </button>
                      <button
                        type="button"
                        onClick={() => setTipoEntrega("delivery")}
                        className={`rounded-xl py-2 text-xs font-extrabold transition ${
                          tipoEntrega === "delivery"
                            ? "bg-amber-400 text-stone-950"
                            : "border border-white/10 bg-stone-900 text-stone-300"
                        }`}
                      >
                        🛵 Delivery
                      </button>
                    </div>

                    {tipoEntrega === "delivery" && (
                      <input
                        type="text"
                        value={direccionDelivery}
                        onChange={(e) => setDireccionDelivery(e.target.value)}
                        placeholder="Zona / Calle / Referencia de entrega"
                        className="w-full rounded-xl border border-white/10 bg-stone-900 px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
                      />
                    )}

                    <input
                      type="text"
                      value={notasPedido}
                      onChange={(e) => setNotasPedido(e.target.value)}
                      placeholder="Hora aproximada o nota general (opcional)"
                      className="w-full rounded-xl border border-white/10 bg-stone-900 px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
                    />
                  </div>
                </>
              )}
            </div>

            {carrito.length > 0 && (
              <div className="border-t border-white/10 pt-4">
                <div className="mb-3 flex items-center justify-between text-base font-black">
                  <span>Total estimado</span>
                  <span className="text-amber-300">
                    Bs {totalBs.toFixed(2)}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={enviarPedidoWhatsApp}
                  className="w-full rounded-2xl bg-emerald-500 py-3.5 text-sm font-black text-stone-950 shadow-lg shadow-emerald-600/25 transition hover:bg-emerald-400"
                >
                  📲 Enviar pedido por WhatsApp
                </button>

                <p className="mt-2 text-center text-[11px] text-stone-400">
                  No creamos cuentas ni almacenamos contraseñas. Al enviar,
                  aceptas nuestra{" "}
                  <button
                    type="button"
                    onClick={() => setMostrarPoliticas(true)}
                    className="underline hover:text-amber-300"
                  >
                    Política de Privacidad
                  </button>
                  .
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal de Política de Privacidad y Condiciones */}
      {mostrarPoliticas && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-3xl border border-white/10 bg-stone-900 p-6 text-sm text-stone-300">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-white">
                Política de Privacidad y Condiciones
              </h3>
              <button
                type="button"
                onClick={() => setMostrarPoliticas(false)}
                className="rounded-xl bg-white/10 px-3 py-1 text-xs font-bold"
              >
                ✕
              </button>
            </div>
            <div className="mt-4 space-y-3 text-xs leading-relaxed text-stone-300">
              <p>
                <strong>1. Sin registro de cuentas:</strong> Esta tienda digital
                no solicita ni crea cuentas de usuario, contraseñas ni perfiles
                permanentes de clientes.
              </p>
              <p>
                <strong>2. Uso mínimo de datos:</strong> El nombre, modalidad de
                entrega o referencia que escribas se utilizan únicamente para
                armar el mensaje de WhatsApp y coordinar la preparación o
                entrega de tu orden.
              </p>
              <p>
                <strong>3. Confirmación y pago:</strong> Los precios y
                disponibilidad se sincronizan con la carta del local. La
                preparación en cocina y el costo de delivery (si aplica) se
                confirman directamente por WhatsApp antes de despachar.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
