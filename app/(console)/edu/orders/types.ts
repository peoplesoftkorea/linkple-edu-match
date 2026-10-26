// 발주 화면이 «양쪽에서» 쓰는 것 — 서버 페이지와 클라이언트 표가 함께 본다.
//
// 🔴왜 따로 두나 [2026-10-07 실측]
//   클라이언트 표가 `./page` 에서 타입·상수를 가져오자 **서버 모듈(service_role 클라이언트)이
//   브라우저 번들로 끌려들어가** 화면이 통째로 죽었다(`supabaseKey is required`).
//   비밀값 자체는 NEXT_PUBLIC_ 접두가 없어 치환되지 않았지만, 서버 코드가 클라이언트에 실리는
//   구조 자체가 사고의 입구다. ⇒ 양쪽이 보는 것은 «서버를 모르는 파일»에 둔다.

export type OrderRow = {
  id: string; order_no: string; org_name: string; contact_name: string | null
  contact_email: string | null; contact_phone: string | null; program_slug: string | null
  headcount: number | null; preferred_from: string | null; venue_type: string | null
  venue_region: string | null; total: number | null; subtotal: number | null; vat: number | null
  status: string; cancel_reason: string | null; price_basis: string | null; note: string | null
  cohort_id: string | null; is_test: boolean; deleted_at: string | null; created_at: string
  events: { kind: string; from_status: string | null; to_status: string | null; reason: string | null; created_at: string }[]
}

/** 지금 갈 수 있는 곳 — e15 트리거의 표와 «같은 내용»이다. 화면은 그리기만 하고 막는 것은 DB다. */
export const NEXT_STATUS: Record<string, string[]> = {
  quoted: ['ordered', 'cancelled'],
  ordered: ['confirmed', 'cancelled'],
  confirmed: ['invoiced', 'cancelled'],
  invoiced: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
}

export const STATUS_LABEL: Record<string, string> = {
  quoted: '견적', ordered: '발주', confirmed: '확정', invoiced: '청구', completed: '완료', cancelled: '취소',
}
