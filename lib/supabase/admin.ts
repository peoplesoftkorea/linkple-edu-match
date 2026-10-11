// 서버 «전용» 클라이언트. service_role 키를 쓴다.
// 🔴이 파일을 클라이언트 컴포넌트에서 import 하지 않는다 — 키가 번들에 실린다.
import { createClient as createAdminClient } from '@supabase/supabase-js'

export function createAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY 가 없다 — .env.local 을 확인한다')
  return createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
