// 이벤트 정본 — 미러 전용.
//
// ⛔사업 리포 `packages/analytics`(127종)를 import 하지 않는다. 미러는 독립 실행이어야 한다.
//   필요한 것만 «값으로» 옮긴다. 이름은 사업 쪽과 맞춰 둔다 — 나중에 비교할 때 축이 같아야 한다.
// ★3-2(Amplitude 데이터 분석)의 입력이 이 목록이다. 여기 없는 이벤트는 11월에 분석할 수 없다.

export const EVENTS = {
  page_view:        { desc: '화면 진입' },
  signup_started:   { desc: '가입 시작' },
  signup_completed: { desc: '가입 완료' },
  login_completed:  { desc: '로그인 완료' },
  order_created:    { desc: '교육 발주 등록' },
  match_run:        { desc: '강사 배정 산출 실행' },
  engagement_sent:  { desc: '강사에게 위촉 제안' },
  engagement_replied:{ desc: '강사 수락·거절' },
  contract_signed:  { desc: '계약 서명 완료' },
  payout_settled:   { desc: '강사료 정산 완료' },
} as const

export type EventName = keyof typeof EVENTS
