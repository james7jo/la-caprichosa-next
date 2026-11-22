"use server";

import { createClient } from "@/lib/supabase/server";

type Res = { error?: string };

const TIPOS_VALIDOS = [
  "puerta",
  "caja",
  "cocina",
  "barra",
  "banos",
  "parqueo",
  "otro",
];

const pct = (n: number) => Math.min(100, Math.max(0, Number(n) || 0));

export async function crearObjetoPlano(input: {
  zona: string;
  tipo: string;
  etiqueta: string;
  posX: number;
  posY: number;
}): Promise<Res & { id?: string }> {
  if (!input.zona?.trim()) return { error: "Falta el sector." };
  if (!TIPOS_VALIDOS.includes(input.tipo)) {
    return { error: "Tipo de objeto no válido." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("plano_objetos")
    .insert({
      zona: input.zona,
      tipo: input.tipo,
      etiqueta: input.etiqueta.trim().slice(0, 24),
      pos_x: pct(input.posX),
      pos_y: pct(input.posY),
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  return { id: data.id as string };
}

export async function moverObjetoPlano(
  id: string,
  posX: number,
  posY: number,
): Promise<Res> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("plano_objetos")
    .update({ pos_x: pct(posX), pos_y: pct(posY) })
    .eq("id", id);
  return error ? { error: error.message } : {};
}

export async function editarObjetoPlano(
  id: string,
  etiqueta: string,
): Promise<Res> {
  const limpio = etiqueta.trim().slice(0, 24);
  if (!limpio) return { error: "El nombre no puede estar vacío." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("plano_objetos")
    .update({ etiqueta: limpio })
    .eq("id", id);
  return error ? { error: error.message } : {};
}

export async function eliminarObjetoPlano(id: string): Promise<Res> {
  const supabase = await createClient();
  const { error } = await supabase.from("plano_objetos").delete().eq("id", id);
  return error ? { error: error.message } : {};
}