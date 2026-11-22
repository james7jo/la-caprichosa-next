"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  ajustarStockRapidoMenu,
  crearCategoriaMenu,
  guardarMenuItem,
} from "@/actions/menu.actions";

type ItemStockCaja = {
  id: string;
  nombre: string;
  descripcion?: string | null;
  categoria: string;
  tipo_item?: string | null;
  precio_base: number;
  imagen_url?: string | null;
  stock_actual: number;
  stock_minimo: number;
  controlar_stock: boolean;
  activo: boolean;
};

type CategoriaOpcion = {
  id: string;
  nombre: string;
  label?: string | null;
  emoji?: string | null;
};

const tarjetaClase =
  "rounded-3xl border border-white/[0.07] bg-gradient-to-b from-stone-900 to-stone-900/60 p-5 sm:p-6 shadow-lg shadow-black/20";

async function subirFotoMenuCaja(
  file: File,
  nombreItem: string,
): Promise<string> {
  const supabase = createClient();
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const slug =
    nombreItem
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9._-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "plato";
  const filePath = `${slug}-${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from("menu")
    .upload(filePath, file, { upsert: true });

  if (error) {
    throw new Error(`Error al subir foto: ${error.message}`);
  }

  const { data } = supabase.storage.from("menu").getPublicUrl(filePath);
  return data.publicUrl;
}

export default function CajaStockRapidoPage() {
  const router = useRouter();
  const [items, setItems] = useState<ItemStockCaja[]>([]);
  const [categorias, setCategorias] = useState<CategoriaOpcion[]>([]);
  const [emojiPorCat, setEmojiPorCat] = useState<Record<string, string>>({});
  const [busqueda, setBusqueda] = useState("");
  const [soloAlertas, setSoloAlertas] = useState(false);
  const [cargando, setCargando] = useState(true);

  // Modal para agregar plato o producto nuevo desde Caja (con foto por archivo)
  const [modalNuevoAbierto, setModalNuevoAbierto] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevaCategoria, setNuevaCategoria] = useState("");
  const [nuevoTipoItem, setNuevoTipoItem] = useState<"plato" | "unidad">(
    "plato",
  );
  const [nuevoPrecio, setNuevoPrecio] = useState("");
  const [nuevaDescripcion, setNuevaDescripcion] = useState("");
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [nuevoControlarStock, setNuevoControlarStock] = useState(true);
  const [nuevoStockInicial, setNuevoStockInicial] = useState("10");
  const [nuevoStockMinimo, setNuevoStockMinimo] = useState("3");

  // Mini creación de sección dentro del modal
  const [creandoSeccion, setCreandoSeccion] = useState(false);
  const [nombreNuevaSeccion, setNombreNuevaSeccion] = useState("");
  const [emojiNuevaSeccion, setEmojiNuevaSeccion] = useState("🍽️");

  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [aviso, setAviso] = useState<{
    tipo: "ok" | "error";
    texto: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 2000);
    return () => clearTimeout(t);
  }, [aviso]);

  const cargarStock = useCallback(async () => {
    const supabase = createClient();
    const [{ data, error }, { data: catsData }] = await Promise.all([
      supabase
        .from("menu_items")
        .select(
          "id, nombre, descripcion, categoria, tipo_item, precio_base, imagen_url, stock_actual, stock_minimo, controlar_stock, activo",
        )
        .eq("activo", true)
        .order("nombre", { ascending: true }),
      supabase
        .from("menu_categorias")
        .select("id, nombre, label, emoji")
        .order("orden", { ascending: true }),
    ]);

    const catsLista = (catsData as CategoriaOpcion[] | null) ?? [];
    setCategorias(catsLista);

    const mapaEmojis: Record<string, string> = {};
    catsLista.forEach((c) => {
      if (c.nombre) mapaEmojis[c.nombre] = c.emoji || "🍽️";
    });
    setEmojiPorCat(mapaEmojis);

    if (catsLista.length > 0) {
      setNuevaCategoria((prev) => prev || catsLista[0].nombre);
    }

    if (!error && data) {
      setItems(
        (data as ItemStockCaja[]).map((it) => ({
          ...it,
          precio_base: Number(it.precio_base || 0),
          stock_actual: Number(it.stock_actual || 0),
          stock_minimo: Number(it.stock_minimo || 0),
        })),
      );
    }
    setCargando(false);
  }, []);

  useEffect(() => {
    void cargarStock();

    const supabase = createClient();
    const canal = supabase
      .channel("caja-stock-rapido-rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "menu_items" },
        () => {
          void cargarStock();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(canal);
    };
  }, [cargarStock]);

  function handleSeleccionarFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setFotoFile(file);
    if (file) {
      setFotoPreview(URL.createObjectURL(file));
    } else {
      setFotoPreview(null);
    }
  }

  function limpiarModalNuevo() {
    setNuevoNombre("");
    setNuevaDescripcion("");
    setFotoFile(null);
    setFotoPreview(null);
    setNuevoPrecio("");
    setNuevoStockInicial("10");
    setNuevoStockMinimo("3");
    setCreandoSeccion(false);
    setNombreNuevaSeccion("");
  }

  function handleAjuste(item: ItemStockCaja, delta: number) {
    const siguienteStock = Math.max(0, item.stock_actual + delta);
    if (siguienteStock === item.stock_actual && delta < 0) return;

    setItems((prev) =>
      prev.map((it) =>
        it.id === item.id ? { ...it, stock_actual: siguienteStock } : it,
      ),
    );

    startTransition(async () => {
      const res = await ajustarStockRapidoMenu(item.id, delta);
      if (res?.error) {
        setAviso({ tipo: "error", texto: res.error });
        await cargarStock();
        return;
      }
      setAviso({
        tipo: "ok",
        texto: `${item.nombre}: ${siguienteStock} en stock.`,
      });
      await cargarStock();
      router.refresh();
    });
  }

  function handleCrearSeccionRapida() {
    if (!nombreNuevaSeccion.trim()) return;
    startTransition(async () => {
      const res = await crearCategoriaMenu({
        nombre: nombreNuevaSeccion.trim(),
        emoji: emojiNuevaSeccion.trim() || "🍽️",
      });
      if (res?.error) {
        setAviso({ tipo: "error", texto: res.error });
        return;
      }
      const creadaNombre = res?.categoria?.nombre || nombreNuevaSeccion.trim();
      setNuevaCategoria(creadaNombre);
      setNombreNuevaSeccion("");
      setCreandoSeccion(false);
      setAviso({ tipo: "ok", texto: `Sección "${creadaNombre}" creada.` });
      await cargarStock();
    });
  }

  function handleCrearPlatoNuevo(e: React.FormEvent) {
    e.preventDefault();
    const nombreLimpio = nuevoNombre.trim();
    if (!nombreLimpio) {
      setAviso({
        tipo: "error",
        texto: "Escribe el nombre del plato o producto.",
      });
      return;
    }

    const precioNum = Math.max(0, Number(nuevoPrecio) || 0);
    const stockNum = Math.max(0, Number(nuevoStockInicial) || 0);
    const minimoNum = Math.max(0, Number(nuevoStockMinimo) || 0);
    const catFinal = nuevaCategoria || categorias[0]?.nombre || "General";

    startTransition(async () => {
      try {
        let imagenUrlFinal: string | null = null;
        if (fotoFile) {
          setSubiendoFoto(true);
          imagenUrlFinal = await subirFotoMenuCaja(fotoFile, nombreLimpio);
          setSubiendoFoto(false);
        }

        const res = await guardarMenuItem({
          nombre: nombreLimpio,
          descripcion: nuevaDescripcion.trim(),
          categoria: catFinal,
          tipo_item: nuevoTipoItem,
          precio_base: precioNum,
          imagen_url: imagenUrlFinal,
          personalizacion: [],
          stock_actual: nuevoControlarStock ? stockNum : 0,
          stock_minimo: nuevoControlarStock ? minimoNum : 0,
          controlar_stock: nuevoControlarStock,
          activo: true,
        });

        if (res?.error) {
          setAviso({ tipo: "error", texto: res.error });
          return;
        }

        limpiarModalNuevo();
        setModalNuevoAbierto(false);
        setAviso({
          tipo: "ok",
          texto: `"${nombreLimpio}" agregado al menú.`,
        });
        await cargarStock();
        router.refresh();
      } catch (err) {
        setSubiendoFoto(false);
        setAviso({
          tipo: "error",
          texto:
            err instanceof Error
              ? err.message
              : "No se pudo guardar el producto.",
        });
      }
    });
  }

  const filtrados = items.filter((it) => {
    const esBajo = it.controlar_stock && it.stock_actual <= it.stock_minimo;
    if (soloAlertas && !esBajo) return false;
    const q = busqueda.trim().toLowerCase();
    if (!q) return true;
    return (
      it.nombre.toLowerCase().includes(q) ||
      it.categoria.toLowerCase().includes(q)
    );
  });

  const alertasCount = items.filter(
    (it) => it.controlar_stock && it.stock_actual <= it.stock_minimo,
  ).length;

  const ocupado = isPending || subiendoFoto;

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl border border-white/[0.07] bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-stone-900 p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight text-white">
              Stock rápido en turno
            </h2>
            <p className="mt-1 text-xs text-stone-300 sm:text-sm">
              Ajusta cantidades al momento o agrega platos nuevos con su foto.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-400/35 bg-amber-400/15 px-3.5 py-1.5 text-xs font-extrabold text-amber-200">
              <span>⚠️</span>
              <span>{alertasCount} bajos / agotados</span>
            </span>

            <button
              type="button"
              onClick={() => setModalNuevoAbierto(true)}
              className="rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 px-4 py-2 text-xs font-black text-stone-950 shadow-lg shadow-orange-600/25 transition hover:brightness-110 active:scale-95"
            >
              + Nuevo plato / producto
            </button>
          </div>
        </div>
      </div>

      {aviso && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm font-bold ${
            aviso.tipo === "error"
              ? "border-rose-400/35 bg-rose-500/15 text-rose-200"
              : "border-emerald-400/35 bg-emerald-500/15 text-emerald-200"
          }`}
        >
          {aviso.texto}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar bebida, soda o producto..."
          className="flex-1 rounded-2xl border border-white/10 bg-stone-900 px-4 py-3 text-sm text-white placeholder:text-stone-500 focus:border-amber-400 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setSoloAlertas((v) => !v)}
          className={`rounded-2xl border px-4 py-3 text-xs font-extrabold transition ${
            soloAlertas
              ? "border-amber-400 bg-gradient-to-r from-amber-400 to-orange-500 text-stone-950"
              : "border-white/10 bg-stone-900 text-stone-200 hover:border-white/25"
          }`}
        >
          {soloAlertas ? "Mostrando solo alertas" : "Ver solo bajos / agotados"}
        </button>
      </div>

      {cargando ? (
        <div className="h-64 animate-pulse rounded-3xl bg-stone-900/70" />
      ) : filtrados.length === 0 ? (
        <div className={`${tarjetaClase} text-center text-sm text-stone-400`}>
          No hay productos que coincidan con el filtro.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtrados.map((item) => {
            const agotado = item.controlar_stock && item.stock_actual <= 0;
            const bajo =
              item.controlar_stock &&
              !agotado &&
              item.stock_actual <= item.stock_minimo;
            const emojiFallback = emojiPorCat[item.categoria] || "🍽️";

            return (
              <div
                key={item.id}
                className={`${tarjetaClase} flex flex-col justify-between gap-4`}
              >
                <div className="flex items-start gap-3.5">
                  <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/10 bg-stone-950 text-2xl">
                    {item.imagen_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.imagen_url}
                        alt={item.nombre}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span>{emojiFallback}</span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-2 text-base font-extrabold leading-snug text-white">
                        {item.nombre}
                      </p>
                      {!item.controlar_stock ? (
                        <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-0.5 text-[10px] font-bold text-stone-300">
                          Libre
                        </span>
                      ) : agotado ? (
                        <span className="shrink-0 rounded-full bg-rose-500/20 px-2.5 py-0.5 text-[10px] font-extrabold text-rose-300">
                          Agotado
                        </span>
                      ) : bajo ? (
                        <span className="shrink-0 rounded-full bg-amber-400/20 px-2.5 py-0.5 text-[10px] font-extrabold text-amber-300">
                          Stock bajo
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[10px] font-extrabold text-emerald-300">
                          Disponible
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-stone-400">
                      {item.categoria} · Bs {item.precio_base.toFixed(2)}
                    </p>
                  </div>
                </div>

                {item.controlar_stock ? (
                  <div className="flex items-center justify-between gap-2 rounded-2xl border border-white/[0.07] bg-stone-950/90 px-3.5 py-2.5">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                        Existencia actual
                      </p>
                      <p className="text-xl font-black tabular-nums text-white">
                        {item.stock_actual}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={ocupado || item.stock_actual <= 0}
                        onClick={() => handleAjuste(item, -1)}
                        className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5 text-base font-black text-white transition hover:bg-white/10 active:scale-95 disabled:opacity-40"
                        aria-label={`Restar 1 a ${item.nombre}`}
                      >
                        −
                      </button>
                      <button
                        type="button"
                        disabled={ocupado}
                        onClick={() => handleAjuste(item, 1)}
                        className="grid h-10 w-10 place-items-center rounded-xl bg-amber-400/20 text-base font-black text-amber-300 transition hover:bg-amber-400 hover:text-stone-950 active:scale-95 disabled:opacity-40"
                        aria-label={`Sumar 1 a ${item.nombre}`}
                      >
                        +
                      </button>
                      <button
                        type="button"
                        disabled={ocupado}
                        onClick={() => handleAjuste(item, 5)}
                        className="rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 px-2.5 py-2 text-xs font-black text-stone-950 transition hover:brightness-110 active:scale-95 disabled:opacity-40"
                      >
                        +5
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-stone-500">
                    Este producto no lleva contador numérico de stock.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal para crear plato/producto con subida de foto desde archivo */}
      {modalNuevoAbierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-3xl border border-white/10 bg-stone-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/[0.07] pb-3.5">
              <div>
                <h3 className="text-lg font-black text-white">
                  Nuevo plato o producto
                </h3>
                <p className="text-xs text-stone-400">
                  Sube o toma la foto desde tu dispositivo y guárdalo en la
                  carta.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setModalNuevoAbierto(false);
                  limpiarModalNuevo();
                }}
                className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 text-sm font-bold text-white hover:bg-white/15"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCrearPlatoNuevo} className="mt-4 space-y-4">
              {/* Foto por archivo (galería o cámara en celular/PC) */}
              <div className="flex items-center gap-4 rounded-2xl border border-white/[0.07] bg-stone-950/70 p-3.5">
                <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/10 bg-stone-900 text-2xl">
                  {fotoPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={fotoPreview}
                      alt={nuevoNombre || "Vista previa"}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span>{emojiPorCat[nuevaCategoria] || "🍽️"}</span>
                  )}
                </div>

                <div className="min-w-0 flex-1 space-y-1">
                  <label className="block text-xs font-bold text-stone-300">
                    Foto del plato o producto
                  </label>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-amber-400/20 px-3.5 py-2 text-xs font-extrabold text-amber-300 transition hover:bg-amber-400/30 active:scale-95">
                    📷 {fotoPreview ? "Cambiar foto" : "Elegir o tomar foto"}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleSeleccionarFoto}
                      className="sr-only"
                    />
                  </label>
                  <p className="text-[11px] text-stone-500">
                    {fotoFile
                      ? fotoFile.name
                      : "Desde tu galería o cámara (JPG, PNG, WebP)."}
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-stone-300">
                  Nombre del plato / producto
                </label>
                <input
                  type="text"
                  required
                  value={nuevoNombre}
                  onChange={(e) => setNuevoNombre(e.target.value)}
                  placeholder="Ej. Caldo de pollo, Alitas picantes, Soda"
                  className="w-full rounded-xl border border-white/10 bg-stone-950 px-3.5 py-2.5 text-sm text-white"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-stone-300">
                      Sección / categoría
                    </label>
                    <button
                      type="button"
                      onClick={() => setCreandoSeccion((v) => !v)}
                      className="text-xs font-extrabold text-amber-300 hover:underline"
                    >
                      {creandoSeccion ? "Cancelar" : "+ Nueva sección"}
                    </button>
                  </div>
                  <select
                    value={nuevaCategoria}
                    onChange={(e) => setNuevaCategoria(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-stone-950 px-3 py-2.5 text-sm text-white"
                  >
                    {categorias.map((c) => (
                      <option key={c.id} value={c.nombre}>
                        {c.emoji ? `${c.emoji} ` : ""}
                        {c.label || c.nombre}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-stone-300">
                    Tipo en carta
                  </label>
                  <select
                    value={nuevoTipoItem}
                    onChange={(e) =>
                      setNuevoTipoItem(
                        e.target.value === "unidad" ? "unidad" : "plato",
                      )
                    }
                    className="w-full rounded-xl border border-white/10 bg-stone-950 px-3 py-2.5 text-sm text-white"
                  >
                    <option value="plato">🍽️ Plato / cocina</option>
                    <option value="unidad">🥤 Por unidad</option>
                  </select>
                </div>
              </div>

              {creandoSeccion && (
                <div className="flex items-center gap-2 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-3">
                  <input
                    type="text"
                    value={emojiNuevaSeccion}
                    onChange={(e) => setEmojiNuevaSeccion(e.target.value)}
                    className="w-14 rounded-xl border border-white/10 bg-stone-950 px-2 py-2 text-center text-sm text-white"
                    aria-label="Emoji de la nueva sección"
                  />
                  <input
                    type="text"
                    value={nombreNuevaSeccion}
                    onChange={(e) => setNombreNuevaSeccion(e.target.value)}
                    placeholder="Nombre sección (ej. Caldos)"
                    className="min-w-0 flex-1 rounded-xl border border-white/10 bg-stone-950 px-3 py-2 text-sm text-white"
                  />
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={handleCrearSeccionRapida}
                    className="rounded-xl bg-amber-400 px-3 py-2 text-xs font-black text-stone-950"
                  >
                    Crear
                  </button>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-stone-300">
                  Precio (Bs)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  required
                  value={nuevoPrecio}
                  onChange={(e) => setNuevoPrecio(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-xl border border-white/10 bg-stone-950 px-3.5 py-2.5 text-sm text-white"
                />
              </div>

              <div className="flex items-center justify-between rounded-2xl border border-white/[0.07] bg-stone-950 px-3.5 py-2.5">
                <span className="text-xs font-bold text-stone-200">
                  Controlar stock de este producto
                </span>
                <input
                  type="checkbox"
                  checked={nuevoControlarStock}
                  onChange={(e) => setNuevoControlarStock(e.target.checked)}
                  className="h-4 w-4 accent-amber-400"
                />
              </div>

              {nuevoControlarStock && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-stone-300">
                      Stock inicial
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={nuevoStockInicial}
                      onChange={(e) => setNuevoStockInicial(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-stone-950 px-3.5 py-2.5 text-sm text-white"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-stone-300">
                      Alerta stock bajo
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={nuevoStockMinimo}
                      onChange={(e) => setNuevoStockMinimo(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-stone-950 px-3.5 py-2.5 text-sm text-white"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-stone-300">
                  Descripción corta (opcional)
                </label>
                <input
                  type="text"
                  value={nuevaDescripcion}
                  onChange={(e) => setNuevaDescripcion(e.target.value)}
                  placeholder="Ej. Plato del día con guarnición"
                  className="w-full rounded-xl border border-white/10 bg-stone-950 px-3.5 py-2.5 text-sm text-white"
                />
              </div>

              <button
                type="submit"
                disabled={ocupado}
                className="w-full rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 py-3 text-sm font-black text-stone-950 shadow-lg shadow-orange-600/25 transition hover:brightness-110 disabled:opacity-50"
              >
                {subiendoFoto
                  ? "Subiendo foto..."
                  : isPending
                    ? "Guardando..."
                    : "Guardar en el menú"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
