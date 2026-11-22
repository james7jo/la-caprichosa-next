"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  HORA_CIERRE_BO,
  obtenerInfoHoraBolivia,
} from "@/lib/hora-bolivia";

function refrescarRutasMesero() {
  revalidatePath("/meseros");
  revalidatePath("/meseros/mesas");
  revalidatePath("/meseros/mi-rendicion");
  revalidatePath("/admin");
  revalidatePath("/admin/usuarios");
  revalidatePath("/caja");
}

async function sesionMesero() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Sesión no iniciada." as const };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, nombre, rol, activo")
    .eq("id", user.id)
    .single();

  if (!profile || !profile.activo) {
    return { error: "Usuario inactivo o sin perfil." as const };
  }

  return { supabase, userId: user.id, profile };
}

export async function iniciarOperacionMesero() {
  const ses = await sesionMesero();
  if ("error" in ses) return { error: ses.error };

  const bo = obtenerInfoHoraBolivia();

  // Revisar si ya tiene una operación abierta
  const { data: abierta } = await ses.supabase
    .from("operaciones_mesero")
    .select("id")
    .eq("mesero_id", ses.userId)
    .eq("estado", "abierta")
    .maybeSingle();

  if (abierta) {
    return { success: true, operacionId: abierta.id, yaAbierta: true };
  }

  const { data: creada, error } = await ses.supabase
    .from("operaciones_mesero")
    .insert({
      mesero_id: ses.userId,
      estado: "abierta",
      abierta_en: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  refrescarRutasMesero();
  return {
    success: true,
    operacionId: creada?.id,
    horaBolivia: bo.horaBoliviaTexto,
    fueraDeHorario: bo.fueraDeHorario,
  };
}

export async function cerrarOperacionMesero(notasCierre?: string) {
  const ses = await sesionMesero();
  if ("error" in ses) return { error: ses.error };

  const bo = obtenerInfoHoraBolivia();
  const antesDeHora = bo.horaNum < HORA_CIERRE_BO;

  const { data: abierta } = await ses.supabase
    .from("operaciones_mesero")
    .select("id")
    .eq("mesero_id", ses.userId)
    .eq("estado", "abierta")
    .maybeSingle();

  if (!abierta) {
    return { error: "No tienes una operación abierta para cerrar." };
  }

  const { error: updErr } = await ses.supabase
    .from("operaciones_mesero")
    .update({
      estado: "cerrada",
      cerrada_en: new Date().toISOString(),
      cierre_anticipado: antesDeHora,
      motivo_cierre_anticipado: antesDeHora
        ? notasCierre?.trim() || "Cerró operación antes de las 22:00 (hora BO)"
        : null,
      notas_cierre: notasCierre?.trim() || null,
    })
    .eq("id", abierta.id);

  if (updErr) return { error: updErr.message };

  if (antesDeHora) {
    await ses.supabase.from("eventos_sesion_mesero").insert({
      mesero_id: ses.userId,
      operacion_id: abierta.id,
      tipo_evento: "cierre_operacion_anticipado",
      hora_bolivia_texto: bo.horaBoliviaTexto,
      fuera_de_horario: true,
      detalle:
        notasCierre?.trim() ||
        `Cerró operación a las ${bo.horaBoliviaTexto} BO (antes de las 22:00).`,
    });
  }

  refrescarRutasMesero();
  return {
    success: true,
    cierreAnticipado: antesDeHora,
    horaBolivia: bo.horaBoliviaTexto,
  };
}

export async function registrarYcerrarSesionMesero(motivo?: string) {
  const ses = await sesionMesero();
  if ("error" in ses) return { error: ses.error };

  const bo = obtenerInfoHoraBolivia();
  const antesDeHora = bo.horaNum < HORA_CIERRE_BO;

  const { data: abierta } = await ses.supabase
    .from("operaciones_mesero")
    .select("id")
    .eq("mesero_id", ses.userId)
    .eq("estado", "abierta")
    .maybeSingle();

  const ahoraIso = new Date().toISOString();

  if (abierta) {
    await ses.supabase
      .from("operaciones_mesero")
      .update({
        cerro_sesion_en: ahoraIso,
        cierre_anticipado: antesDeHora,
        motivo_cierre_anticipado: antesDeHora
          ? motivo?.trim() || "Cerró sesión antes de horario (hora BO)"
          : null,
      })
      .eq("id", abierta.id);
  }

  await ses.supabase.from("eventos_sesion_mesero").insert({
    mesero_id: ses.userId,
    operacion_id: abierta?.id ?? null,
    tipo_evento: "cierre_sesion",
    hora_bolivia_texto: bo.horaBoliviaTexto,
    fuera_de_horario: antesDeHora,
    detalle:
      motivo?.trim() ||
      (antesDeHora
        ? `Cerró sesión a las ${bo.horaBoliviaTexto} BO (antes del cierre de las 22:00).`
        : `Cerró sesión a las ${bo.horaBoliviaTexto} BO.`),
  });

  await ses.supabase.auth.signOut();

  return {
    success: true,
    antesDeHora,
    horaBolivia: bo.horaBoliviaTexto,
  };
}