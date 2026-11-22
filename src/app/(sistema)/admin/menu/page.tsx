import { Suspense } from "react";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  MenuManager,
  type CategoriaMenu,
  type ProductoMenuDB,
} from "@/components/ui/MenuManager";

async function MenuContenido() {
  await connection();
  const supabase = await createClient();

  const [
    { data: categorias, error: catError },
    { data: productos, error: prodError },
  ] = await Promise.all([
    supabase
      .from("menu_categorias")
      .select("id, nombre, label, emoji, orden")
      .order("orden", { ascending: true }),
    supabase
      .from("menu_items")
      .select(
        "id, codigo_legacy, nombre, descripcion, categoria, tipo_item, precio_base, guarnicion_incluida, imagen_url, personalizacion, stock_actual, stock_minimo, controlar_stock, activo",
      )
      .order("created_at", { ascending: false }),
  ]);

  const errorMsg = catError?.message || prodError?.message;

  return (
    <>
      {errorMsg && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          Error al cargar el menú: {errorMsg}
        </div>
      )}
      <MenuManager
        categorias={(categorias ?? []) as CategoriaMenu[]}
        productosIniciales={(productos ?? []) as ProductoMenuDB[]}
      />
    </>
  );
}

function MenuSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-64 rounded-3xl border border-white/[0.07] bg-stone-900/60 animate-pulse" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="h-36 rounded-3xl border border-white/[0.07] bg-stone-900/60 animate-pulse" />
        <div className="h-36 rounded-3xl border border-white/[0.07] bg-stone-900/60 animate-pulse" />
      </div>
    </div>
  );
}

export default function AdminMenuPage() {
  return (
    <main className="min-h-full bg-stone-950 text-stone-100 p-4 sm:p-6 md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">
            Menú y carta
          </h1>
          <p className="mt-1 text-sm sm:text-base text-stone-400">
            Crea y edita platos, parrillas, extras y bebidas con su stock y
            opciones de cocción.
          </p>
        </div>

        <Suspense fallback={<MenuSkeleton />}>
          <MenuContenido />
        </Suspense>
      </div>
    </main>
  );
}
