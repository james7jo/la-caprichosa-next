import { createClient } from "@/lib/supabase/client";
import type { MesaCroquis } from "@/components/mesas/croquis-salon";

export type DatosMesasAdmin = {
  userId: string;
  mesas: MesaCroquis[];
  error: string | null;
};

export async function obtenerDatosMesasAdmin(): Promise<DatosMesasAdmin> {
  const supabase = createClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const userId = session?.user?.id ?? "";

  const { data: mData, error } = await supabase
    .from("mesas")
    .select(
      "id, numero, nombre, zona, capacidad, estado, habilitada, solo_fin_de_semana, mesero_actual_id, pos_x, pos_y",
    )
    .order("numero", { ascending: true });

  if (error) {
    return { userId, mesas: [], error: error.message };
  }

  return { userId, mesas: (mData ?? []) as MesaCroquis[], error: null };
}