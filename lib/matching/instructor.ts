// 교육 발주 ↔ 강사 매칭 어댑터 — 5축 엔진의 «입력 두 쪽»을 만든다.
//
// ★산식은 신규 개발이 아니다 — K·S·A·C·L 5축 엔진을 그대로 쓴다.
//   여기서 새로 정하는 것은 두 프로파일의 입력 스키마와 가중치다.
// ★L축을 쓰지 않는다 — 엔진의 L축은 근무 시간대·재택·통근·초과근무로 짜여 있고 그것은
//   채용의 축이다. 강사에게 그 칸을 억지로 매핑하면 「근무시간대 불가」 같은 틀린 사유가
//   운영자 화면에 나온다. ⇒ 권역은 «하드 필터»로 처리하고 L 비중을 0 으로 둔다.
//   (비중 0인 축은 엔진이 설명에서 제외한다.)
// ⛔강사 DB 와 구직자 DB 를 조인하지 않는다. 공용하는 것은 산식뿐이다.
import {
  matchScore, profileCorrelation, type JobProfile, type CandidateProfile, type MatchResult, type AxisWeights,
} from '../engine'
import { cultureMeasurable, type Audience, type Expertise, type Method, type Region } from './vocab'

/** 강사풀 한 행 — `edu_instructors` 에서 매칭에 쓰는 칸만. */
export type InstructorRow = {
  id: string
  name: string
  expertise: string[] | null       // K
  methods: string[] | null         // S
  audience: string[] | null        // A
  years: number | null             // A
  value_profile: Record<string, number> | null  // C
  regions: string[] | null         // 하드 필터
  contactable: boolean
  deleted_at?: string | null
}

/** 교육 발주의 수요 — 견적 폼·발주 협의에서 받는다. */
export type DemandProfile = {
  /** 요구 주제(K). 과정 커리큘럼의 회차 주제에서 뽑는다 */
  topics: Expertise[] | string[]
  /** 요구 강의 방식(S) */
  methods: Method[] | string[]
  /** 대상 층(A) */
  audience: Audience[] | string[]
  /** 최소 강의 경력 연수(A). 미지정이면 경력 비중을 중립으로 둔다 */
  minYears?: number
  /** 발주사가 중시하는 교육 지향(C) 0~1. 3개 미만이면 C축은 측정하지 않는다 */
  values?: Record<string, number>
  /** 출강 권역. 지정하면 그 권역이 불가한 강사는 후보에서 제외된다 */
  region?: Region | string
  /** 축 가중치 조정(합은 엔진이 정규화한다) */
  weights?: Partial<AxisWeights>
}

/**
 * 강사 축 기본 가중치.
 * ⚠️**검증한 계수가 아니다** — 엔진 규율 1에 따라 조정 가능한 «실무 기본값»으로 둔다.
 *   근거로 삼은 것은 수치가 아니라 구조적 주장이다:
 *     · 강의의 급부는 주제 그 자체다 → K 를 가장 높게
 *     · 같은 주제라도 방식(S)과 대상 층 경험(A)이 만족도를 가른다 → 두 축을 동등하게
 *     · C 는 발주사가 가치축 3개 이상을 답했을 때만 산출된다 → 과한 비중을 주지 않는다
 *     · L 은 쓰지 않는다(위 머리말) → 0
 *   발주가 쌓이면 수료 만족도와 회귀해 재추정한다.
 */
export const INSTRUCTOR_WEIGHTS: AxisWeights = { K: 0.4, S: 0.25, A: 0.2, C: 0.15, L: 0 }

const AXIS_LABEL_EDU = {
  K: '강의 주제', S: '강의 방식', A: '강의 경력·대상', C: '교육 지향', L: '운영 조건',
} as const

/** 발주 수요 → 요구 프로파일. 권역은 mustHave 로 올려 하드 필터가 되게 한다. */
export function toDemandProfile(d: DemandProfile): JobProfile {
  return {
    mustHave: d.region ? [d.region] : [],
    niceToHave: [...d.audience],
    knowledge: [...d.topics],
    skills: [...d.methods],
    minYears: d.minYears,
    values: d.values ?? {},
    // ⛔L축을 쓰지 않으므로 형식상 채운다. 비중이 0이라 계산에도 설명에도 들어가지 않는다.
    work: { pattern: '9-6', remote: 'onsite' },
    weights: { ...INSTRUCTOR_WEIGHTS, ...(d.weights ?? {}) },
    axisLabels: AXIS_LABEL_EDU,
  }
}

/** 강사 행 → 후보 프로파일. 권역을 credentials 에 실어 mustHave 와 대조되게 한다. */
export function toInstructorProfile(r: InstructorRow): CandidateProfile {
  return {
    knowledge: r.expertise ?? [],
    skills: r.methods ?? [],
    years: r.years ?? undefined,
    credentials: r.regions ?? [],
    values: r.value_profile ?? {},
    work: { patterns: ['9-6'], remote: 'onsite' },
  }
}

export type InstructorMatch = {
  instructor: InstructorRow
  match: MatchResult
  /** C축을 실제로 쟀는가. false 면 「측정 불가」이고 0 이 아니다 */
  cultureMeasured: boolean
  /** 강의 경력을 적어 냈는가. false 면 최소 경력 요건을 적용하지 않았다 */
  yearsKnown: boolean
}

/**
 * 후보를 재서 순위를 매긴다.
 * ★연락 불가·삭제된 강사는 «후보가 아니다» — 점수를 매기지 않고 제외하되 그 수를 돌려준다.
 *   ⛔제외 수를 세지 않으면 「후보 0명」과 「재어 본 사람이 0명」을 구분할 수 없다.
 */
export function rankInstructors(
  demand: DemandProfile,
  rows: InstructorRow[],
): { ranked: InstructorMatch[]; examined: number; excluded: { reason: string; n: number }[] } {
  const measurable = cultureMeasurable(demand.values)

  // ★「경력 미제출」과 「경력 0년」은 다른 말이다 — 엔진은 years 를 0 으로 읽어 최소 경력
  //   요건에서 떨어뜨린다. 그러면 명부가 오기 전까지 전원이 부적격이 된다[2026-10-06 실측:
  //   22명 전원 탈락]. ⇒ 경력을 적어 낸 강사에게만 최소 경력을 건다.
  //   ⛔미제출을 통과시키는 것이 관대한 처리가 아니다 — 모르는 것을 «모른다»고 말하는 것이다.
  const jobStrict = toDemandProfile(demand)
  const jobLenient = toDemandProfile({ ...demand, minYears: undefined })

  const gone = rows.filter((r) => r.deleted_at)
  const unreachable = rows.filter((r) => !r.deleted_at && !r.contactable)
  const pool = rows.filter((r) => !r.deleted_at && r.contactable)

  const ranked = pool
    .map((r) => {
      const yearsKnown = r.years != null
      const m = matchScore(yearsKnown ? jobStrict : jobLenient, toInstructorProfile(r))
      // ★「쟀는가」를 «엔진이 쓰는 식»으로 판정한다. 양쪽이 각각 3축을 적었어도 «겹치는»
      //   축이 3개 미만이면 엔진은 상관을 못 내고 중립 0.5 를 쓴다 — 그때 라벨만 「측정함」으로
      //   남으면 화면도 원장도 거짓이 된다[2026-10-07 실측: 중립 50 과 구분되지 않았다].
      const cultureSaid = measurable && profileCorrelation(demand.values ?? {}, r.value_profile ?? {}) != null
      return {
        instructor: r,
        cultureMeasured: cultureSaid,
        yearsKnown,
        match: {
          ...m,
          axes: m.axes.map((a) => {
            if (a.axis === 'C' && !cultureSaid) {
              return {
                ...a,
                reasons: [cultureMeasurable(r.value_profile)
                  ? '발주사와 강사가 «함께 적은» 교육 지향이 3축 미만 — 측정 불가(0 이 아니다)'
                  : '강사의 교육 지향 입력이 3축 미만 — 측정 불가(0 이 아니다)'],
              }
            }
            if (a.axis === 'A' && !yearsKnown) {
              return { ...a, reasons: [...a.reasons, '⚠️ 강의 경력 미제출 — 최소 경력 요건을 적용하지 않았다(확인 필요)'] }
            }
            return a
          }),
        },
      }
    })
    .sort((a, b) =>
      a.match.eligible !== b.match.eligible ? (a.match.eligible ? -1 : 1)
      : b.match.percent - a.match.percent || a.instructor.name.localeCompare(b.instructor.name),
    )

  const excluded = [
    { reason: '연락 불가', n: unreachable.length },
    { reason: '삭제됨', n: gone.length },
  ].filter((e) => e.n > 0)

  return { ranked, examined: pool.length, excluded }
}

/** 매칭 산출 1행을 `edu_match_scores` 가 받는 모양으로 바꾼다. */
export function toScoreRow(m: InstructorMatch, rank: number) {
  return {
    instructor_id: m.instructor.id,
    percent: m.match.percent,
    rank,
    axes: m.match.axes,
    headline: m.match.headline,
    eligible: m.match.eligible,
    blockers: m.match.blockers,
    culture_measured: m.cultureMeasured,
  }
}
