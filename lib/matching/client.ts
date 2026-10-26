// 교육 의뢰사(발주 기업) 프로파일 → 매칭 수요 변환.
//
// ★왜 이 파일이 필요한가 [대표님 지시 2026-10-10]
//   종전 매칭의 입력은 `DemandProfile` 하나였고, 그것은 **과정의 요구사항**이지
//   «누가 발주하는가»가 아니었다. 그래서 수요 3종을 손으로 적어 넣어야 돌았고,
//   C축(교육 지향)은 발주사 입력이 없어 **전부 「측정 불가」**였다[실측 2026-10-10 matchprobe:
//   전기차·방산 수요에서 22명 전원 C 측정 불가].
//   ⇒ 의뢰사의 «기반정보»(위치·규모·교육생 그룹·목표)에서 다섯 축의 요구를 **규칙으로 민다.**
//
// ★규칙은 전부 이 파일 안에 있고 사람이 눈으로 검증할 수 있다.
//   ⛔무작위·해시로 흩뿌리지 않는다 — 그러면 「왜 이 강사가 1위인가」를 설명할 수 없다.
// ⚠️**검증한 계수가 아니다.** 근거는 수치가 아니라 구조적 주장이고, 각 규칙 옆에 적었다.
//   발주가 쌓이면 수료 만족도와 회귀해 재추정한다(엔진 규율 1).

import type { Audience, Expertise, Method, Region, VenueType } from './vocab'
import type { DemandProfile } from './instructor'

// ══════════════════════════════════════════════════════════════════════════════
// 의뢰사 기반정보 — 발주 협의 첫 화면에서 받는 칸
// ══════════════════════════════════════════════════════════════════════════════

/** 교육생 그룹 — «누가 몇 명 앉는가». 한 의뢰사가 그룹을 여러 개 둘 수 있다. */
export type Cohort = {
  /** 직급 층(A축으로 간다) */
  level: Audience
  /** 인원. 방식(S축)을 가르는 값이다 — 숫자가 늘면 참여형이 물리적으로 불가능해진다 */
  size: number
  /** 주제 사전지식. 없으면 기초부터, 높으면 최신동향 쪽으로 기운다 */
  prior: 'none' | 'basic' | 'advanced'
}

export type ClientProfile = {
  /** 상호. ⛔실존 기업명을 쓰지 않는다 — 가상 의뢰사는 가칭으로 적는다 */
  name: string
  /** 업종. K축 보정에 쓴다 */
  industry: string
  /** 소재지 권역 — 출강이 불가한 강사를 후보에서 뺀다(하드 필터) */
  region: Region
  /** 임직원 수 — 규모. A축의 최소 경력을 민다 */
  headcount: number
  /** 교육생 그룹 */
  cohort: Cohort
  /** 교육 목표 — 발주 협의에서 받는 문장을 통제 어휘로 고른 것. C축이 된다 */
  goals: GoalKey[]
  /** 실시 형태 */
  venue: VenueType
}

/**
 * 교육 목표 — 발주 협의에서 실제로 갈리는 요구.
 * ★C축 값 사전(VALUE_AXES)과 1:1 로 맞추지 않는다 — 발주사는 「성과측정」이라고 말하지 않고
 *   「효과를 보고해야 한다」고 말한다. 그 말을 축으로 옮기는 표가 아래 GOAL_TO_VALUES 다.
 */
export const GOALS = ['현업적용', '타사사례', '참여몰입', '체계학습', '최신정보', '효과입증'] as const
export type GoalKey = (typeof GOALS)[number]

/**
 * 목표 → C축 가치 프로파일(0~1).
 * ★한 목표가 축 하나를 올리고 끝나지 않는다 — 실제 요구는 번진다.
 *   예) 「현업적용」은 실무적용을 올리면서 사례중심도 함께 올린다(사례 없이 적용은 공허하다).
 * ⛔합을 1 로 맞추지 않는다 — C축은 «상관»으로 재므로 절대값이 아니라 상대 비중이 의미를 갖는다.
 */
const GOAL_TO_VALUES: Record<GoalKey, Partial<Record<string, number>>> = {
  현업적용: { 실무적용: 1.0, 사례중심: 0.6, 이론체계: 0.2 },
  타사사례: { 사례중심: 1.0, 실무적용: 0.6, 최신동향: 0.4 },
  참여몰입: { 참여유도: 1.0, 사례중심: 0.5, 이론체계: 0.2 },
  체계학습: { 이론체계: 1.0, 실무적용: 0.4, 참여유도: 0.3 },
  최신정보: { 최신동향: 1.0, 사례중심: 0.5, 이론체계: 0.3 },
  효과입증: { 성과측정: 1.0, 실무적용: 0.7, 이론체계: 0.3 },
}

// ══════════════════════════════════════════════════════════════════════════════
// 규칙 1 — 규모와 직급이 «최소 강의 경력»을 민다 (A축)
// ══════════════════════════════════════════════════════════════════════════════
// ★구조적 주장: 조직이 클수록 교육 담당자가 강사 이력을 깐깐히 보고, 듣는 자리가 높을수록
//   「저 사람 말을 들을 이유」를 경력에서 찾는다. 임원 교육에 3년차 강사를 세우지 않는다.
// ⛔이 값은 «하한»이지 선호가 아니다 — 넘으면 그만이고 더 높다고 점수가 오르지 않는다.
const BASE_YEARS_BY_SIZE: [limit: number, years: number][] = [
  [1000, 12],  // 대기업
  [300, 10],   // 중견
  [50, 8],     // 중소
  [0, 6],      // 소기업·창업
]
const YEARS_BY_LEVEL: Record<Audience, number> = {
  최고경영자: 15, 임원: 12, 중간관리자: 8, 실무자: 5, 공공기관: 10, 창업예정자: 5,
}

export function minYearsFor(c: ClientProfile): number {
  const bySize = BASE_YEARS_BY_SIZE.find(([lim]) => c.headcount >= lim)?.[1] ?? 6
  // ★둘 중 «큰» 쪽을 쓴다 — 작은 회사의 임원 교육도 임원 교육이고, 큰 회사의 실무자
  //   교육에도 그 회사가 요구하는 하한이 있다. 평균을 내면 둘 다 흐려진다.
  return Math.max(bySize, YEARS_BY_LEVEL[c.cohort.level])
}

// ══════════════════════════════════════════════════════════════════════════════
// 규칙 2 — 인원이 «강의 방식»을 가른다 (S축)
// ══════════════════════════════════════════════════════════════════════════════
// ★구조적 주장: 방식은 취향이 아니라 «물리»다. 80명 앞에서 워크숍은 돌아가지 않고,
//   12명을 앉혀 놓고 강의만 하면 그 인원으로 모은 이유가 없어진다.
// ★사전지식이 높으면 토론·사례가 살고, 없으면 강의와 실습이 먼저다.
export function methodsFor(c: ClientProfile): Method[] {
  const { size, prior } = c.cohort
  const base: Method[] =
    size <= 20 ? ['워크숍', '토론', '코칭', '실습']
    : size <= 50 ? ['강의', '사례연구', '토론']
    : ['강의', '사례연구']
  // 최고경영자·임원 과정은 인원이 적어도 네트워킹이 급부의 일부다
  if (c.cohort.level === '최고경영자' || c.cohort.level === '임원') base.push('네트워킹세션')
  if (prior === 'none' && !base.includes('강의')) base.push('강의')
  if (prior === 'advanced' && size <= 50 && !base.includes('사례연구')) base.push('사례연구')
  return [...new Set(base)]
}

// ══════════════════════════════════════════════════════════════════════════════
// 규칙 3 — 목표가 «교육 지향»이 된다 (C축)
// ══════════════════════════════════════════════════════════════════════════════
// ★사전지식은 목표를 꺾는다 — 기초가 없는 그룹에 「최신동향」을 1.0 으로 주면
//   따라오지 못하는 강의가 1위로 올라온다.
export function valuesFor(c: ClientProfile): Record<string, number> {
  const acc: Record<string, number> = {}
  for (const g of c.goals) {
    for (const [axis, v] of Object.entries(GOAL_TO_VALUES[g])) {
      acc[axis] = Math.max(acc[axis] ?? 0, v as number)
    }
  }
  if (c.cohort.prior === 'none') {
    acc.이론체계 = Math.max(acc.이론체계 ?? 0, 0.7)   // 기초가 없으면 틀부터
    if (acc.최신동향) acc.최신동향 = Math.min(acc.최신동향, 0.4)
  }
  if (c.cohort.prior === 'advanced' && acc.이론체계) acc.이론체계 = Math.min(acc.이론체계, 0.4)
  return acc
}

// ══════════════════════════════════════════════════════════════════════════════
// 규칙 4 — 업종이 «주제»를 보탠다 (K축)
// ══════════════════════════════════════════════════════════════════════════════
// ★과정이 요구하는 주제가 먼저고, 업종은 «보탠다». 바꾸지 않는다 —
//   업종으로 과정 주제를 덮으면 발주한 과정과 다른 강사가 올라온다.
// ⛔사전(EXPERTISE)에 있는 값만 쓴다. 없는 업종은 보태지 않는다(틀린 매칭보다 낫다).
const INDUSTRY_TOPICS: Record<string, Expertise[]> = {
  이차전지: ['배터리', '전기차', '배터리안전'],
  자동차부품: ['자동차산업', '전기차', '소재'],
  방위산업: ['방산', '국방안보', '정부조달'],
  유통소매: ['마케팅전략', '고객인사이트', 'SNS마케팅'],
  식음료프랜차이즈: ['마케팅전략', '고객인사이트', '브랜드전략'],
  정보통신: ['클라우드', 'AXDX', '생성형AI'],
  공공기관: ['정부조달', 'B2G'],
}

// 🔴[자가적발 2026-10-10 · 대조 실측] 초판은 업종 주제를 요구에 **보탰다**. 그러자 K축이 희석됐다 —
//   같은 의뢰사·같은 강사풀에서 **1위 56% → 45%**, K축 **67 → 40**.
//   요구 주제가 3개에서 5개로 늘면 같은 강사가 충족하는 «비율»이 떨어지기 때문이다.
//   ⇒ 업종은 「있으면 좋은 것」이지 「요구」가 아니다. **K축 요구를 늘리지 않는다.**
//     업종 적합은 아래 `industryFit` 으로 따로 재서 동점을 가르고 설명에 쓴다.
/** 업종 목록 — 화면의 select 가 이 값만 쓴다. ⛔여기 없는 업종은 고를 수 없다(틀린 매칭보다 낫다). */
export const INDUSTRIES = Object.keys(INDUSTRY_TOPICS) as readonly string[]

export function topicsFor(_c: ClientProfile, programTopics: (Expertise | string)[]): string[] {
  return [...new Set(programTopics)]
}

/**
 * 업종 적합(0~1) — 강사가 그 업종의 주제를 몇 개나 가졌는가.
 * ★매칭율에 «더하지» 않는다. 같은 점수가 둘일 때 업종을 아는 쪽을 앞에 세우고,
 *   배정 근거서에 「이 강사는 의뢰사 업종의 주제를 n개 갖고 있다」를 적는 데 쓴다.
 * ⛔사전에 업종이 없으면 0 이 아니라 **잴 수 없음**이다 — 호출부가 null 을 구분해 다룬다.
 */
export function industryFit(c: ClientProfile, expertise: string[] | null): number | null {
  const want = INDUSTRY_TOPICS[c.industry]
  if (!want?.length) return null
  const have = new Set(expertise ?? [])
  return want.filter((t) => have.has(t)).length / want.length
}

/**
 * 같은 매칭율이 둘일 때 업종을 아는 쪽을 앞에 세운다. 그래도 같으면 «등록이 이른 쪽»이다.
 * 🔴[자가적발 2026-10-10] 초판은 「동점을 가른다」고 **주석에만 적고** 정렬에 쓰지 않았다.
 *   그 결과 업종 적합 0% 가 33% 보다 앞에 섰다(가칭 소담상회 52% 동점).
 *   ⛔원자를 만든 것과 «쓰이게» 한 것은 다른 일이다 — 적었으면 호출부가 쓰는지까지 본다.
 * ★매칭율을 바꾸지 «않는다» — 순서만 바꾼다. 점수에 더하면 설명할 수 없는 수가 된다.
 */
export function byIndustryThenRegistered<T extends { percent: number; expertise: string[] | null; id: string; created_at?: string | null }>(
  c: ClientProfile,
) {
  return (a: T, b: T): number => {
    if (a.percent !== b.percent) return b.percent - a.percent
    const fa = industryFit(c, a.expertise) ?? -1
    const fb = industryFit(c, b.expertise) ?? -1
    // 🔴[반사실 테스트 2026-10-11] 마지막 갈림을 «이름»으로 두면 성(姓)이 순위를 가른다.
    //   직무와 무관하고 보호속성과 상관이 있다 ⇒ 등록이 이른 쪽, 그다음 id(결정론적).
    return fb - fa
      || (a.created_at ?? '').localeCompare(b.created_at ?? '')
      || a.id.localeCompare(b.id)
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 변환 — 의뢰사 + 과정 주제 → 매칭 수요
// ══════════════════════════════════════════════════════════════════════════════

/**
 * 의뢰사 기반정보를 매칭이 읽는 수요로 바꾼다.
 * ★`programTopics` 는 발주한 과정의 «그 회차» 주제다 — 과정 전체가 아니라 회차 단위로 재야
 *   한 과정에 여러 강사를 세울 수 있다.
 */
export function toDemand(c: ClientProfile, programTopics: (Expertise | string)[]): DemandProfile {
  return {
    topics: topicsFor(c, programTopics),
    methods: methodsFor(c),
    audience: [c.cohort.level],
    minYears: minYearsFor(c),
    values: valuesFor(c),
    // ★온라인 회차는 출강 권역을 걸지 않는다 — 걸면 멀쩡한 강사가 후보에서 빠진다.
    region: c.venue === 'online' ? undefined : c.region,
  }
}

/** 화면·원장에 「왜 이런 요구가 됐는가」를 적기 위한 설명. ⛔사람이 읽을 문장으로 낸다. */
export function explainDemand(c: ClientProfile): string[] {
  const m = methodsFor(c)
  return [
    `소재지 ${c.region} · ${c.venue === 'online' ? '온라인이라 출강 권역을 걸지 않았다' : `${c.region} 출강이 불가한 강사는 후보에서 제외된다`}`,
    `임직원 ${c.headcount.toLocaleString()}명 · 교육생 ${c.cohort.level} ${c.cohort.size}명 ⇒ 최소 강의 경력 ${minYearsFor(c)}년`,
    `${c.cohort.size}명 규모 ⇒ ${m.join('·')} (인원이 늘면 참여형은 물리적으로 어렵다)`,
    `사전지식 ${{ none: '없음', basic: '기초', advanced: '상급' }[c.cohort.prior]} · 목표 ${c.goals.join('·')} ⇒ 교육 지향 ${Object.entries(valuesFor(c)).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(' / ')}`,
  ]
}
