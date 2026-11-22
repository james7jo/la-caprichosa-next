import { Suspense } from "react";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  UsuariosManager,
  type UsuarioPerfil,
} from "@/components/ui/UsuariosManager";

async function UsuariosContenido() {
  await connection();

  const supabase = await createClient();
  const { data: usuarios, error } = await supabase
    .from("profiles")
    .select("id, username, nombre, rol, activo, avatar_url")
    .order("created_at", { ascending: false });

  return (
    <>
      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          No se pudo cargar la lista de usuarios: {error.message}
        </div>
      )}

      <UsuariosManager usuarios={(usuarios ?? []) as UsuarioPerfil[]} />
    </>
  );
}

function UsuariosSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <div className="lg:col-span-4 h-96 rounded-3xl border border-white/[0.07] bg-stone-900/60 animate-pulse" />
      <div className="lg:col-span-8 h-96 rounded-3xl border border-white/[0.07] bg-stone-900/60 animate-pulse" />
    </div>
  );
}

export default function UsuariosPage() {
  return (
    <main className="min-h-full bg-stone-950 text-stone-100 p-4 sm:p-6 md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">
            Equipo y credenciales
          </h1>
          <p className="mt-1 text-sm sm:text-base text-stone-400">
            Crea usuarios con foto y contraseña para cajeras y meseros, edita
            datos o claves, o elimina cuentas cuando alguien se retire.
          </p>
        </div>

        <Suspense fallback={<UsuariosSkeleton />}>
          <UsuariosContenido />
        </Suspense>
      </div>
    </main>
  );
}
