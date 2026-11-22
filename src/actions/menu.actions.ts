"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type OpcionPersonalizacion = {
  nombre: string;
  precioExtra: number;
};

export type GrupoPersonalizacion = {
  titulo: string;
  tipo: "radio" | "checkbox";
  opciones: OpcionPersonalizacion[];
};

export type TipoItemMenu = "plato" | "unidad";

export type MenuItemInput = {
  id?: string;
  nombre: string;
  descripcion: string;
  categoria: string;
  tipo_item?: TipoItemMenu;
  precio_base: number;
  guarnicion_incluida?: string | null;
  imagen_url?: string | null;
  personalizacion: GrupoPersonalizacion[];
  stock_actual: number;
  stock_minimo: number;
  controlar_stock: boolean;
  activo: boolean;
};

async function validarAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Sesión no válida. Vuelve a iniciar sesión." as const };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("rol, activo")
    .eq("id", user.id)
    .single();

  if (!profile || !profile.activo || profile.rol !== "admin") {
    return { error: "Solo el administrador puede modificar el menú." as const };
  }

  return { supabase };
}

function refrescarRutasMenu() {
  revalidatePath("/admin/menu");
  revalidatePath("/admin/inventario-compras");
  revalidatePath("/meseros");
  revalidatePath("/meseros/mesas");
  revalidatePath("/caja");
}

export async function crearCategoriaMenu(input: {
  nombre: string;
  emoji?: string;
}) {
  const auth = await validarAdmin();
  if ("error" in auth) return { error: auth.error };

  const label = input.nombre.trim();
  const emoji = (input.emoji ?? "🍽️").trim() || "🍽️";

  if (!label) {
    return { error: "Escribe el nombre de la nueva sección." };
  }

  // Usamos el nombre limpio como identificador de categoría para que coincida con menu_items.categoria
  const nombreClave = label;

  const { data: existentes } = await auth.supabase
    .from("menu_categorias")
    .select("orden")
    .order("orden", { ascending: false })
    .limit(1);

  const siguienteOrden = (existentes?.[0]?.orden ?? 0) + 1;

  const { data: creada, error } = await auth.supabase
    .from("menu_categorias")
    .upsert(
      {
        nombre: nombreClave,
        label,
        emoji,
        orden: siguienteOrden,
        activo: true,
      },
      { onConflict: "nombre" }
    )
    .select("id, nombre, label, emoji, orden")
    .single();

  if (error) {
    return { error: error.message };
  }

  refrescarRutasMenu();
  return { success: true, categoria: creada };
}

export async function guardarMenuItem(input: MenuItemInput) {
  const auth = await validarAdmin();
  if ("error" in auth) return { error: auth.error };

  const nombre = input.nombre.trim();
  const categoria = input.categoria.trim();
  const tipoItem: TipoItemMenu =
    input.tipo_item === "unidad" ? "unidad" : "plato";
  const precioBase = Number(input.precio_base);
  const stockActual = Math.max(0, Math.floor(Number(input.stock_actual) || 0));
  const stockMinimo = Math.max(0, Math.floor(Number(input.stock_minimo) || 0));

  if (!nombre || !categoria || Number.isNaN(precioBase) || precioBase < 0) {
    return { error: "Ingresa un nombre, categoría y precio válido." };
  }

  const personalizacionLimpia: GrupoPersonalizacion[] = (
    input.personalizacion ?? []
  )
    .map((grupo) => ({
      titulo: grupo.titulo.trim(),
      tipo: grupo.tipo,
      opciones: (grupo.opciones ?? [])
        .map((op) => ({
          nombre: op.nombre.trim(),
          precioExtra: Math.max(0, Number(op.precioExtra) || 0),
        }))
        .filter((op) => op.nombre.length > 0),
    }))
    .filter((grupo) => grupo.titulo.length > 0 && grupo.opciones.length > 0);

  const payload = {
    nombre,
    descripcion: input.descripcion.trim(),
    categoria,
    tipo_item: tipoItem,
    precio_base: precioBase,
    guarnicion_incluida: input.guarnicion_incluida?.trim() || null,
    imagen_url: input.imagen_url?.trim() || null,
    personalizacion: personalizacionLimpia,
    stock_actual: stockActual,
    stock_minimo: stockMinimo,
    controlar_stock: Boolean(input.controlar_stock),
    activo: Boolean(input.activo),
    updated_at: new Date().toISOString(),
  };

  if (input.id) {
    const { error } = await auth.supabase
      .from("menu_items")
      .update(payload)
      .eq("id", input.id);

    if (error) return { error: error.message };
  } else {
    const { error } = await auth.supabase.from("menu_items").insert(payload);
    if (error) return { error: error.message };
  }

  refrescarRutasMenu();
  return { success: true };
}

export async function ajustarStockRapidoMenu(id: string, delta: number) {
  const auth = await validarAdmin();
  if ("error" in auth) return { error: auth.error };

  const { data: actual, error: readErr } = await auth.supabase
    .from("menu_items")
    .select("stock_actual")
    .eq("id", id)
    .single();

  if (readErr || !actual) {
    return { error: readErr?.message ?? "Producto no encontrado." };
  }

  const nuevoStock = Math.max(0, Number(actual.stock_actual || 0) + delta);
  const { error: updErr } = await auth.supabase
    .from("menu_items")
    .update({ stock_actual: nuevoStock, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (updErr) return { error: updErr.message };

  refrescarRutasMenu();
  return { success: true };
}

export async function eliminarMenuItem(id: string) {
  const auth = await validarAdmin();
  if ("error" in auth) return { error: auth.error };

  const { error } = await auth.supabase
    .from("menu_items")
    .delete()
    .eq("id", id);

  if (error) return { error: error.message };

  refrescarRutasMenu();
  return { success: true };
}