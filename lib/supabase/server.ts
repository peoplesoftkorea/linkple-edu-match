import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { adminCookieOptions } from './cookie'

export async function serverClient() {
  const store = await cookies()
  // ★세션 격리(감사 L1·품의 2026-008): sb-admin + host-only — 규격은 cookie.ts SSOT.
  //   회원존(sb-linkple) 부모도메인 쿠키와 이름으로 격리되어 운영자↔회원 세션 병합이 성립하지 않는다.
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: adminCookieOptions,
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list: { name: string; value: string; options?: Record<string, unknown> }[]) => {
          try { list.forEach(({ name, value, options }) => store.set(name, value, options as never)) } catch {}
        },
      },
    }
  )
}

export function adminEmails(): string[] {
  return (process.env.COCKPIT_ADMIN_EMAILS || '')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
}
