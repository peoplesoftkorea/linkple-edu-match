import 'server-only'

// 과정 카탈로그 조회 — edu 앱이 SSOT 다.
//
// ★왜 actions.ts 가 아니라 여기인가 — `'use server'` 파일의 export 는 «전부 서버 액션»이 된다.
//   즉 클라이언트가 부를 수 있는 엔드포인트가 하나 더 생긴다. 이 함수는 화면을 그리려고
//   서버가 스스로 부르는 조회이므로 액션일 이유가 없다. 필요 없는 문을 만들지 않는다.
//
// 🔴fail-to-zero 금지 — 실패를 «빈 배열»로 바꾸지 않는다. null 로 돌려 화면이
//   「과정이 없다」와 「못 읽었다」를 가르게 한다.

export type CatalogProgram = { slug: string; name: string; price: number | null }

export async function loadPrograms(): Promise<CatalogProgram[] | null> {
  const base = process.env.EDU_APP_URL || 'https://linkple-edu-match.vercel.app'
  try {
    const res = await fetch(`${base}/api/programs`, { next: { revalidate: 300 } })
    if (!res.ok) return null
    const json = (await res.json()) as { programs?: CatalogProgram[] }
    return Array.isArray(json.programs) && json.programs.length ? json.programs : null
  } catch {
    return null
  }
}
