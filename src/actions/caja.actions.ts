"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type MetodoPagoCaja = "efectivo" | "qr" | "transferencia" | "tarjeta";

async function obtenerOperadorCaja() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { error: "Sesión no válida." as const };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("rol, activo")
    .eq("id", user.id)
    .maybeSingle();

  const rol = profile?.rol ?? "mesero";
  if (profile && profile.activo === false) {
    return { error: "Usuario inactivo." as const };
  }

  if (rol !== "admin" && rol !== "cajera") {
    return {
      error: "Solo cajera o administrador pueden operar en caja." as const,
    };
  }

  return { supabase, userId: user.id, rol };
}

function revalidarCajaYOperacion() {
  revalidatePath("/caja");
  revalidatePath("/caja/cobros-rendiciones");
  revalidatePath("/caja/stock-rapido");
  revalidatePath("/caja/cierre-turno");
  revalidatePath("/meseros");
  revalidatePath("/meseros/mesas");
  revalidatePath("/admin");
  revalidatePath("/admin/ventas");
  revalidatePath("/admin/reportes");
}

export async function cobrarCuentaEnCaja(input: {
  pedidoId: string;
  metodo: MetodoPagoCaja;
  propina?: number;
}) {
  const auth = await obtenerOperadorCaja();
  if ("error" in auth) return { error: auth.error };

  const { data: pedido, error: pedErr } = await auth.supabase
    .from("pedidos")
    .select("id, mesa_id, mesero_id, total, estado")
    .eq("id", input.pedidoId)
    .single();

  if (pedErr || !pedido) {
    return { error: "Pedido no encontrado." };
  }

  if (pedido.estado === "pagado") {
    return { error: "Este pedido ya fue cobrado." };
  }

  const monto = Number(pedido.total || 0);
  if (monto <= 0) {
    return { error: "El pedido no tiene monto por cobrar." };
  }

  const propinaLimpia = Math.max(0, Number(input.propina) || 0);
  const ahoraIso = new Date().toISOString();

  const { error: cobroErr } = await auth.supabase.from("cobros").insert({
    pedido_id: pedido.id,
    mesero_id: pedido.mesero_id ?? null,
    registrado_por: auth.userId,
    metodo: input.metodo,
    monto,
    propina: propinaLimpia,
    validado_en_caja: true,
    validado_por: auth.userId,
    validado_en: ahoraIso,
  });

  if (cobroErr) {
    return { error: cobroErr.message };
  }

  const { error: updPedErr } = await auth.supabase
    .from("pedidos")
    .update({ estado: "pagado", updated_at: ahoraIso })
    .eq("id", pedido.id);

  if (updPedErr) {
    return { error: updPedErr.message };
  }

  // Al cobrar mesa (o grupo unido), pasa a estado "sucia" y desune el grupo
  if (pedido.mesa_id) {
    await auth.supabase
      .from("mesas")
      .update({
        unida_con_id: null,
        estado: "sucia",
        updated_at: ahoraIso,
      })
      .eq("unida_con_id", pedido.mesa_id);

    await auth.supabase
      .from("mesas")
      .update({
        estado: "sucia",
        updated_at: ahoraIso,
      })
      .eq("id", pedido.mesa_id);
  }

  revalidarCajaYOperacion();
  return { success: true };
}

export async function validarCobroEnCaja(cobroId: string) {
  const auth = await obtenerOperadorCaja();
  if ("error" in auth) return { error: auth.error };

  const ahoraIso = new Date().toISOString();
  const { error } = await auth.supabase
    .from("cobros")
    .update({
      validado_en_caja: true,
      validado_por: auth.userId,
      validado_en: ahoraIso,
    })
    .eq("id", cobroId);

  if (error) return { error: error.message };

  revalidarCajaYOperacion();
  return { success: true };
}

export async function registrarEgresoCaja(input: {
  motivo: string;
  monto: number;
  lineaNegocio?: "parrilla" | "hamburguesas" | null;
}) {
  const auth = await obtenerOperadorCaja();
  if ("error" in auth) return { error: auth.error };

  const motivoLimpio = input.motivo.trim();
  const montoLimpio = Number(input.monto);

  if (!motivoLimpio) {
    return { error: "Escribe el motivo del egreso." };
  }
  if (!Number.isFinite(montoLimpio) || montoLimpio <= 0) {
    return { error: "El monto debe ser mayor a 0." };
  }

  const { error } = await auth.supabase.from("egresos_caja").insert({
    registrado_por: auth.userId,
    motivo: motivoLimpio,
    linea_negocio: input.lineaNegocio ?? null,
    monto: montoLimpio,
  });

  if (error) return { error: error.message };

  revalidarCajaYOperacion();
  return { success: true };
}