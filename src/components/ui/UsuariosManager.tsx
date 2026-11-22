"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  crearUsuarioPersonal,
  editarUsuarioPersonal,
  eliminarUsuarioPersonal,
} from "@/actions/auth.actions";

export type UsuarioPerfil = {
  id: string;
  username: string;
  nombre: string;
  rol: "admin" | "cajera" | "mesero";
  activo: boolean;
  avatar_url?: string | null;
};

// text-base en celular evita el zoom automático de iOS al tocar un campo
const inputCls =
  "w-full rounded-xl border border-white/10 bg-stone-950 px-3.5 py-3 text-base text-white placeholder:text-stone-600 transition focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/20 sm:py-2.5 sm:text-sm";
const labelCls =
  "text-xs font-semibold uppercase tracking-wider text-stone-400";
const fileCls =
  "block w-full text-xs text-stone-300 file:mr-3 file:rounded-xl file:border-0 file:bg-amber-500/20 file:px-3 file:py-2 file:text-xs file:font-bold file:text-amber-300 hover:file:bg-amber-500/30";
const cardCls =
  "rounded-3xl border border-white/[0.07] bg-gradient-to-b from-stone-900 to-stone-900/60 shadow-lg shadow-black/20";

async function subirFotoAvatar(file: File, handle: string): Promise<string> {
  const supabase = createClient();
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const safeHandle = handle.replace(/[^a-z0-9._-]/g, "") || "personal";
  const filePath = `${safeHandle}-${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from("avatars")
    .upload(filePath, file, { upsert: true });

  if (error) {
    throw new Error(`Error al subir foto: ${error.message}`);
  }

  const { data } = supabase.storage.from("avatars").getPublicUrl(filePath);
  return data.publicUrl;
}

export function UsuariosManager({ usuarios }: { usuarios: UsuarioPerfil[] }) {
  const router = useRouter();

  // Lista sincronizada con el servidor
  const [lista, setLista] = useState<UsuarioPerfil[]>(usuarios);
  const [filtroRol, setFiltroRol] = useState<
    "todos" | "mesero" | "cajera" | "admin"
  >("todos");

  // Estado para crear
  const [nombre, setNombre] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rol, setRol] = useState<"mesero" | "cajera" | "admin">("mesero");
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);

  // Estado para editar usuario existente / cambiar contraseña
  const [editando, setEditando] = useState<UsuarioPerfil | null>(null);
  const [editNombre, setEditNombre] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editRol, setEditRol] = useState<"mesero" | "cajera" | "admin">(
    "mesero",
  );
  const [editActivo, setEditActivo] = useState(true);
  const [editPassword, setEditPassword] = useState("");
  const [editFotoUrl, setEditFotoUrl] = useState<string | null>(null);
  const [editFotoFile, setEditFotoFile] = useState<File | null>(null);
  const [editFotoPreview, setEditFotoPreview] = useState<string | null>(null);

  const [mensaje, setMensaje] = useState<{
    tipo: "ok" | "error";
    texto: string;
  } | null>(null);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setLista(usuarios);
  }, [usuarios]);

  // Cerrar el panel de edición con la tecla Escape (PC)
  useEffect(() => {
    if (!editando) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setEditando(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editando]);

  function refrescarLista() {
    router.refresh();
  }

  function handleSeleccionarFotoCrear(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setFotoFile(file);
    if (file) {
      setFotoPreview(URL.createObjectURL(file));
    } else {
      setFotoPreview(null);
    }
  }

  function handleCrear(e: React.FormEvent) {
    e.preventDefault();
    setMensaje(null);

    const usuarioLimpio = username.trim().toLowerCase();
    startTransition(async () => {
      try {
        let avatarUrl: string | null = null;
        if (fotoFile) {
          setSubiendoFoto(true);
          avatarUrl = await subirFotoAvatar(fotoFile, usuarioLimpio);
          setSubiendoFoto(false);
        }

        const res = await crearUsuarioPersonal({
          nombre,
          username: usuarioLimpio,
          password,
          rol,
          avatar_url: avatarUrl,
        });

        if (res?.error) {
          setMensaje({ tipo: "error", texto: res.error });
          return;
        }

        setMensaje({
          tipo: "ok",
          texto: `Credencial creada para @${usuarioLimpio} (${rol}).`,
        });
        setNombre("");
        setUsername("");
        setPassword("");
        setRol("mesero");
        setFotoFile(null);
        setFotoPreview(null);
        router.refresh();
      } catch (err) {
        setSubiendoFoto(false);
        setMensaje({
          tipo: "error",
          texto:
            err instanceof Error ? err.message : "No se pudo crear el usuario.",
        });
      }
    });
  }

  function abrirEdicion(u: UsuarioPerfil) {
    setMensaje(null);
    setEditando(u);
    setEditNombre(u.nombre);
    setEditUsername(u.username);
    setEditRol(u.rol);
    setEditActivo(u.activo);
    setEditPassword("");
    setEditFotoUrl(u.avatar_url ?? null);
    setEditFotoFile(null);
    setEditFotoPreview(u.avatar_url ?? null);
  }

  function handleSeleccionarFotoEditar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setEditFotoFile(file);
    if (file) {
      setEditFotoPreview(URL.createObjectURL(file));
    } else {
      setEditFotoPreview(editFotoUrl);
    }
  }

  function handleGuardarEdicion(e: React.FormEvent) {
    e.preventDefault();
    if (!editando) return;
    setMensaje(null);

    const usuarioLimpio = editUsername.trim().toLowerCase();
    startTransition(async () => {
      try {
        let finalAvatarUrl = editFotoUrl;
        if (editFotoFile) {
          setSubiendoFoto(true);
          finalAvatarUrl = await subirFotoAvatar(editFotoFile, usuarioLimpio);
          setSubiendoFoto(false);
        }

        const res = await editarUsuarioPersonal({
          userId: editando.id,
          nombre: editNombre,
          username: usuarioLimpio,
          rol: editRol,
          activo: editActivo,
          avatar_url: finalAvatarUrl,
          nuevaPassword: editPassword.trim() || undefined,
        });

        if (res?.error) {
          setMensaje({ tipo: "error", texto: res.error });
          return;
        }

        setMensaje({
          tipo: "ok",
          texto: `Datos de @${usuarioLimpio} actualizados${
            editPassword.trim() ? " (incluyendo nueva contraseña)" : ""
          }.`,
        });
        setEditando(null);
        router.refresh();
      } catch (err) {
        setSubiendoFoto(false);
        setMensaje({
          tipo: "error",
          texto:
            err instanceof Error
              ? err.message
              : "No se pudo actualizar el usuario.",
        });
      }
    });
  }

  function handleEliminar(
    id: string,
    nombreUsuario: string,
    userHandle: string,
  ) {
    setMensaje(null);
    const ok = window.confirm(
      `¿Seguro que deseas eliminar las credenciales de ${nombreUsuario} (@${userHandle})? Ya no podrá entrar al sistema.`,
    );
    if (!ok) return;

    startTransition(async () => {
      const res = await eliminarUsuarioPersonal(id);
      if (res?.error) {
        setMensaje({ tipo: "error", texto: res.error });
        return;
      }
      if (editando?.id === id) {
        setEditando(null);
      }
      setLista((prev) => prev.filter((item) => item.id !== id));
      setMensaje({
        tipo: "ok",
        texto: `Credenciales de @${userHandle} eliminadas.`,
      });
      router.refresh();
    });
  }

  const usuariosFiltrados =
    filtroRol === "todos"
      ? lista
      : lista.filter((item) => item.rol === filtroRol);

  const ocupado = isPending || subiendoFoto;

  return (
    <div className="space-y-5">
      {/* Mensaje: queda visible aunque estés más abajo en la pantalla */}
      {mensaje && (
        <div
          role="status"
          className={`sticky top-[88px] z-10 flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-sm font-medium shadow-xl shadow-black/40 backdrop-blur-md md:top-[104px] ${
            mensaje.tipo === "ok"
              ? "border-emerald-500/30 bg-emerald-950/90 text-emerald-200"
              : "border-rose-500/30 bg-rose-950/90 text-rose-200"
          }`}
        >
          <span className="min-w-0 break-words">
            {mensaje.tipo === "ok" ? "✅ " : "⚠️ "}
            {mensaje.texto}
          </span>
          <button
            type="button"
            onClick={() => setMensaje(null)}
            aria-label="Cerrar mensaje"
            className="shrink-0 rounded-lg px-2 text-base leading-none opacity-70 transition hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      {/* Panel de edición: ventana inferior en celular, centrada en PC */}
      {editando && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={`Editar a @${editando.username}`}
        >
          <button
            type="button"
            aria-label="Cerrar edición"
            onClick={() => setEditando(null)}
            className="absolute inset-0 cursor-default bg-black/75 backdrop-blur-sm"
          />

          <form
            onSubmit={handleGuardarEdicion}
            className="relative z-10 max-h-[92dvh] w-full max-w-2xl space-y-5 overflow-y-auto overscroll-contain rounded-t-3xl border border-amber-400/40 bg-stone-900 p-5 pb-8 shadow-2xl sm:rounded-3xl sm:p-6"
          >
            {/* Barrita de arrastre (solo celular) */}
            <div
              aria-hidden
              className="mx-auto -mt-1 h-1.5 w-12 rounded-full bg-white/15 sm:hidden"
            />

            <div className="flex items-start justify-between gap-3 border-b border-white/[0.07] pb-4">
              <div className="min-w-0">
                <h3 className="truncate text-lg font-extrabold text-amber-300">
                  ✏️ Editar · @{editando.username}
                </h3>
                <p className="mt-0.5 text-xs text-stone-400">
                  Actualiza foto, datos, rol o asigna una contraseña nueva por
                  seguridad.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditando(null)}
                aria-label="Cerrar"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-sm font-semibold text-stone-300 transition hover:bg-white/10"
              >
                ✕
              </button>
            </div>

            <div className="flex items-center gap-4">
              <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/15 bg-stone-950 text-2xl">
                {editFotoPreview ? (
                  <img
                    src={editFotoPreview}
                    alt={editNombre}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span>👤</span>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                <label className={labelCls}>Cambiar foto del personal</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleSeleccionarFotoEditar}
                  className={fileCls}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className={labelCls}>Nombre completo</label>
                <input
                  value={editNombre}
                  onChange={(e) => setEditNombre(e.target.value)}
                  required
                  className={inputCls}
                />
              </div>

              <div className="space-y-1.5">
                <label className={labelCls}>Usuario (login)</label>
                <input
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  required
                  autoCapitalize="none"
                  autoCorrect="off"
                  className={inputCls}
                />
              </div>

              <div className="space-y-1.5">
                <label className={labelCls}>Rol</label>
                <select
                  value={editRol}
                  onChange={(e) =>
                    setEditRol(e.target.value as "mesero" | "cajera" | "admin")
                  }
                  className={`${inputCls} font-medium`}
                >
                  <option value="mesero">🍽️ Mesero</option>
                  <option value="cajera">💰 Cajera</option>
                  <option value="admin">👑 Administrador / Jefe</option>
                </select>
              </div>

              <div className="flex items-end">
                <label className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/10 bg-stone-950 px-3.5 py-3 text-base sm:py-2.5 sm:text-sm">
                  <span className="font-medium text-stone-200">
                    Cuenta activa
                  </span>
                  <input
                    type="checkbox"
                    checked={editActivo}
                    onChange={(e) => setEditActivo(e.target.checked)}
                    className="h-5 w-5 accent-amber-400"
                  />
                </label>
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <label className={labelCls}>
                  Nueva contraseña (opcional · vacío para mantener la actual)
                </label>
                <input
                  type="password"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  minLength={6}
                  placeholder="Escribe una clave nueva (mín. 6 caracteres)"
                  className={inputCls}
                />
              </div>
            </div>

            <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setEditando(null)}
                className="rounded-2xl border border-white/10 px-5 py-3 text-sm font-semibold text-stone-300 transition hover:bg-white/5 active:scale-95"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={ocupado}
                className="rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 px-6 py-3 text-sm font-extrabold text-stone-950 shadow-lg shadow-orange-600/20 transition hover:brightness-110 active:scale-95 disabled:opacity-50"
              >
                {ocupado ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:items-start lg:gap-6">
        {/* Formulario para crear credencial con foto
            (en celular va después de la lista; en PC queda a la izquierda) */}
        <form
          onSubmit={handleCrear}
          className={`${cardCls} order-2 space-y-4 p-5 sm:p-6 lg:sticky lg:top-28 lg:order-1 lg:col-span-4`}
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-extrabold text-white">
              ➕ Nueva credencial
            </h2>
            <span className="shrink-0 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-300">
              Con foto
            </span>
          </div>

          <div className="flex items-center gap-3.5">
            <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/15 bg-stone-950 text-2xl">
              {fotoPreview ? (
                <img
                  src={fotoPreview}
                  alt="Vista previa"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span>📷</span>
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <label className={labelCls}>Foto del personal</label>
              <input
                type="file"
                accept="image/*"
                onChange={handleSeleccionarFotoCrear}
                className={fileCls}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className={labelCls}>Nombre completo</label>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
              placeholder="Ej. Valeria Mamani"
              className={inputCls}
            />
          </div>

          <div className="space-y-1.5">
            <label className={labelCls}>Usuario para entrar</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoCapitalize="none"
              autoCorrect="off"
              placeholder="Ej. valeria o caja2"
              className={inputCls}
            />
          </div>

          <div className="space-y-1.5">
            <label className={labelCls}>Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              placeholder="Mínimo 6 caracteres"
              className={inputCls}
            />
          </div>

          <div className="space-y-1.5">
            <label className={labelCls}>Puesto / Rol</label>
            <select
              value={rol}
              onChange={(e) =>
                setRol(e.target.value as "mesero" | "cajera" | "admin")
              }
              className={`${inputCls} font-medium`}
            >
              <option value="mesero">🍽️ Mesero (ventas y mesas)</option>
              <option value="cajera">💰 Cajera (operación y caja)</option>
              <option value="admin">👑 Administrador / Jefe</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={ocupado}
            className="w-full rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 py-3.5 text-sm font-extrabold text-stone-950 shadow-lg shadow-orange-600/20 transition hover:brightness-110 active:scale-95 disabled:opacity-50"
          >
            {ocupado ? "Creando cuenta..." : "Crear credencial"}
          </button>
        </form>

        {/* Lista de usuarios con foto, filtro por rol, editar y eliminar */}
        <div
          className={`${cardCls} order-1 overflow-hidden lg:order-2 lg:col-span-8`}
        >
          <div className="space-y-3 border-b border-white/[0.07] px-4 py-4 sm:px-5">
            <div>
              <h2 className="text-lg font-extrabold text-white">
                Personal registrado
              </h2>
              <p className="text-xs text-stone-400">
                {usuariosFiltrados.length} de {lista.length} cuenta(s) · Edita
                datos, cambia claves o elimina accesos
              </p>
            </div>

            {/* Filtros: se deslizan de lado en celular */}
            <div className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {(
                [
                  { key: "todos", label: "Todos" },
                  { key: "mesero", label: "Meseros" },
                  { key: "cajera", label: "Cajeras" },
                  { key: "admin", label: "Admin" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setFiltroRol(tab.key)}
                  className={`shrink-0 whitespace-nowrap rounded-xl px-3.5 py-2 text-xs font-bold transition active:scale-95 sm:px-3 sm:py-1.5 ${
                    filtroRol === tab.key
                      ? "bg-amber-400 text-stone-950"
                      : "bg-white/5 text-stone-300 hover:bg-white/10"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
              <button
                type="button"
                onClick={refrescarLista}
                disabled={ocupado}
                title="Actualizar lista"
                aria-label="Actualizar lista"
                className="ml-auto shrink-0 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-semibold text-stone-300 transition hover:bg-white/10 active:scale-95 disabled:opacity-50 sm:px-3 sm:py-1.5"
              >
                ↻
              </button>
            </div>
          </div>

          {usuariosFiltrados.length === 0 ? (
            <div className="p-8 text-center text-sm text-stone-400">
              No hay usuarios en este filtro. Crea uno{" "}
              <span className="lg:hidden">más abajo</span>
              <span className="hidden lg:inline">a la izquierda</span> o cambia
              el filtro.
            </div>
          ) : (
            <div className="divide-y divide-white/[0.05]">
              {usuariosFiltrados.map((u) => (
                <div
                  key={u.id}
                  className="flex flex-col gap-3.5 px-4 py-4 transition hover:bg-white/[0.02] sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5"
                >
                  <div className="flex min-w-0 items-center gap-3.5">
                    <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/10 bg-stone-950 text-xl">
                      {u.avatar_url ? (
                        <img
                          src={u.avatar_url}
                          alt={u.nombre}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span>
                          {u.rol === "admin"
                            ? "👑"
                            : u.rol === "cajera"
                              ? "💰"
                              : "🍽️"}
                        </span>
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="max-w-full truncate font-bold text-white">
                          {u.nombre}
                        </p>
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold capitalize ${
                            u.rol === "admin"
                              ? "border border-amber-500/30 bg-amber-500/15 text-amber-300"
                              : u.rol === "cajera"
                                ? "border border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
                                : "border border-sky-500/30 bg-sky-500/15 text-sky-300"
                          }`}
                        >
                          {u.rol}
                        </span>
                        {!u.activo && (
                          <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] font-bold text-rose-300">
                            Inactivo
                          </span>
                        )}
                      </div>
                      <p className="truncate font-mono text-xs text-stone-400">
                        @{u.username}
                      </p>
                    </div>
                  </div>

                  {/* Botones: a lo ancho en celular, compactos en PC */}
                  <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex sm:items-center sm:justify-end">
                    <button
                      type="button"
                      onClick={() => abrirEdicion(u)}
                      disabled={ocupado}
                      className="rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-xs font-bold text-amber-300 transition hover:bg-white/10 active:scale-95 disabled:opacity-50 sm:py-1.5"
                    >
                      ✏️ Editar / Clave
                    </button>

                    {u.rol !== "admin" ? (
                      <button
                        type="button"
                        onClick={() =>
                          handleEliminar(u.id, u.nombre, u.username)
                        }
                        disabled={ocupado}
                        className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-xs font-bold text-rose-300 transition hover:bg-rose-500/20 active:scale-95 disabled:opacity-50 sm:py-1.5"
                      >
                        🗑️ Eliminar
                      </button>
                    ) : (
                      <span className="grid place-items-center rounded-xl border border-dashed border-white/10 px-3 py-2.5 text-xs text-stone-500 sm:border-0 sm:py-1.5">
                        👑 Jefe
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
