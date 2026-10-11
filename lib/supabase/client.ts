// 브라우저용 Supabase 클라이언트.
//
// ⛔운영 서비스의 SSO 쿠키 규격(이름·도메인 공유)을 들고 오지 않는다.
//   이 저장소는 «독립 실행»이고 자체 도메인에 붙는다 — 운영 세션과 섞이면 안 된다.
//   기본 쿠키 이름을 그대로 두는 것이 그 분리선이다.
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
