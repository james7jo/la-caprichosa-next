"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  ajustarStockRapidoMenu,
  crearCategoriaMenu,
  eliminarMenuItem,
  guardarMenuItem,
  type GrupoPersonalizacion,
  type TipoItemMenu,
} from "@/actions/menu.actions";

export type CategoriaMenu = {
  id: string;
  nombre: string;
  label: string;
  emoji: string;
  orden: number;
};

export type ProductoMenuDB = {
  id: string;
  codigo_legacy?: string | null;
  nombre: string;
  descripcion: string;
  categoria: string;
  tipo_item?: TipoItemMenu | null;
  precio_base: number;
  guarnicion_incluida?: string | null;
  imagen_url?: string | null;
  personalizacion?: GrupoPersonalizacion[] | null;
  stock_actual: number;
  stock_minimo: number;
  controlar_stock: boolean;
  activo: boolean;
};

const EMOJIS_SECCION = [
  "🍲",
  "🍔",
  "🥩",
  "🔥",
  "⚡",
  "🫙",
  "🥤",
  "🍗",
  "🍟",
  "🍽️",
];

// text-base en celular evita el zoom automático de iOS al tocar un campo
const inputCls =
  "w-full rounded-xl border border-white/10 bg-stone-950 px-3.5 py-3 text-base text-white placeholder:text-stone-600 transition focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/20 sm:py-2.5 sm:text-sm";
const labelCls =
  "text-xs font-semibold uppercase tracking-wider text-stone-400";
const cardCls =
  "rounded-3xl border border-white/[0.07] bg-gradient-to-b from-stone-900 to-stone-900/60 shadow-lg shadow-black/20";
const bloqueCls =
  "space-y-4 rounded-2xl border border-white/[0.07] bg-stone-950/60 p-4";

const estilos = `
@keyframes subeSheet { from { transform: translateY(100%); } to { transform: translateY(0); } }
@keyframes entraLado { from { transform: translateX(100%); } to { transform: translateX(0); } }
@keyframes fundido { from { opacity: 0; } to { opacity: 1; } }
@keyframes bajaToast { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: none; } }
.anim-sheet { animation: subeSheet .28s cubic-bezier(.2,.8,.2,1); }
.anim-fondo { animation: fundido .2s ease-out; }
.anim-toast { animation: bajaToast .25s ease-out; }
@media (min-width: 768px) { .anim-sheet { animation: entraLado .28s cubic-bezier(.2,.8,.2,1); } }
@media (prefers-reduced-motion: reduce) { .anim-sheet, .anim-fondo, .anim-toast { animation: none !important; } }
`;

function inferirTipoPorCategoria(cat: string): TipoItemMenu {
  const norm = cat.trim().toLowerCase();
  if (
    norm.includes("bebida") ||
    norm.includes("soda") ||
    norm.includes("vino") ||
    norm.includes("cerveza") ||
    norm.includes("refresco")
  ) {
    return "unidad";
  }
  return "plato";
}

async function subirFotoMenu(file: File, nombreItem: string): Promise<string> {
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
    throw new Error(`Error al subir foto del menú: ${error.message}`);
  }

  const { data } = supabase.storage.from("menu").getPublicUrl(filePath);
  return data.publicUrl;
}

// Stock editable directamente: escribes el número y se guarda al salir del campo o con Enter
function StockInput({
  item,
  deshabilitado,
  onGuardar,
}: {
  item: ProductoMenuDB;
  deshabilitado: boolean;
  onGuardar: (nuevo: number) => void;
}) {
  const [valor, setValor] = useState(String(item.stock_actual));
  const bajo = item.controlar_stock && item.stock_actual <= item.stock_minimo;

  useEffect(() => {
    if (!deshabilitado) setValor(String(item.stock_actual));
  }, [deshabilitado, item.stock_actual]);

  function confirmar() {
    const n = Math.floor(Number(valor));
    if (valor.trim() === "" || !Number.isFinite(n) || n < 0) {
      setValor(String(item.stock_actual));
      return;
    }
    if (n === item.stock_actual) {
      setValor(String(n));
      return;
    }
    onGuardar(n);
  }

  return (
    <label
      className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-bold transition focus-within:ring-2 focus-within:ring-amber-400/40 ${
        bajo
          ? "border-amber-500/40 bg-amber-500/15 text-amber-300"
          : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
      }`}
    >
      <span>{bajo ? "⚠️ Stock" : "Stock"}</span>
      <input
        type="number"
        inputMode="numeric"
        min="0"
        step="1"
        value={valor}
        disabled={deshabilitado}
        onChange={(e) => setValor(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={confirmar}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        aria-label={`Stock de ${item.nombre}`}
        className="h-9 w-16 rounded-lg border border-white/10 bg-stone-950 text-center text-base font-extrabold text-white focus:border-amber-400 focus:outline-none disabled:opacity-60 sm:text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
    </label>
  );
}

export function MenuManager({
  categorias: categoriasIniciales,
  productosIniciales,
}: {
  categorias: CategoriaMenu[];
  productosIniciales: ProductoMenuDB[];
}) {
  const router = useRouter();
  const [categorias, setCategorias] =
    useState<CategoriaMenu[]>(categoriasIniciales);
  const [productos, setProductos] =
    useState<ProductoMenuDB[]>(productosIniciales);
  const [filtroCat, setFiltroCat] = useState<string>("Todas");
  const [busqueda, setBusqueda] = useState("");

  // Paneles: el formulario del producto y la nueva sección se abren encima
  const [formAbierto, setFormAbierto] = useState(false);

  // Estado para crear nueva sección con el botón "+"
  const [mostrarNuevaSeccion, setMostrarNuevaSeccion] = useState(false);
  const [nuevaSeccionNombre, setNuevaSeccionNombre] = useState("");
  const [nuevaSeccionEmoji, setNuevaSeccionEmoji] = useState("🍲");

  // Estado formulario crear / editar producto
  const [editId, setEditId] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState(
    categoriasIniciales[0]?.nombre ?? "Carnes de res",
  );
  const [tipoItem, setTipoItem] = useState<TipoItemMenu>(() =>
    inferirTipoPorCategoria(categoriasIniciales[0]?.nombre ?? "Carnes de res"),
  );
  const [precioBase, setPrecioBase] = useState("40");
  const [guarnicion, setGuarnicion] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [imagenUrlActual, setImagenUrlActual] = useState<string | null>(null);
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [stockActual, setStockActual] = useState("20");
  const [stockMinimo, setStockMinimo] = useState("5");
  const [controlarStock, setControlarStock] = useState(true);
  const [activo, setActivo] = useState(true);
  const [grupos, setGrupos] = useState<GrupoPersonalizacion[]>([]);

  const [mensaje, setMensaje] = useState<{
    tipo: "ok" | "error";
    texto: string;
  } | null>(null);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setCategorias(categoriasIniciales);
  }, [categoriasIniciales]);

  useEffect(() => {
    setProductos(productosIniciales);
  }, [productosIniciales]);

  // Los avisos se quitan solos
  useEffect(() => {
    if (!mensaje) return;
    const t = setTimeout(
      () => setMensaje(null),
      mensaje.tipo === "ok" ? 4000 : 7000,
    );
    return () => clearTimeout(t);
  }, [mensaje]);

  // Esc cierra el panel de arriba; el fondo no se desplaza mientras hay un panel
  useEffect(() => {
    if (!formAbierto && !mostrarNuevaSeccion) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (mostrarNuevaSeccion) setMostrarNuevaSeccion(false);
      else setFormAbierto(false);
    }
    window.addEventListener("keydown", onKey);
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previo;
    };
  }, [formAbierto, mostrarNuevaSeccion]);

  function limpiarFormulario() {
    const catDefault = categorias[0]?.nombre ?? "Carnes de res";
    setEditId(null);
    setNombre("");
    setCategoria(catDefault);
    setTipoItem(inferirTipoPorCategoria(catDefault));
    setPrecioBase("35");
    setGuarnicion("");
    setDescripcion("");
    setImagenUrlActual(null);
    setFotoFile(null);
    setFotoPreview(null);
    setStockActual("20");
    setStockMinimo("5");
    setControlarStock(true);
    setActivo(true);
    setGrupos([]);
  }

  function abrirNuevo() {
    setMensaje(null);
    limpiarFormulario();
    if (filtroCat !== "Todas") {
      setCategoria(filtroCat);
      setTipoItem(inferirTipoPorCategoria(filtroCat));
    }
    setFormAbierto(true);
  }

  function cerrarFormulario() {
    setFormAbierto(false);
    limpiarFormulario();
  }

  function handleCambiarCategoria(nuevaCat: string) {
    setCategoria(nuevaCat);
    if (!editId) {
      setTipoItem(inferirTipoPorCategoria(nuevaCat));
    }
  }

  function handleCrearSeccion(e: React.FormEvent) {
    e.preventDefault();
    setMensaje(null);
    const nombreLimpio = nuevaSeccionNombre.trim();
    if (!nombreLimpio) return;

    startTransition(async () => {
      const res = await crearCategoriaMenu({
        nombre: nombreLimpio,
        emoji: nuevaSeccionEmoji,
      });

      if (res?.error) {
        setMensaje({ tipo: "error", texto: res.error });
        return;
      }

      if (res?.categoria) {
        const creada = res.categoria as CategoriaMenu;
        setCategorias((prev) => {
          const sinDuplicado = prev.filter((c) => c.nombre !== creada.nombre);
          return [...sinDuplicado, creada];
        });
        setCategoria(creada.nombre);
        if (!editId) setTipoItem(inferirTipoPorCategoria(creada.nombre));
      } else {
        setCategoria(nombreLimpio);
        if (!editId) setTipoItem(inferirTipoPorCategoria(nombreLimpio));
      }

      setNuevaSeccionNombre("");
      setMostrarNuevaSeccion(false);
      setMensaje({
        tipo: "ok",
        texto: `Sección "${nuevaSeccionEmoji} ${nombreLimpio}" creada y lista para usar.`,
      });
      router.refresh();
    });
  }

  function handleSeleccionarFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setFotoFile(file);
    if (file) {
      setFotoPreview(URL.createObjectURL(file));
    } else {
      setFotoPreview(imagenUrlActual);
    }
  }

  function cargarParaEditar(item: ProductoMenuDB) {
    setMensaje(null);
    setEditId(item.id);
    setNombre(item.nombre);
    setCategoria(item.categoria);
    setTipoItem(
      item.tipo_item === "unidad" || item.tipo_item === "plato"
        ? item.tipo_item
        : inferirTipoPorCategoria(item.categoria),
    );
    setPrecioBase(String(item.precio_base));
    setGuarnicion(item.guarnicion_incluida ?? "");
    setDescripcion(item.descripcion ?? "");
    setImagenUrlActual(item.imagen_url ?? null);
    setFotoFile(null);
    setFotoPreview(item.imagen_url ?? null);
    setStockActual(String(item.stock_actual ?? 0));
    setStockMinimo(String(item.stock_minimo ?? 0));
    setControlarStock(item.controlar_stock ?? true);
    setActivo(item.activo ?? true);
    setGrupos(
      Array.isArray(item.personalizacion)
        ? item.personalizacion.map((g) => ({
            titulo: g.titulo,
            tipo: g.tipo,
            opciones: (g.opciones ?? []).map((o) => ({
              nombre: o.nombre,
              precioExtra: Number(o.precioExtra) || 0,
            })),
          }))
        : [],
    );
    setFormAbierto(true);
  }

  function agregarGrupo(tipo: "radio" | "checkbox") {
    setGrupos((prev) => [
      ...prev,
      {
        titulo: tipo === "radio" ? "Término de cocción" : "Agregar guarnición",
        tipo,
        opciones: [{ nombre: "", precioExtra: 0 }],
      },
    ]);
  }

  function agregarOpcion(gIdx: number) {
    setGrupos((prev) =>
      prev.map((g, idx) =>
        idx === gIdx
          ? { ...g, opciones: [...g.opciones, { nombre: "", precioExtra: 0 }] }
          : g,
      ),
    );
  }

  function quitarOpcion(gIdx: number, oIdx: number) {
    setGrupos((prev) =>
      prev.map((g, idx) =>
        idx === gIdx
          ? { ...g, opciones: g.opciones.filter((_, j) => j !== oIdx) }
          : g,
      ),
    );
  }

  function quitarGrupo(gIdx: number) {
    setGrupos((prev) => prev.filter((_, idx) => idx !== gIdx));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMensaje(null);

    const nombreLimpio = nombre.trim();
    startTransition(async () => {
      try {
        let finalImagenUrl = imagenUrlActual;
        if (fotoFile) {
          setSubiendoFoto(true);
          finalImagenUrl = await subirFotoMenu(fotoFile, nombreLimpio);
          setSubiendoFoto(false);
        }

        const res = await guardarMenuItem({
          id: editId ?? undefined,
          nombre: nombreLimpio,
          descripcion,
          categoria,
          tipo_item: tipoItem,
          precio_base: Number(precioBase),
          guarnicion_incluida: guarnicion,
          imagen_url: finalImagenUrl,
          personalizacion: grupos,
          stock_actual: Number(stockActual),
          stock_minimo: Number(stockMinimo),
          controlar_stock: controlarStock,
          activo,
        });

        if (res?.error) {
          setMensaje({ tipo: "error", texto: res.error });
          return;
        }

        setMensaje({
          tipo: "ok",
          texto: editId
            ? `"${nombreLimpio}" actualizado en el menú.`
            : `"${nombreLimpio}" agregado al menú de La Caprichosa.`,
        });
        limpiarFormulario();
        setFormAbierto(false);
        router.refresh();
      } catch (err) {
        setSubiendoFoto(false);
        setMensaje({
          tipo: "error",
          texto:
            err instanceof Error
              ? err.message
              : "No se pudo guardar el producto del menú.",
        });
      }
    });
  }

  function handleAjusteStock(id: string, delta: number) {
    setMensaje(null);
    startTransition(async () => {
      const res = await ajustarStockRapidoMenu(id, delta);
      if (res?.error) {
        setMensaje({ tipo: "error", texto: res.error });
        return;
      }
      setProductos((prev) =>
        prev.map((p) =>
          p.id === id
            ? { ...p, stock_actual: Math.max(0, p.stock_actual + delta) }
            : p,
        ),
      );
      router.refresh();
    });
  }

  function handleEliminar(id: string, nombreItem: string) {
    setMensaje(null);
    if (!window.confirm(`¿Eliminar "${nombreItem}" del menú?`)) return;

    startTransition(async () => {
      const res = await eliminarMenuItem(id);
      if (res?.error) {
        setMensaje({ tipo: "error", texto: res.error });
        return;
      }
      if (editId === id) {
        limpiarFormulario();
        setFormAbierto(false);
      }
      setProductos((prev) => prev.filter((p) => p.id !== id));
      setMensaje({
        tipo: "ok",
        texto: `"${nombreItem}" eliminado del menú.`,
      });
      router.refresh();
    });
  }

  const filtrados = productos.filter((p) => {
    const pasaCat = filtroCat === "Todas" || p.categoria === filtroCat;
    const q = busqueda.trim().toLowerCase();
    const pasaTexto =
      !q ||
      p.nombre.toLowerCase().includes(q) ||
      p.categoria.toLowerCase().includes(q) ||
      (p.descripcion ?? "").toLowerCase().includes(q);
    return pasaCat && pasaTexto;
  });

  const emojiPorCat = new Map(categorias.map((c) => [c.nombre, c.emoji]));
  const ocupado = isPending || subiendoFoto;

  return (
    <div className="space-y-4">
      <style dangerouslySetInnerHTML={{ __html: estilos }} />

      {/* ───────── Aviso: siempre visible, también sobre los paneles ───────── */}
      {mensaje && (
        <div
          role="status"
          className={`anim-toast fixed inset-x-4 top-[92px] z-[70] flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-sm font-medium shadow-2xl shadow-black/60 backdrop-blur-md md:inset-x-auto md:right-6 md:top-[112px] md:w-[26rem] ${
            mensaje.tipo === "ok"
              ? "border-emerald-500/40 bg-emerald-950/95 text-emerald-100"
              : "border-rose-500/40 bg-rose-950/95 text-rose-100"
          }`}
        >
          <span className="min-w-0 break-words">
            {mensaje.tipo === "ok" ? "✅ " : "⚠️ "}
            {mensaje.texto}
          </span>
          <button
            type="button"
            onClick={() => setMensaje(null)}
            aria-label="Cerrar aviso"
            className="shrink-0 rounded-lg px-2 text-base leading-none opacity-70 transition hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      {/* ───────── Barra fija: buscar, secciones y botón nuevo ───────── */}
      <div className="sticky top-[78px] z-10 -mx-4 space-y-3 border-b border-white/[0.06] bg-stone-950/90 px-4 pb-3 pt-3 backdrop-blur-xl sm:-mx-6 sm:px-6 md:top-[92px] md:-mx-8 md:px-8">
        <div className="flex items-center gap-2.5">
          <div className="relative min-w-0 flex-1">
            <span
              aria-hidden
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm opacity-60"
            >
              🔍
            </span>
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar plato, bebida o extra..."
              className={`${inputCls} !pl-10 !pr-10`}
            />
            {busqueda && (
              <button
                type="button"
                onClick={() => setBusqueda("")}
                aria-label="Borrar búsqueda"
                className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-stone-400 hover:bg-white/10 hover:text-white"
              >
                ✕
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={abrirNuevo}
            className="hidden shrink-0 items-center gap-2 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 px-5 py-3 text-sm font-extrabold text-stone-950 shadow-lg shadow-orange-600/25 transition hover:brightness-110 active:scale-95 md:inline-flex"
          >
            <span className="text-lg leading-none">＋</span> Nuevo producto
          </button>
        </div>

        {/* Secciones: se deslizan de lado en celular */}
        <div className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 sm:-mx-6 sm:px-6 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {["Todas", ...categorias.map((c) => c.nombre)].map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setFiltroCat(cat)}
              className={`shrink-0 whitespace-nowrap rounded-xl px-3.5 py-2 text-xs font-bold transition active:scale-95 md:px-3 md:py-1.5 ${
                filtroCat === cat
                  ? "bg-amber-400 text-stone-950"
                  : "border border-white/10 bg-stone-900 text-stone-300 hover:bg-white/5"
              }`}
            >
              {cat !== "Todas" && emojiPorCat.get(cat)
                ? `${emojiPorCat.get(cat)} `
                : ""}
              {cat}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setMostrarNuevaSeccion(true)}
            className="shrink-0 whitespace-nowrap rounded-xl border border-dashed border-amber-400/50 bg-amber-500/10 px-3.5 py-2 text-xs font-extrabold text-amber-300 transition hover:bg-amber-500/20 active:scale-95 md:px-3 md:py-1.5"
          >
            + Sección
          </button>
        </div>
      </div>

      {/* ───────── Lista de productos ───────── */}
      <p className="text-xs text-stone-400">
        {filtrados.length} de {productos.length} producto(s) · Toca uno para
        editarlo
      </p>

      {filtrados.length === 0 ? (
        <div className={`${cardCls} p-8 text-center`}>
          <p className="text-4xl">🍽️</p>
          <p className="mt-2 text-base font-bold text-white">
            No hay productos aquí
          </p>
          <p className="mt-1 text-sm text-stone-400">
            Cambia el filtro o agrega uno nuevo.
          </p>
          <button
            type="button"
            onClick={abrirNuevo}
            className="mt-4 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 px-5 py-3 text-sm font-extrabold text-stone-950 transition active:scale-95"
          >
            ＋ Nuevo producto
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
          {filtrados.map((item) => {
            const esUnidad = item.tipo_item === "unidad";
            return (
              <div
                key={item.id}
                onClick={() => {
                  if (!ocupado) cargarParaEditar(item);
                }}
                className={`${cardCls} group flex cursor-pointer gap-3.5 p-3.5 transition hover:border-amber-400/30 active:scale-[0.99] sm:gap-4 sm:p-4 ${
                  !item.activo ? "opacity-70" : ""
                }`}
              >
                <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/10 bg-stone-950 text-2xl sm:h-24 sm:w-24">
                  {item.imagen_url ? (
                    <img
                      src={item.imagen_url}
                      alt={item.nombre}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span>{emojiPorCat.get(item.categoria) ?? "🍽️"}</span>
                  )}
                </div>

                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-extrabold text-white">
                        {item.nombre}
                      </p>
                      <p className="truncate text-xs font-semibold text-amber-300">
                        {item.categoria} · Bs{" "}
                        {Number(item.precio_base).toFixed(2)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          esUnidad
                            ? "border border-sky-500/30 bg-sky-500/15 text-sky-300"
                            : "border border-white/10 bg-white/5 text-stone-300"
                        }`}
                      >
                        {esUnidad ? "🥤 Unidad" : "🍽️ Plato"}
                      </span>
                      {!item.activo && (
                        <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-300">
                          Oculto
                        </span>
                      )}
                    </div>
                  </div>

                  {item.descripcion && (
                    <p className="line-clamp-2 text-xs text-stone-400">
                      {item.descripcion}
                    </p>
                  )}

                  {item.guarnicion_incluida && (
                    <p className="line-clamp-1 text-[11px] text-stone-300">
                      Incluye:{" "}
                      <span className="font-semibold">
                        {item.guarnicion_incluida}
                      </span>
                    </p>
                  )}

                  {/* Stock rápido y acciones: no abren el panel al tocarlos */}
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="flex flex-wrap items-center justify-between gap-2 pt-0.5"
                  >
                    {item.controlar_stock ? (
                      <StockInput
                        item={item}
                        deshabilitado={ocupado}
                        onGuardar={(nuevo) =>
                          handleAjusteStock(item.id, nuevo - item.stock_actual)
                        }
                      />
                    ) : (
                      <span className="text-[11px] text-stone-500">
                        Sin control de stock
                      </span>
                    )}

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={ocupado}
                        onClick={() => cargarParaEditar(item)}
                        className="rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-xs font-bold text-amber-300 transition hover:bg-white/10 active:scale-95 disabled:opacity-50 sm:py-2"
                      >
                        ✏️ <span className="hidden sm:inline">Editar</span>
                      </button>
                      <button
                        type="button"
                        disabled={ocupado}
                        onClick={() => handleEliminar(item.id, item.nombre)}
                        aria-label={`Eliminar ${item.nombre}`}
                        className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-xs font-bold text-rose-300 transition hover:bg-rose-500/20 active:scale-95 disabled:opacity-50 sm:py-2"
                      >
                        🗑️ <span className="hidden sm:inline">Eliminar</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ───────── Botón flotante (solo celular), sobre el menú inferior ───────── */}
      <button
        type="button"
        onClick={abrirNuevo}
        aria-label="Nuevo producto"
        className="fixed bottom-28 right-4 z-20 flex items-center gap-2 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-5 py-4 text-sm font-extrabold text-stone-950 shadow-2xl shadow-orange-600/40 transition active:scale-90 md:hidden"
      >
        <span className="text-xl leading-none">＋</span> Nuevo
      </button>

      {/* ───────── Panel de producto: sube desde abajo en celular, entra por la derecha en PC ───────── */}
      {formAbierto && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center md:items-stretch md:justify-end"
          role="dialog"
          aria-modal="true"
          aria-label={editId ? "Editar producto" : "Nuevo producto"}
        >
          <button
            type="button"
            aria-label="Cerrar panel"
            onClick={cerrarFormulario}
            className="anim-fondo absolute inset-0 cursor-default bg-black/75 backdrop-blur-sm"
          />

          <form
            onSubmit={handleSubmit}
            className="anim-sheet relative z-10 flex h-[94dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-amber-400/30 bg-stone-900 shadow-2xl md:h-full md:max-w-2xl md:rounded-none md:rounded-l-3xl md:border-r-0"
          >
            {/* Cabecera fija */}
            <div className="shrink-0 border-b border-white/[0.07] px-5 pb-4 pt-3 sm:px-6">
              <div
                aria-hidden
                className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-white/15 md:hidden"
              />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-extrabold text-white">
                    {editId ? "✏️ Editar producto" : "🍔 Nuevo producto"}
                  </h2>
                  <p className="text-xs text-stone-400">
                    {editId
                      ? "Cambia lo que necesites y guarda."
                      : "Llena lo básico: nombre, sección y precio."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={cerrarFormulario}
                  aria-label="Cerrar"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-stone-300 transition hover:bg-white/10 active:scale-90"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Cuerpo con scroll */}
            <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
              {/* Foto */}
              <div className="flex items-center gap-4 rounded-2xl border border-white/[0.07] bg-stone-950/60 p-4">
                <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/15 bg-stone-900 text-3xl">
                  {fotoPreview ? (
                    <img
                      src={fotoPreview}
                      alt={nombre || "Vista previa del plato"}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span>{emojiPorCat.get(categoria) ?? "🍔"}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <p className={labelCls}>Foto del plato</p>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-amber-500/20 px-4 py-3 text-sm font-bold text-amber-300 transition hover:bg-amber-500/30 active:scale-95 sm:py-2.5">
                    📷 {fotoPreview ? "Cambiar foto" : "Elegir foto"}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleSeleccionarFoto}
                      className="sr-only"
                    />
                  </label>
                  <p className="text-[11px] text-stone-500">
                    {editId && imagenUrlActual && !fotoFile
                      ? "Si no eliges una nueva, se conserva la actual."
                      : "JPG, PNG o WebP · de tu celular o PC."}
                  </p>
                </div>
              </div>

              {/* Datos básicos */}
              <div className={bloqueCls}>
                <div className="space-y-1.5">
                  <label className={labelCls}>Nombre</label>
                  <input
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    required
                    autoFocus={!editId}
                    placeholder="Ej. Churrasco, Caldo de res, Gaseosa 2L"
                    className={inputCls}
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className={labelCls}>Sección</label>
                    <div className="flex items-center gap-2">
                      <select
                        value={categoria}
                        onChange={(e) => handleCambiarCategoria(e.target.value)}
                        className={`${inputCls} min-w-0 flex-1 font-medium`}
                      >
                        {categorias.map((c) => (
                          <option key={c.id} value={c.nombre}>
                            {c.emoji} {c.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setMostrarNuevaSeccion(true)}
                        title="Crear nueva sección"
                        aria-label="Crear nueva sección"
                        className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-xl font-black text-stone-950 shadow-md shadow-orange-600/20 transition hover:brightness-110 active:scale-90 sm:h-[42px] sm:w-[42px]"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className={labelCls}>Precio base (Bs)</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.5"
                      min="0"
                      value={precioBase}
                      onChange={(e) => setPrecioBase(e.target.value)}
                      required
                      className={inputCls}
                    />
                  </div>
                </div>

                {/* Tipo en carta: plato vs producto por unidad */}
                <div className="space-y-1.5">
                  <label className={labelCls}>Tipo de producto</label>
                  <select
                    value={tipoItem}
                    onChange={(e) =>
                      setTipoItem(
                        e.target.value === "unidad" ? "unidad" : "plato",
                      )
                    }
                    className={`${inputCls} font-medium`}
                  >
                    <option value="plato">
                      🍽️ Plato / preparación de cocina
                    </option>
                    <option value="unidad">
                      🥤 Por unidad (bebidas, vinos, sodas — reponible en
                      compras)
                    </option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className={labelCls}>Descripción</label>
                  <input
                    value={descripcion}
                    onChange={(e) => setDescripcion(e.target.value)}
                    placeholder="Ej. Corte clásico a la parrilla, tierno y jugoso."
                    className={inputCls}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className={labelCls}>
                    Guarnición incluida (opcional)
                  </label>
                  <input
                    value={guarnicion}
                    onChange={(e) => setGuarnicion(e.target.value)}
                    placeholder="Ej. Arroz con queso y papas"
                    className={inputCls}
                  />
                </div>
              </div>

              {/* Stock y disponibilidad */}
              <div className={bloqueCls}>
                <p className="text-xs font-bold uppercase tracking-wider text-amber-300">
                  Stock y disponibilidad
                </p>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className={labelCls}>Stock actual</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      value={stockActual}
                      onChange={(e) => setStockActual(e.target.value)}
                      className={inputCls}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelCls}>Alerta stock bajo</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      value={stockMinimo}
                      onChange={(e) => setStockMinimo(e.target.value)}
                      className={inputCls}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/10 bg-stone-900 px-4 py-3.5 text-sm font-semibold text-stone-200 sm:py-3">
                    <span>Controlar stock</span>
                    <input
                      type="checkbox"
                      checked={controlarStock}
                      onChange={(e) => setControlarStock(e.target.checked)}
                      className="h-5 w-5 accent-amber-400"
                    />
                  </label>

                  <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/10 bg-stone-900 px-4 py-3.5 text-sm font-semibold text-stone-200 sm:py-3">
                    <span>Disponible en carta</span>
                    <input
                      type="checkbox"
                      checked={activo}
                      onChange={(e) => setActivo(e.target.checked)}
                      className="h-5 w-5 accent-amber-400"
                    />
                  </label>
                </div>
              </div>

              {/* Personalización */}
              <div className={bloqueCls}>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-amber-300">
                    Opciones y extras (opcional)
                  </p>
                  <p className="mt-0.5 text-xs text-stone-500">
                    Ej. término de cocción, o guarniciones con costo extra.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => agregarGrupo("radio")}
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-xs font-semibold text-stone-200 transition hover:bg-white/10 active:scale-95 sm:py-2.5"
                  >
                    + Elegir una opción (radio)
                  </button>
                  <button
                    type="button"
                    onClick={() => agregarGrupo("checkbox")}
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-xs font-semibold text-stone-200 transition hover:bg-white/10 active:scale-95 sm:py-2.5"
                  >
                    + Extras / guarniciones (checkbox)
                  </button>
                </div>

                {grupos.map((grupo, gIdx) => (
                  <div
                    key={gIdx}
                    className="space-y-3 rounded-2xl border border-white/10 bg-stone-900/90 p-3.5"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        value={grupo.titulo}
                        onChange={(e) => {
                          const val = e.target.value;
                          setGrupos((prev) =>
                            prev.map((g, i) =>
                              i === gIdx ? { ...g, titulo: val } : g,
                            ),
                          );
                        }}
                        placeholder="Título del grupo"
                        className={`${inputCls} min-w-0 flex-1 font-semibold`}
                      />
                      <span className="hidden shrink-0 rounded-lg bg-amber-500/15 px-2.5 py-1 text-[11px] font-bold text-amber-300 sm:inline">
                        {grupo.tipo === "radio" ? "Elige una" : "Varias"}
                      </span>
                      <button
                        type="button"
                        onClick={() => quitarGrupo(gIdx)}
                        aria-label="Quitar grupo"
                        title="Quitar grupo"
                        className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-rose-500/30 bg-rose-500/10 text-sm text-rose-300 transition hover:bg-rose-500/20 active:scale-90 sm:h-[42px] sm:w-[42px]"
                      >
                        🗑️
                      </button>
                    </div>

                    <div className="space-y-2">
                      {grupo.opciones.map((op, oIdx) => (
                        <div
                          key={oIdx}
                          className="grid grid-cols-[minmax(0,1fr)_5.5rem_2.75rem] items-center gap-2"
                        >
                          <input
                            value={op.nombre}
                            onChange={(e) => {
                              const val = e.target.value;
                              setGrupos((prev) =>
                                prev.map((g, i) =>
                                  i === gIdx
                                    ? {
                                        ...g,
                                        opciones: g.opciones.map((o, j) =>
                                          j === oIdx
                                            ? { ...o, nombre: val }
                                            : o,
                                        ),
                                      }
                                    : g,
                                ),
                              );
                            }}
                            placeholder="Ej. Término medio o Papa frita"
                            className={inputCls}
                          />
                          <input
                            type="number"
                            inputMode="decimal"
                            step="0.5"
                            min="0"
                            value={op.precioExtra}
                            onChange={(e) => {
                              const val = Number(e.target.value) || 0;
                              setGrupos((prev) =>
                                prev.map((g, i) =>
                                  i === gIdx
                                    ? {
                                        ...g,
                                        opciones: g.opciones.map((o, j) =>
                                          j === oIdx
                                            ? { ...o, precioExtra: val }
                                            : o,
                                        ),
                                      }
                                    : g,
                                ),
                              );
                            }}
                            placeholder="+ Bs"
                            aria-label="Precio extra en Bs"
                            className={inputCls}
                          />
                          <button
                            type="button"
                            onClick={() => quitarOpcion(gIdx, oIdx)}
                            aria-label="Quitar opción"
                            className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/5 text-stone-400 transition hover:border-rose-500/40 hover:text-rose-300 active:scale-90 sm:h-[42px] sm:w-[42px]"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => agregarOpcion(gIdx)}
                      className="w-full rounded-xl border border-dashed border-amber-400/40 py-2.5 text-xs font-bold text-amber-300 transition hover:bg-amber-500/10 active:scale-95"
                    >
                      + Agregar opción
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Pie fijo: el botón de guardar siempre está a la vista */}
            <div className="flex shrink-0 items-center gap-2.5 border-t border-white/[0.07] bg-stone-900 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3.5 sm:px-6">
              {editId && (
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => handleEliminar(editId, nombre || "producto")}
                  aria-label="Eliminar producto"
                  className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-rose-500/30 bg-rose-500/10 text-lg text-rose-300 transition hover:bg-rose-500/20 active:scale-90 disabled:opacity-50"
                >
                  🗑️
                </button>
              )}
              <button
                type="button"
                onClick={cerrarFormulario}
                className="hidden rounded-2xl border border-white/10 px-5 py-3.5 text-sm font-semibold text-stone-300 transition hover:bg-white/5 active:scale-95 sm:block"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={ocupado}
                className="flex-1 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 px-6 py-3.5 text-sm font-extrabold text-stone-950 shadow-lg shadow-orange-600/20 transition hover:brightness-110 active:scale-95 disabled:opacity-50"
              >
                {subiendoFoto
                  ? "Subiendo foto..."
                  : isPending
                    ? "Guardando..."
                    : editId
                      ? "Guardar cambios"
                      : "Guardar en el menú"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ───────── Nueva sección: aparece justo donde tocaste "+" ───────── */}
      {mostrarNuevaSeccion && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Nueva sección del menú"
        >
          <button
            type="button"
            aria-label="Cerrar"
            onClick={() => setMostrarNuevaSeccion(false)}
            className="anim-fondo absolute inset-0 cursor-default bg-black/70 backdrop-blur-sm"
          />

          <form
            onSubmit={handleCrearSeccion}
            className="anim-toast relative z-10 w-full max-w-md space-y-4 rounded-t-3xl border border-amber-400/40 bg-stone-900 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-extrabold text-white">
                  ➕ Nueva sección
                </h3>
                <p className="text-xs text-stone-400">
                  Ej. Caldos, Combos, Hamburguesas, Postres...
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMostrarNuevaSeccion(false)}
                aria-label="Cerrar"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-stone-300 transition hover:bg-white/10 active:scale-90"
              >
                ✕
              </button>
            </div>

            <div className="space-y-1.5">
              <label className={labelCls}>Nombre</label>
              <input
                value={nuevaSeccionNombre}
                onChange={(e) => setNuevaSeccionNombre(e.target.value)}
                autoFocus
                placeholder="Nombre de la sección (ej. Caldos)"
                className={inputCls}
              />
            </div>

            <div className="space-y-1.5">
              <p className={labelCls}>Ícono</p>
              <div className="grid grid-cols-5 gap-2">
                {EMOJIS_SECCION.map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => setNuevaSeccionEmoji(em)}
                    aria-pressed={nuevaSeccionEmoji === em}
                    className={`grid h-12 place-items-center rounded-xl text-xl transition active:scale-90 ${
                      nuevaSeccionEmoji === em
                        ? "bg-amber-400 font-bold text-stone-950 ring-2 ring-amber-300/50"
                        : "border border-white/10 bg-stone-950 hover:bg-white/5"
                    }`}
                  >
                    {em}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={ocupado || !nuevaSeccionNombre.trim()}
              className="w-full rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 py-3.5 text-sm font-extrabold text-stone-950 shadow-lg shadow-orange-600/20 transition hover:brightness-110 active:scale-95 disabled:opacity-50"
            >
              {isPending ? "Creando..." : "Crear sección"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
