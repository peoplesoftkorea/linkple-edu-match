import { createClient } from '@supabase/supabase-js'
// 서버 전용 service_role(드롭인) — 이관 CRUD가 기존 코드 그대로 쓰도록 동일 이름 제공.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)
