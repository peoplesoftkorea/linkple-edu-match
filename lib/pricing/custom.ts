// 맞춤 과정 단가 — 카탈로그에 없는 발주를 «원가»에서 쌓아 올린다.
//
// ★왜 따로인가 [2026-10-07]
//   `edu.ts` 의 PROGRAM_RATE 는 운영 중인 세 과정의 «확정 단가»다(대표님 승인 2026-10-04).
//   발주사가 「중간관리자 40명에게 데이터 기반 의사결정을 8주」처럼 **카탈로그 밖**을 물으면
//   그 표에 값이 없다. 값이 없다고 「문의 주십시오」로 돌려보내는 것이 지금의 영업 마찰이다.
//
// ★금액을 LLM 이 정하지 않는다 — 이 파일이 정한다.
//   LLM 은 요구 문장을 «회차 구성»으로 분해할 뿐이고, 분해된 회차 수·시간이 이 식의 입력이 된다.
//   ⛔모델이 돌려준 금액 필드는 호출부에서 버린다. 설명할 수 없는 숫자를 견적에 싣지 않는다.
//
// ★그리고 이 식을 세 과정에 «되돌려» 대조한 결과를 함께 낸다(`catalogControl`) —
//   식이 아는 사례에서 얼마나 빗나가는지 보지 않고 모르는 사례에 쓰지 않는다.
//
// ★2026-10-26 — **값은 `rates.ts` 가 쥔다.** 이 파일은 산식만 둔다(목표 직접비율의 역산
//   근거도 그 파일로 옮겼다). 호출부는 바뀌지 않는다 — 여기서 그대로 다시 내보낸다.
import { VENUE_LABEL, VAT_RATE, tierOf, type VenueType } from './edu'
import {
  PROGRAM_RATE, VENUE_FACTOR, TRAVEL_FEE, MIN_BILLABLE,
  INSTRUCTOR_FEE_PER_SESSION, TARGET_DIRECT_RATIO, MATERIAL_COST_PER_HEAD,
} from './rates'

export { INSTRUCTOR_FEE_PER_SESSION, TARGET_DIRECT_RATIO, MATERIAL_COST_PER_HEAD }

export type CustomQuoteInput = {
  /** 분해된 회차 수 */
  sessions: number
  /** 회차당 교육 시간 */
  hoursPerSession: number
  /** 초빙 강사가 맡는 회차 수. 사내 강사·총괄 좌장 회차는 직접비에 넣지 않는다(이중 수취) */
  outsourcedSessions: number
  headcount: number
  venueType: VenueType
  region?: string
  /** 강사료를 아는 발주면 그 값으로. 비우면 중앙값을 쓴다 */
  feePerSession?: number
  /** 가격 정책을 그 발주에서만 달리 볼 때. 비우면 기본값 */
  targetDirectRatio?: number
}

export type CustomQuoteLine = {
  label: string
  amount: number
  /** 이 줄의 금액이 «어디서» 나왔는가. ⛔근거 없는 줄을 만들지 않는다 */
  basis: string
}

export type CustomQuote = {
  ok: boolean
  reason?: string
  hours: number
  sessions: number
  headcount: number
  billable: number
  /** 인당·시간당 단가(원) — 카탈로그 과정의 rate 와 같은 자리의 값 */
  hourlyRate: number
  unitPrice: number
  discountRate: number
  discountAmount: number
  travelFee: number
  subtotal: number
  vat: number
  total: number
  perPerson: number
  /** 원가 쪽 분해 — 이 견적이 무엇을 덮는가 */
  costLines: CustomQuoteLine[]
  /** 청구 쪽 분해 */
  priceLines: CustomQuoteLine[]
  priceBasis: string
  /** 공급가 대비 직접비 — 목표치와 얼마나 떨어졌나 */
  directRatio: number
  minBilled: boolean
}

const won = (n: number) => Math.round(n)

/**
 * 맞춤 과정 견적. 원가에서 쌓아 올리고, 모든 줄에 근거를 붙인다.
 * ⛔「합계만」 돌려주지 않는다 — 담당자가 설명하지 못하는 숫자는 품의되지 않는다.
 */
export function customQuote(input: CustomQuoteInput): CustomQuote {
  const base: CustomQuote = {
    ok: false, hours: 0, sessions: input.sessions, headcount: input.headcount, billable: 0,
    hourlyRate: 0, unitPrice: 0, discountRate: 0, discountAmount: 0, travelFee: 0,
    subtotal: 0, vat: 0, total: 0, perPerson: 0, costLines: [], priceLines: [],
    priceBasis: '', directRatio: 0, minBilled: false,
  }
  const { sessions, hoursPerSession, outsourcedSessions, headcount } = input
  if (!(sessions >= 1) || !(hoursPerSession > 0)) {
    return { ...base, reason: '회차 수와 회차당 시간이 있어야 단가를 산정할 수 있습니다.' }
  }
  if (outsourcedSessions > sessions) {
    return { ...base, reason: `초빙 회차(${outsourcedSessions})가 전체 회차(${sessions})보다 많습니다.` }
  }
  if (!Number.isFinite(headcount) || headcount < 1) {
    return { ...base, reason: '교육 인원을 1명 이상 적어 주십시오.' }
  }

  const fee = input.feePerSession ?? INSTRUCTOR_FEE_PER_SESSION
  const ratio = input.targetDirectRatio ?? TARGET_DIRECT_RATIO
  const hours = sessions * hoursPerSession
  const billable = Math.max(headcount, MIN_BILLABLE)

  // ── 원가
  const instructorCost = won(outsourcedSessions * fee)
  const materialCost = won(MATERIAL_COST_PER_HEAD * headcount)
  const perTrip = input.venueType === 'onsite' ? (TRAVEL_FEE[input.region ?? '수도권'] ?? 0) : 0
  const travelFee = won(perTrip * sessions)

  // ── 청구 — 강사 직접비가 목표 비율이 되는 공급가를 역산하고, 장소 계수로 민다.
  //   ⛔이동비는 여기 들어가지 않는다(실비로 따로 더한다) — 비율의 분모를 흔들면 지역마다 단가가 달라진다.
  const targetGross = instructorCost / ratio
  const grossWithVenue = targetGross * VENUE_FACTOR[input.venueType]
  // 인당·시간당으로 환산해 천 원 단위로 끊는다 — 품의서에 소수점이 들어가면 반려된다.
  const hourlyRate = Math.max(1000, Math.round(grossWithVenue / billable / hours / 1000) * 1000)
  const unitPrice = won(hourlyRate * hours)
  const gross = unitPrice * billable
  const tier = tierOf(headcount)
  const discountAmount = won(gross * tier.rate)
  const subtotal = gross - discountAmount + travelFee
  const vat = won(subtotal * VAT_RATE)
  const total = subtotal + vat
  const minBilled = billable > headcount

  const costLines: CustomQuoteLine[] = [
    { label: '초빙 강사료', amount: instructorCost,
      basis: `회당 ${fee.toLocaleString()}원 × 초빙 ${outsourcedSessions}회차 (전체 ${sessions}회차 중)` },
    { label: '교보재·수료 운영비', amount: materialCost,
      basis: `인당 ${MATERIAL_COST_PER_HEAD.toLocaleString()}원 × ${headcount}명` },
    // ⛔「0원」의 사유를 한 문장으로 뭉뚱그리지 않는다 — 사내 출강이 아닌 것과 그 권역의
    //   이동비가 0원인 것은 다른 사실이고, 담당자가 그 둘을 구분해 설명해야 한다.
    { label: '강사 이동비', amount: travelFee,
      basis: input.venueType !== 'onsite'
        ? `${VENUE_LABEL[input.venueType]}이라 강사 이동비가 발생하지 않습니다`
        : perTrip > 0
          ? `${input.region ?? '수도권'} ${perTrip.toLocaleString()}원 × ${sessions}회차`
          : `${input.region ?? '수도권'}은 이동비를 받지 않습니다` },
  ]
  const priceLines: CustomQuoteLine[] = [
    { label: '인당 교육비', amount: unitPrice,
      basis: `${VENUE_LABEL[input.venueType]} 기준 인당·시간당 ${hourlyRate.toLocaleString()}원 × ${hours}시간 (${sessions}회차 × ${hoursPerSession}시간)` },
    { label: `교육비 ${billable}명분`, amount: gross,
      basis: minBilled
        ? `발주 ${headcount}명 · 강사료가 인원과 무관하게 고정이라 최소 청구 ${MIN_BILLABLE}명분을 청구합니다`
        : `인당 ${unitPrice.toLocaleString()}원 × ${billable}명` },
    { label: '인원 할인', amount: -discountAmount,
      basis: tier.rate > 0 ? `${headcount}명 구간 ${Math.round(tier.rate * 100)}%` : '할인 구간에 해당하지 않습니다' },
    { label: '강사 이동비', amount: travelFee, basis: costLines[2].basis },
    { label: '공급가액', amount: subtotal, basis: '교육비 − 할인 + 이동비' },
    { label: '부가세', amount: vat, basis: `공급가액의 ${Math.round(VAT_RATE * 100)}%` },
    { label: '합계', amount: total, basis: '공급가액 + 부가세' },
  ]

  const directRatio = gross > 0 ? instructorCost / gross : 0
  const priceBasis = [
    `${VENUE_LABEL[input.venueType]} · ${sessions}회차 × ${hoursPerSession}시간 = 총 ${hours}시간`,
    `인당·시간당 ${hourlyRate.toLocaleString()}원 × ${hours}시간 = 인당 ${unitPrice.toLocaleString()}원`,
    minBilled ? `× 최소 청구 ${billable}명 = ${gross.toLocaleString()}원 (발주 ${headcount}명)` : `× ${billable}명 = ${gross.toLocaleString()}원`,
    ...(tier.rate > 0 ? [`인원 할인 ${Math.round(tier.rate * 100)}% (−${discountAmount.toLocaleString()}원)`] : []),
    ...(travelFee > 0 ? [`강사 이동비 ${travelFee.toLocaleString()}원`] : []),
    `공급가액 ${subtotal.toLocaleString()}원 + 부가세 ${vat.toLocaleString()}원 = 합계 ${total.toLocaleString()}원`,
  ].join(' · ')

  return {
    ...base, ok: true, reason: undefined, hours, sessions, headcount, billable,
    hourlyRate, unitPrice, discountRate: tier.rate, discountAmount, travelFee,
    subtotal, vat, total, perPerson: won(total / headcount),
    costLines, priceLines, priceBasis, directRatio, minBilled,
  }
}

export type CatalogControlRow = {
  programSlug: string
  label: string
  /** 운영 중인 확정 단가(인당·시간당) */
  approvedRate: number
  /** 같은 구조를 이 식에 넣었을 때 나오는 단가 */
  derivedRate: number
  /** (파생 − 확정) / 확정 */
  gapPct: number
}

/**
 * ★대조군 — 식을 «아는 사례»에 되돌려 본다.
 *   운영 중인 세 과정의 회차·시간·초빙 수를 그대로 넣어 나온 단가를 확정 단가와 견준다.
 *   ⛔이 표를 숨기고 맞춤 단가만 보여 주지 않는다. 식이 아는 사례에서 ±몇 %인지 모르면
 *     모르는 사례의 숫자도 믿을 근거가 없다.
 */
export function catalogControl(venue: VenueType = 'onsite', headcount = MIN_BILLABLE): CatalogControlRow[] {
  return Object.entries(PROGRAM_RATE).map(([slug, meta]) => {
    const q = customQuote({
      sessions: meta.sessions,
      hoursPerSession: meta.hours / meta.sessions,
      outsourcedSessions: meta.outsourced,
      headcount, venueType: venue,
    })
    const approved = Math.round(meta.rate * VENUE_FACTOR[venue] / 1000) * 1000
    return {
      programSlug: slug, label: meta.label, approvedRate: approved,
      derivedRate: q.hourlyRate,
      gapPct: approved > 0 ? (q.hourlyRate - approved) / approved : 0,
    }
  })
}
