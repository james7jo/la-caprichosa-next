import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    console.error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL o la clave pública de Supabase en .env.local'
    )
    return supabaseResponse
  }

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        )
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        )
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname
  const esRutaAdmin = pathname.startsWith('/admin')
  const esRutaCaja = pathname.startsWith('/caja')
  const esRutaMeseros = pathname.startsWith('/meseros')
  const esRutaPrivada = esRutaAdmin || esRutaCaja || esRutaMeseros

  if (!esRutaPrivada) {
    return supabaseResponse
  }

  // 1. Sin sesión -> redirige al login
  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // 2. Consulta rol y estado activo en profiles
  const { data: profile } = await supabase
    .from('profiles')
    .select('rol, activo')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile || !profile.activo) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  const rol = profile.rol as 'admin' | 'cajera' | 'mesero'

  // 3. Validación estricta por ruta:
  // - /admin: solo 'admin'
  // - /caja: solo 'cajera' (si prefieres que 'admin' también entre, cambia a `rol !== 'cajera' && rol !== 'admin'`)
  // - /meseros: solo 'mesero' (si prefieres que 'admin' también entre, cambia a `rol !== 'mesero' && rol !== 'admin'`)
  if (esRutaAdmin && rol !== 'admin') {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (esRutaCaja && rol !== 'cajera') {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (esRutaMeseros && rol !== 'mesero') {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}