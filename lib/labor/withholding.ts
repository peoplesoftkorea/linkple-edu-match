// 강사료 원천징수 — 사업소득과 기타소득 두 갈래.
//
// ★왜 여기인가 = 법정 수치는 이 패키지가 단일 정본이다. 교육·급여 어디서도 같은 값을 쓴다.
//   ⛔앱이나 화면에 세율을 적지 않는다. 적는 순간 개정이 났을 때 한쪽만 고쳐진다.
//
// ★업역 경계 — 이 모듈은 «계산»이다(면허 밖·자유). 원천세 «신고»는 세무대리의 영역이고,
//   우리는 계산과 지급명세 작성까지만 한다.
//
// 근거(조문)
//   · 사업소득 — 소득세법 §127①3호(원천징수 대상)·§129①3호 가목: **3%**
//     인적용역 사업소득(부가가치세 면세 대상 용역)에 적용한다.
//   · 기타소득 — 소득세법 §21①19호(인적용역 일시제공)·§129①6호: 소득금액의 **20%**
//     필요경비는 소득세법 시행령 §87 4호에 따라 **60%** 를 인정한다(2019년 이후분).
//     ⇒ 지급액 대비 실효 세율 = 20% × 40% = **8%**
//   · 지방소득세 — 지방세법 §103의13: 소득세액의 **10%**
//
// ⚠️여기 적힌 것은 «기본 원천징수»다. 강사 개인의 감면·비과세·연말정산은 다루지 않는다.
//   그 판단은 세무대리의 영역이고, 우리는 지급 시점의 기본 세액만 계산한다.

/** 적용 연도 — 세율이 개정되면 연도를 더해 분기한다(지금은 한 벌뿐이다). */
export const WITHHOLDING_YEAR = 2026

export type InstructorIncomeKind = 'business' | 'other'

export const INCOME_KIND_LABEL: Record<InstructorIncomeKind, string> = {
  business: '사업소득',
  other: '기타소득',
}

/** 사업소득 원천징수율 — 소득세법 §129①3호 가목. */
export const BUSINESS_INCOME_RATE = 0.03
/** 기타소득 원천징수율 — 소득세법 §129①6호(소득금액 기준). */
export const OTHER_INCOME_RATE = 0.2
/** 인적용역 일시제공의 필요경비율 — 소득세법 시행령 §87 4호. */
export const OTHER_INCOME_EXPENSE_RATE = 0.6
/** 지방소득세 — 소득세액의 10%(지방세법 §103의13). */
export const LOCAL_TAX_RATE = 0.1

/** 기타소득 과세최저한 — 건별 소득금액 5만원 이하는 과세하지 않는다(소득세법 §84 3호). */
export const OTHER_INCOME_MIN_TAXABLE = 50_000

export type WithholdingResult = {
  kind: InstructorIncomeKind
  /** 지급 총액(세전) */
  gross: number
  /** 과세 대상 소득금액 — 기타소득은 필요경비를 뺀 금액이다 */
  taxBase: number
  incomeTax: number
  localTax: number
  totalTax: number
  /** 실지급액 */
  net: number
  /** 계산 근거를 사람 말로 — 지급명세·품의에 그대로 붙인다 */
  basis: string
  /** 과세최저한에 걸려 세금이 없는 경우 그 사실 */
  belowMinimum: boolean
}

/** 원 단위 절사 — 원천세는 10원 미만을 버린다(국세징수 실무). */
const cut10 = (n: number) => Math.floor(n / 10) * 10

/**
 * 강사료 1건의 원천징수를 계산한다.
 * ⛔세금을 0으로 «조용히» 만들지 않는다 — 과세최저한에 걸렸으면 그 사실을 함께 돌려준다.
 */
export function instructorWithholding(gross: number, kind: InstructorIncomeKind): WithholdingResult {
  const g = Math.max(0, Math.round(gross))
  if (kind === 'business') {
    const incomeTax = cut10(g * BUSINESS_INCOME_RATE)
    const localTax = cut10(incomeTax * LOCAL_TAX_RATE)
    return {
      kind, gross: g, taxBase: g, incomeTax, localTax,
      totalTax: incomeTax + localTax, net: g - incomeTax - localTax,
      belowMinimum: false,
      basis: `사업소득 ${Math.round(BUSINESS_INCOME_RATE * 100)}% — 지급액 ${g.toLocaleString()}원 × 3% = 소득세 ${incomeTax.toLocaleString()}원`
        + ` · 지방소득세 ${localTax.toLocaleString()}원(소득세의 10%) · 실지급 ${(g - incomeTax - localTax).toLocaleString()}원`,
    }
  }

  const taxBase = Math.round(g * (1 - OTHER_INCOME_EXPENSE_RATE))
  const below = taxBase <= OTHER_INCOME_MIN_TAXABLE
  const incomeTax = below ? 0 : cut10(taxBase * OTHER_INCOME_RATE)
  const localTax = below ? 0 : cut10(incomeTax * LOCAL_TAX_RATE)
  return {
    kind, gross: g, taxBase, incomeTax, localTax,
    totalTax: incomeTax + localTax, net: g - incomeTax - localTax,
    belowMinimum: below,
    basis: below
      ? `기타소득 — 소득금액 ${taxBase.toLocaleString()}원(필요경비 60% 공제)이 과세최저한 ${OTHER_INCOME_MIN_TAXABLE.toLocaleString()}원 이하라 원천징수하지 않습니다`
      : `기타소득 — 지급액 ${g.toLocaleString()}원 × 40%(필요경비 60% 공제) = 소득금액 ${taxBase.toLocaleString()}원`
        + ` · × 20% = 소득세 ${incomeTax.toLocaleString()}원 · 지방소득세 ${localTax.toLocaleString()}원 · 실지급 ${(g - incomeTax - localTax).toLocaleString()}원`,
  }
}
