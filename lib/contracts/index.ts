// 계약 채움 엔진 — 템플릿의 칸을 데이터로 채우고, 못 채운 칸이 있으면 «거절»한다.
//
// ★왜 거절인가
//   원고의 규율이 「추후 협의·별도 정함을 한 칸도 쓰지 않는다」이다. 빈칸이 남은 계약서는
//   그 규율을 이미 깨뜨린 문서이고, 그 상태로 강사에게 가면 협상 여지가 아니라 분쟁 여지가 된다.
//   ⛔「비어 있으면 빈 문자열로」는 가장 흔한 fail-to-zero 다 — 빈칸은 조용히 사라지고 문서는 완성돼 보인다.
//
// ★무엇이 비었는지 «이름»으로 말한다 — 「생성 실패」만 말하면 운영자가 어디를 고칠지 모른다.
export { INSTRUCTOR_CONTRACT_TEMPLATE, TEMPLATE_REV, TEMPLATE_APPROVED } from './instructor-engagement'

export type FillResult =
  | { ok: true; body: string; filled: string[] }
  | { ok: false; missing: string[]; label: string }

/** 템플릿이 요구하는 칸 이름을 전부 돌려준다. */
export function templateTokens(template: string): string[] {
  return [...new Set([...template.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]))]
}

/** 칸 이름 → 사람이 읽는 이름. 운영자 화면에 「instructorBizNo 가 비었다」고 적지 않는다. */
export const FIELD_LABEL: Record<string, string> = {
  instructorName: '강사 성명',
  instructorBizNo: '강사 사업자등록번호(없으면 「해당 없음」)',
  instructorAddress: '강사 주소',
  instructorContact: '강사 연락처',
  programTitle: '과정명',
  cohortLabel: '기수',
  orgName: '발주사명',
  sessionCount: '위촉 회차 수',
  venueLabel: '실시 장소 유형',
  region: '출강 지역',
  sessionRows: '회차별 명세',
  priorClients: '기존 거래 기업(없으면 「없음」)',
  feePerSession: '회당 강사료',
  feeTotal: '강사료 총액',
  travelPerSession: '회차당 이동 실비',
  travelSessions: '이동 실비 대상 회차 수',
  travelTotal: '이동 실비 총액',
  travel충청강원: '충청·강원 이동 실비',
  travel영호남: '영남·호남 이동 실비',
  travel제주: '제주 이동 실비',
  incomeType: '소득 구분',
  vatType: '부가가치세 처리',
  bankAccount: '지급 계좌',
  contractDate: '계약일',
}

const human = (k: string) => FIELD_LABEL[k] ?? k

/**
 * 채운다. 값이 없거나 빈 문자열인 칸이 하나라도 있으면 채우지 않고 무엇이 비었는지 돌려준다.
 * ⛔값에 들어온 `{{...}}` 는 치환하지 않는다 — 데이터가 템플릿을 늘리지 못하게 한다.
 */
export function fillContract(template: string, values: Record<string, string | number | null | undefined>): FillResult {
  const need = templateTokens(template)
  const missing = need.filter((k) => {
    const v = values[k]
    return v === undefined || v === null || String(v).trim() === ''
  })
  if (missing.length > 0) {
    return {
      ok: false,
      missing,
      label: `채우지 못한 칸 ${missing.length}개 — ${missing.map(human).join(' · ')}`,
    }
  }
  const body = template.replace(/\{\{(\w+)\}\}/g, (_, k: string) =>
    String(values[k]).replace(/\{\{/g, '｛｛'),
  )
  // ★채운 뒤 다시 센다 — 치환이 실패해도 조용히 지나가지 않게 한다
  const left = templateTokens(body)
  if (left.length > 0) {
    return { ok: false, missing: left, label: `치환되지 않은 칸이 남았다 — ${left.map(human).join(' · ')}` }
  }
  return { ok: true, body, filled: need }
}

/** 회차별 명세 표의 줄 — 빈 줄을 남기지 않는다(원고 별표1의 지시). */
export function sessionRow(i: number, when: string, place: string, topic: string, minutes: number): string {
  return `| 제${i}회차 | ${when} | ${place} | ${topic} | ${minutes}분 |`
}
export { IP_NOTICE, IP_NOTICE_SHORT } from "./ip-notice";  // 지식재산권 고지 — 과정 안내·소개서 공통
