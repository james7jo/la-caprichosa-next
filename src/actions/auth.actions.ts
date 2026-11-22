"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

const DOMINIO_INTERNO = "restaurante.local";

function limpiarUsername(username: string) {
  return username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
}

function usernameToEmail(username: string) {
  return `${limpiarUsername(username)}@${DOMINIO_INTERNO}`;
}

function getRutaPorRol(rol: "admin" | "cajera" | "mesero") {
  if (rol === "admin") return "/admin";
  if (rol === "cajera") return "/caja";
  return "/meseros";
}

function getAdminSupabase() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en .env.local.");
  }
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function verificarAdminActivo() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "No autorizado. Inicia sesión nuevamente." as const };
  }

  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("rol, activo")
    .eq("id", user.id)
    .single();

  if (!adminProfile || !adminProfile.activo || adminProfile.rol !== "admin") {
    return { error: "Solo el administrador puede gestionar credenciales." as const };
  }

  return { userId: user.id, supabase };
}

export async function loginConUsuario(formData: FormData) {
  const username = String(formData.get("username") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!username || !password) {
    return { error: "Ingresa tu usuario y contraseña." };
  }

  const supabase = await createClient();
  const emailInterno = usernameToEmail(username);

  const { data, error } = await supabase.auth.signInWithPassword({
    email: emailInterno,
    password,
  });

  if (error || !data.user) {
    return { error: error?.message || "Usuario o contraseña incorrectos." };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("rol, activo")
    .eq("id", data.user.id)
    .single();

  if (profileError || !profile) {
    await supabase.auth.signOut();
    return { error: "No se encontró el perfil del usuario." };
  }

  if (!profile.activo) {
    await supabase.auth.signOut();
    return {
      error: "Este usuario está desactivado. Habla con el administrador.",
    };
  }

  if (profile.rol === "cajera" || profile.rol === "mesero") {
    try {
      const supabaseAdmin = getAdminSupabase();
      const { data: cajaAbierta, error: cajaErr } = await supabaseAdmin
        .from("cierres_caja")
        .select("id, estado, cerrado_en")
        .is("cerrado_en", null)
        .order("abierto_en", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cajaErr) {
        console.error("Error consultando cierres_caja en login:", cajaErr);
      }

      if (!cajaAbierta || String(cajaAbierta.estado) === "cerrado") {
        await supabase.auth.signOut();
        return {
          error:
            "La caja aún no ha sido abierta por el administrador. Pide que abra caja para ingresar.",
        };
      }
    } catch (err) {
      console.error("Fallo verificando caja abierta:", err);
      await supabase.auth.signOut();
      return {
        error:
          "No se pudo verificar el estado de caja. Revisa la configuración del servidor.",
      };
    }
  }

  if (profile.rol === "mesero") {
    try {
      const supabaseAdmin = getAdminSupabase();
      const { data: opExistente } = await supabaseAdmin
        .from("operaciones_mesero")
        .select("id")
        .eq("mesero_id", data.user.id)
        .eq("estado", "abierta")
        .order("abierta_en", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!opExistente) {
        await supabaseAdmin.from("operaciones_mesero").insert({
          mesero_id: data.user.id,
          estado: "abierta",
          abierta_en: new Date().toISOString(),
        });
      }
    } catch (opErr) {
      console.error("No se pudo registrar operación automática de mesero:", opErr);
    }
  }

  redirect(getRutaPorRol(profile.rol));
}

export async function cerrarSesion() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function crearUsuarioPersonal(input: {
  username: string;
  nombre: string;
  password: string;
  rol: "admin" | "cajera" | "mesero";
  avatar_url?: string | null;
}) {
  const authCheck = await verificarAdminActivo();
  if ("error" in authCheck) return { error: authCheck.error };

  const cleanUsername = limpiarUsername(input.username);
  const nombreLimpio = input.nombre.trim();

  if (!cleanUsername || !nombreLimpio || input.password.length < 6) {
    return {
      error:
        "Completa nombre, usuario válido y contraseña (mínimo 6 caracteres).",
    };
  }

  try {
    const supabaseAdmin = getAdminSupabase();

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: usernameToEmail(cleanUsername),
      password: input.password,
      email_confirm: true,
      user_metadata: {
        username: cleanUsername,
        nombre: nombreLimpio,
        rol: input.rol,
        avatar_url: input.avatar_url ?? null,
      },
    });

    if (error || !created.user) {
      return { error: error?.message ?? "No se pudo crear el usuario." };
    }

    await supabaseAdmin.from("profiles").upsert(
      {
        id: created.user.id,
        username: cleanUsername,
        nombre: nombreLimpio,
        rol: input.rol,
        activo: true,
        avatar_url: input.avatar_url ?? null,
      },
      { onConflict: "id" },
    );

    revalidatePath("/admin/usuarios");
    return { success: true };
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error inesperado al crear usuario.",
    };
  }
}

export async function editarUsuarioPersonal(input: {
  userId: string;
  username: string;
  nombre: string;
  rol: "admin" | "cajera" | "mesero";
  activo: boolean;
  avatar_url?: string | null;
  nuevaPassword?: string;
}) {
  const authCheck = await verificarAdminActivo();
  if ("error" in authCheck) return { error: authCheck.error };

  const cleanUsername = limpiarUsername(input.username);
  const nombreLimpio = input.nombre.trim();

  if (!input.userId || !cleanUsername || !nombreLimpio) {
    return { error: "Nombre y usuario son obligatorios." };
  }

  if (input.nuevaPassword && input.nuevaPassword.trim().length > 0) {
    if (input.nuevaPassword.trim().length < 6) {
      return {
        error: "La nueva contraseña debe tener al menos 6 caracteres.",
      };
    }
  }

  try {
    const supabaseAdmin = getAdminSupabase();

    const authUpdatePayload: {
      email: string;
      password?: string;
      user_metadata: Record<string, unknown>;
    } = {
      email: usernameToEmail(cleanUsername),
      user_metadata: {
        username: cleanUsername,
        nombre: nombreLimpio,
        rol: input.rol,
        avatar_url: input.avatar_url ?? null,
      },
    };

    if (input.nuevaPassword && input.nuevaPassword.trim().length >= 6) {
      authUpdatePayload.password = input.nuevaPassword.trim();
    }

    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
      input.userId,
      authUpdatePayload,
    );

    if (authError) {
      return { error: authError.message };
    }

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({
        username: cleanUsername,
        nombre: nombreLimpio,
        rol: input.rol,
        activo: input.activo,
        avatar_url: input.avatar_url ?? null,
      })
      .eq("id", input.userId);

    if (profileError) {
      return { error: profileError.message };
    }

    revalidatePath("/admin/usuarios");
    return { success: true };
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Error inesperado al editar usuario.",
    };
  }
}

export async function eliminarUsuarioPersonal(userId: string) {
  const authCheck = await verificarAdminActivo();
  if ("error" in authCheck) return { error: authCheck.error };

  if (authCheck.userId === userId) {
    return { error: "No puedes eliminar tu propia cuenta de administrador." };
  }

  try {
    const supabaseAdmin = getAdminSupabase();

    await supabaseAdmin.from("profiles").delete().eq("id", userId);

    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) {
      return { error: error.message };
    }

    revalidatePath("/admin/usuarios");
    return { success: true };
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Error inesperado al eliminar usuario.",
    };
  }
}