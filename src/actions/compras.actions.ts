"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type CompraGastoInput = {
  concepto: string;
  categoria_gasto: string;
  monto: number;
  fecha_compra: string;
  menu_item_id?: string | null;
  cantidad_sumada?: number;
  nota?: string | null;
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
    return { error: "Solo el administrador puede registrar compras." as const };
  }

  return { supabase, userId: user.id };
}

export async function registrarCompraGasto(input: CompraGastoInput) {
  const auth = await validarAdmin();
  if ("error" in auth) return { error: auth.error };

  const concepto = input.concepto.trim();
  const categoriaGasto = input.categoria_gasto.trim() || "Insumos y extras";
  const monto = Number(input.monto);
  const cantidadSumada = Math.max(0, Math.floor(Number(input.cantidad_sumada) || 0));
  const menuItemId = input.menu_item_id || null;

  if (!concepto || Number.isNaN(monto) || monto <= 0) {
    return { error: "Ingresa un concepto y un monto mayor a 0." };
  }

  const { error: insertError } = await auth.supabase
    .from("compras_gastos")
    .insert({
      concepto,
      categoria_gasto: categoriaGasto,
      monto,
      fecha_compra: input.fecha_compra || new Date().toISOString().slice(0, 10),
      menu_item_id: menuItemId,
      cantidad_sumada: menuItemId ? cantidadSumada : 0,
      nota: input.nota?.trim() || null,
      creado_por: auth.userId,
    });

  if (insertError) {
    return { error: insertError.message };
  }

  // Si enlazó un producto del menú y puso cantidad, suma al stock actual
  if (menuItemId && cantidadSumada > 0) {
    const { data: item } = await auth.supabase
      .from("menu_items")
      .select("stock_actual, controlar_stock")
      .eq("id", menuItemId)
      .single();

    if (item && item.controlar_stock) {
      const nuevoStock = Number(item.stock_actual || 0) + cantidadSumada;
      await auth.supabase
        .from("menu_items")
        .update({ stock_actual: nuevoStock, updated_at: new Date().toISOString() })
        .eq("id", menuItemId);
    }
  }

  revalidatePath("/admin/inventario-compras");
  revalidatePath("/admin/menu");
  revalidatePath("/admin/reportes");
  revalidatePath("/admin");
  return { success: true };
}

export async function eliminarCompraGasto(id: string) {
  const auth = await validarAdmin();
  if ("error" in auth) return { error: auth.error };

  const { error } = await auth.supabase
    .from("compras_gastos")
    .delete()
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/admin/inventario-compras");
  revalidatePath("/admin/reportes");
  revalidatePath("/admin");
  return { success: true };
}