// 서버 컴포넌트·라우트 핸들러용 Supabase 클라이언트(쿠키 기반 세션).
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const store = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          // 서버 컴포넌트에서는 쓰기가 막힌다 — 미들웨어가 갱신을 맡으므로 조용히 넘긴다.
          try { list.forEach(({ name, value, options }) => store.set(name, value, options)) } catch {}
        },
      },
    },
  )
}
