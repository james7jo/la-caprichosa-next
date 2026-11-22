"use client";

import { useState, useTransition } from "react";
import { loginConUsuario } from "@/actions/auth.actions";
import { UtensilsCrossed, Lock, User } from "lucide-react";
import { toast } from "sonner";

export default function LoginPage() {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setErrorMsg(null);
    startTransition(async () => {
      const res = await loginConUsuario(formData);
      if (res?.error) {
        setErrorMsg(res.error);
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-950 p-4">
      <div className="w-full max-w-md bg-stone-900 border border-stone-800 rounded-2xl p-6 shadow-xl text-stone-100">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400 mb-3">
            <UtensilsCrossed className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            Sistema Restaurante
          </h1>
          <p className="text-sm text-stone-400 mt-1">
            Parrilla &amp; Hamburguesas · Acceso del personal
          </p>
        </div>

        <form action={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-300 mb-1">
              Usuario
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                name="username"
                type="text"
                required
                autoComplete="username"
                placeholder="Ej. admin, caja1, juan"
                className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-stone-950 border border-stone-700 text-stone-100 placeholder:text-stone-500 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-300 mb-1">
              Contraseña
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                name="password"
                type="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-stone-950 border border-stone-700 text-stone-100 placeholder:text-stone-500 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/40 text-red-300 text-sm">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-semibold transition cursor-pointer"
          >
            {isPending ? "Ingresando..." : "Iniciar sesión"}
          </button>
        </form>
      </div>
    </div>
  );
}
