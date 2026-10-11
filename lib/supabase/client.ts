// 브라우저용 Supabase 클라이언트.
//
// ⛔사업 리포(apps/edu)의 SSO 쿠키 규격(`sb-linkple` · 도메인 공유)을 들고 오지 않는다.
//   미러는 «독립 실행»이고 학습 스코프 도메인에 붙는다 — 사업 세션과 섞이면 안 된다.
//   그 경계가 [[if3-학습-사업인프라-경계]]·[[if3기-미션6-10-사업전이]] §4 가 정한 분리선이다.
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
