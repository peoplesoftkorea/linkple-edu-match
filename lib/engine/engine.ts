// 잡매칭 엔진 — KSA × 컬처핏 × 라이프사이클 3격자 적합도.
// 정본 설계: [[AI-잡매칭-엔진-KSA적합도-설계]]
//
// ── 이 파일의 규율 ────────────────────────────────────────────────────────────
// ★1. **검증한 수치만 박는다.** 메타분석의 구체적 상관계수(ρ)는 초록에 없어 실측하지 못했다.
//     따라서 가중치는 하드코딩된 «과학적 상수»가 아니라 **조정 가능한 기본값**이며, 주석에
//     근거 논문과 DOI를 달되 **검증하지 못한 수치는 적지 않는다.**
// ★2. **설명 없는 점수를 반환하지 않는다.** 모든 산출은 축별 기여도와 사유를 함께 낸다.
//     1000명을 정렬한다는 것은 998명을 떨어뜨린다는 뜻이고, 그 이유를 말하지 못하면
//     그 정렬은 쓰면 안 된다(약관·채용절차법·분쟁 대응 전부 여기 걸린다).
// ★3. **보호속성과 그 대리변수는 입력에 없다.** 성별·연령·출신지·학교명·사진은 이 엔진에
//     들어오지 않는다. 「몰라서 공정」(fairness through unawareness)이 불충분하다는 것은
//     문헌이 지적한 바이므로, 배제에 더해 반사실 테스트(§fairness)로 누출을 실측한다.
// ★4. LLM을 쓰지 않는다. 콜드스타트에 학습 데이터가 없고(성사 0건), 규칙 기반이 설명가능성이
//     가장 높으며 비용이 0이다. LLM은 자소서→가치축 추출(별건)에만 쓴다.
//
// ── 학술 근거(인용수 = OpenAlex 실측 2026-08-23) ──────────────────────────────
//  · Barrick & Mount 1991, Personnel Psychology, 8,749 — doi:10.1111/j.1744-6570.1991.tb00688.x
//      성격 5요인과 직무성과. ⛔우리는 성격검사를 하지 않는다. 「성격을 추론하지 않는다」의 근거로만 참조.
//  · Kristof-Brown, Zimmerman & Johnson 2005, Personnel Psychology, 5,263 — doi:10.1111/j.1744-6570.2005.00672.x
//      P-J / P-O / P-G / P-S 적합의 메타분석(172연구·836효과크기). **적합을 유형별로 나눠 재는 것**의 정본.
//  · Kristof 1996, Personnel Psychology, 4,814 — doi:10.1111/j.1744-6570.1996.tb01790.x
//  · O'Reilly, Chatman & Caldwell 1991, AMJ, 4,248 — doi:10.2307/256404
//      OCP(Organizational Culture Profile) — **프로파일 상관으로 컬처핏을 재는 방식**. C축 산식의 원형.
//  · Schmidt & Hunter 1998, Psychological Bulletin, 4,056 — doi:10.1037/0033-2909.124.2.262
//      선발도구별 예측타당도. 「무엇을 얼마나 믿을 것인가」의 근거 계보.
//  · Gajendran & Harrison 2007, JAP, 2,573 — doi:10.1037/0021-9010.92.6.1524
//      ★**실측 인용**: 「high-intensity telecommuting (more than 2.5 days a week) accentuated
//      telecommuting's beneficial effects on work-family conflict but harmed relationships with coworkers」
//      → 재택은 **많을수록 좋은 단조 함수가 아니다.** L축이 이 비단조성을 반영한다.
//  · Cable & Judge 1996, OBHDP, 1,692 — doi:10.1006/obhd.1996.0081
//  · Verquer, Beehr & Wagner 2003, JVB, 1,088 — doi:10.1016/s0001-8791(02)00036-2
//  · Allen, Johnson, Kiburz & Shockley 2013, Personnel Psychology, 1,009 — doi:10.1111/peps.12012
//  · McDaniel et al. 1994, JAP, 695 — doi:10.1037/0021-9010.79.4.599
//  (최신 보완) Sackett et al. 2021, JAP, 333 — doi:10.1037/apl0000994 — 기존 타당도 추정의 과대교정 지적.

// ══════════════════════════════════════════════════════════════════════════════
// 1. 프로파일 스키마
// ══════════════════════════════════════════════════════════════════════════════

/** 근무 시간대 — 구조화 선택지. 자유서술은 매칭에 쓰지 않는다(비교 불가). */
export type WorkPattern = '8-5' | '9-6' | '10-7' | 'shift' | 'flexible' | 'night'
/** 재택 정책·선호 */
export type RemoteMode = 'onsite' | 'hybrid' | 'remote'

/** 요구 프로파일 — 구인기업이 공고에 입력한다. */
export type JobProfile = {
  /** 필수 요건(하나라도 미충족이면 하드 필터). 예: 자격증·최소경력 */
  mustHave: string[]
  /** 우대 요건(점수에 반영) */
  niceToHave: string[]
  /** 직무 지식 키워드(K축) */
  knowledge: string[]
  /** 기술·도구(S축) */
  skills: string[]
  /** 최소 경력 연수 */
  minYears?: number
  /** 인재상 — 가치 축별 중요도 0~1. 키는 회사가 정의(예: 협업·주도성·정확성·고객지향) */
  values: Record<string, number>
  /** 근무 조건(L축) */
  work: {
    pattern: WorkPattern
    remote: RemoteMode
    /** 주당 재택 일수(hybrid일 때). 0~5 */
    remoteDaysPerWeek?: number
    /** 사업장 소재 행정동 코드(통근 계산용 — 정확 주소 아님) */
    regionCode?: string
    /** 초과근무 빈도 0(없음)~3(잦음) */
    overtime?: 0 | 1 | 2 | 3
  }
  /** 축 가중치(합 1). 미지정 시 DEFAULT_WEIGHTS */
  weights?: Partial<AxisWeights>
  /**
   * 축 표시명 덮어쓰기. ★같은 산식이라도 «무엇을 재는지»는 도메인마다 다른 말이다 —
   * 교육 발주에서 K 는 「직무지식」이 아니라 「강의 주제」다. 라벨을 밖에서 못 주면
   * headline 에 틀린 말이 남는다(headline 은 엔진이 만들기 때문이다).
   */
  axisLabels?: Partial<Record<keyof AxisWeights, string>>
}

/** 후보 프로파일 — 이력서 + 자기소개서에서 조립한다. */
export type CandidateProfile = {
  knowledge: string[]
  skills: string[]
  years?: number
  /** 보유 자격/요건(문자열 정합으로 mustHave 대조) */
  credentials: string[]
  /** 자기소개서에서 추출한 직업가치 강도 0~1. **성격이 아니라 진술된 가치와 그 근거 경험** */
  values: Record<string, number>
  work: {
    /** 가능한 근무 시간대(복수) */
    patterns: WorkPattern[]
    remote: RemoteMode
    /** 희망 주당 재택 일수 */
    remoteDaysPerWeek?: number
    regionCode?: string
    /** 통근 수용 한계(분) */
    commuteToleranceMin?: number
    /** 초과근무 수용 0~3 */
    overtimeTolerance?: 0 | 1 | 2 | 3
  }
}

export type AxisWeights = { K: number; S: number; A: number; C: number; L: number }

/**
 * 기본 가중치.
 * ⚠️**이 값들은 메타분석에서 직접 인용한 계수가 아니다.** 구체적 ρ는 초록에서 확인되지 않았고,
 *   검증하지 못한 수치를 상수로 박지 않는다는 규율에 따라 **실무 기본값**으로 둔다.
 *   근거로 삼은 것은 계수가 아니라 **구조적 주장**이다:
 *     · 적합은 유형별로 나눠 재야 한다(Kristof-Brown 2005) → 축 분리 자체
 *     · 직무 관련 요건이 예측의 중심이다(Schmidt & Hunter 1998) → K·S 합계가 과반
 *     · 문화·근무형태가 잔류를 좌우한다(O'Reilly 1991 / Gajendran 2007) → C·L에 실질 비중
 *   구인기업이 공고별로 조정할 수 있고, 성사 데이터가 쌓이면 회귀로 재추정한다(M5).
 */
export const DEFAULT_WEIGHTS: AxisWeights = { K: 0.25, S: 0.3, A: 0.15, C: 0.15, L: 0.15 }

// ══════════════════════════════════════════════════════════════════════════════
// 2. 텍스트 정합 — 한국어 경량 처리(기존 lib/linky/scorer.ts 계보)
// ══════════════════════════════════════════════════════════════════════════════

const STRIP_RE = /[^\p{L}\p{N}\s]/gu
const JOSA_RE = /(은|는|이|가|을|를|에|의|도|만|으로|로|에서|와|과|및)$/

function norm(s: string): string {
  return s.toLowerCase().replace(STRIP_RE, ' ').replace(/\s+/g, ' ').trim()
}
function stem(t: string): string {
  return t.length > 2 ? t.replace(JOSA_RE, '') : t
}
function bigrams(s: string): Set<string> {
  const t = norm(s).replace(/\s/g, '')
  const out = new Set<string>()
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2))
  return out
}
/** 문자 bigram Dice — 조사·표기 변형에 강하다("엑셀"≈"excel"은 못 잡으므로 별칭은 상위에서 처리) */
function dice(a: string, b: string): number {
  const A = bigrams(a), B = bigrams(b)
  if (!A.size || !B.size) return 0
  let hit = 0
  for (const g of A) if (B.has(g)) hit++
  return (2 * hit) / (A.size + B.size)
}
/** 한 요구 항목이 후보의 항목 집합에 얼마나 있는가(0~1) */
function bestMatch(req: string, pool: string[]): number {
  const r = stem(norm(req))
  let best = 0
  for (const p of pool) {
    const s = stem(norm(p))
    if (!s) continue
    if (s === r || s.includes(r) || r.includes(s)) return 1
    best = Math.max(best, dice(r, s))
  }
  return best
}

/** 요건 커버리지 — 부분 일치를 인정하되 임계 미만은 0으로 끊는다(허위 가점 방지) */
function coverage(required: string[], pool: string[], threshold = 0.55): { score: number; hit: string[]; miss: string[] } {
  if (!required.length) return { score: 1, hit: [], miss: [] }
  const hit: string[] = [], miss: string[] = []
  let sum = 0
  for (const r of required) {
    const m = bestMatch(r, pool)
    if (m >= threshold) { hit.push(r); sum += m } else { miss.push(r) }
  }
  return { score: sum / required.length, hit, miss }
}

// ══════════════════════════════════════════════════════════════════════════════
// 3. C축 — 컬처핏: 프로파일 상관 (O'Reilly, Chatman & Caldwell 1991의 방식)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * OCP의 핵심은 «항목별 점수의 합»이 아니라 **두 프로파일의 형태가 얼마나 닮았는가**다.
 * 회사가 «협업 0.9 / 주도성 0.3»이고 후보가 «협업 0.85 / 주도성 0.25»이면,
 * 절대값이 아니라 **상대적 우선순위 배열이 일치**하므로 높은 적합이다.
 * ⇒ 피어슨 상관을 쓴다. -1~1을 0~1로 사상한다.
 *
 * ★왜 코사인이 아니라 상관인가: 코사인은 «둘 다 모든 가치를 중시»하면 무조건 높게 나온다.
 *   상관은 평균을 빼므로 **무엇을 상대적으로 더 중시하는가**를 본다 — 그게 문화다.
 */
export function profileCorrelation(a: Record<string, number>, b: Record<string, number>): number | null {
  const keys = Object.keys(a).filter((k) => k in b)
  if (keys.length < 3) return null // 3축 미만은 상관이 의미를 갖지 못한다 → «측정 불가»를 null로 정직하게 반환
  const xs = keys.map((k) => a[k]), ys = keys.map((k) => b[k])
  const mx = xs.reduce((s, v) => s + v, 0) / xs.length
  const my = ys.reduce((s, v) => s + v, 0) / ys.length
  let num = 0, dx = 0, dy = 0
  for (let i = 0; i < xs.length; i++) {
    const a1 = xs[i] - mx, b1 = ys[i] - my
    num += a1 * b1; dx += a1 * a1; dy += b1 * b1
  }
  if (dx === 0 || dy === 0) return null // 한쪽이 전부 같은 값 = 변별 없음
  const r = num / Math.sqrt(dx * dy)
  return (r + 1) / 2
}

// ══════════════════════════════════════════════════════════════════════════════
// 4. L축 — 라이프사이클 적합
// ══════════════════════════════════════════════════════════════════════════════

/** 시간대 호환표 — flexible은 대부분을 수용하고, night/shift는 따로 논다. */
const PATTERN_COMPAT: Record<WorkPattern, WorkPattern[]> = {
  '8-5': ['8-5', 'flexible'],
  '9-6': ['9-6', 'flexible'],
  '10-7': ['10-7', 'flexible'],
  shift: ['shift'],
  night: ['night'],
  flexible: ['8-5', '9-6', '10-7', 'flexible'],
}

/**
 * 재택 적합 — ★단조 함수가 아니다.
 * Gajendran & Harrison 2007(JAP·2,573회 인용) 실측: 주 2.5일을 넘는 고강도 재택은
 * 일-가정 갈등에는 이롭지만 **동료 관계를 해친다**. 즉 «많을수록 좋다»가 아니다.
 * ⇒ 회사 정책과 후보 희망의 **차이**를 벌점으로 삼되, 고강도 구간에서는 정책이 명시적으로
 *   허용한 경우에만 만점을 준다. 후보가 원한다고 점수를 올리지 않는다 — 조직 비용이 실재한다.
 */
function remoteFit(job: JobProfile['work'], cand: CandidateProfile['work']): { s: number; why: string } {
  if (job.remote === cand.remote) {
    if (job.remote !== 'hybrid') return { s: 1, why: `근무형태 일치(${job.remote})` }
    const jd = job.remoteDaysPerWeek ?? 2, cd = cand.remoteDaysPerWeek ?? 2
    const gap = Math.abs(jd - cd)
    const s = Math.max(0, 1 - gap / 5)
    return { s, why: gap === 0 ? `재택 일수 일치(주 ${jd}일)` : `재택 희망 차이 ${gap}일(회사 ${jd} / 희망 ${cd})` }
  }
  // 정책이 더 유연한 경우(회사 remote/hybrid ↔ 후보 onsite 희망)는 대체로 수용 가능
  if (job.remote === 'remote' && cand.remote === 'hybrid') return { s: 0.8, why: '회사 원격 · 후보 하이브리드 희망' }
  if (job.remote === 'hybrid' && cand.remote === 'onsite') return { s: 0.85, why: '회사 하이브리드 · 후보 출근 선호' }
  if (job.remote === 'hybrid' && cand.remote === 'remote') return { s: 0.5, why: '회사 하이브리드 · 후보 전면 원격 희망' }
  if (job.remote === 'onsite' && cand.remote === 'remote') return { s: 0.1, why: '🔴 회사 전면 출근 · 후보 전면 원격 희망' }
  if (job.remote === 'onsite' && cand.remote === 'hybrid') return { s: 0.45, why: '회사 전면 출근 · 후보 하이브리드 희망' }
  return { s: 0.5, why: '근무형태 부분 불일치' }
}

/**
 * 통근 — 거리가 아니라 **시간**이 이직의도를 올린다(Commuting and wellbeing, Transport Reviews 2019).
 * 지금은 행정동 코드 일치/광역 일치만 본다. 실제 소요시간 추정은 외부 API 붙일 때 승급(별건).
 */
function commuteFit(job: JobProfile['work'], cand: CandidateProfile['work']): { s: number; why: string } {
  if (!job.regionCode || !cand.regionCode) return { s: 0.6, why: '통근 정보 부족(중립 처리)' }
  if (job.regionCode === cand.regionCode) return { s: 1, why: '동일 생활권' }
  const sameWide = job.regionCode.slice(0, 2) === cand.regionCode.slice(0, 2)
  return sameWide ? { s: 0.75, why: '동일 광역권' } : { s: 0.35, why: '광역권 다름 — 통근 부담 확인 필요' }
}

export function lifecycleFit(job: JobProfile, cand: CandidateProfile): { score: number; reasons: string[] } {
  const reasons: string[] = []
  // 시간대
  const ok = PATTERN_COMPAT[job.work.pattern] ?? [job.work.pattern]
  const patternHit = cand.work.patterns.some((p) => ok.includes(p))
  const sPattern = patternHit ? 1 : 0
  reasons.push(patternHit ? `근무시간대 가능(${job.work.pattern})` : `🔴 근무시간대 불가(${job.work.pattern})`)
  // 재택
  const r = remoteFit(job.work, cand.work); reasons.push(r.why)
  // 통근
  const c = commuteFit(job.work, cand.work); reasons.push(c.why)
  // 초과근무
  const jOt = job.work.overtime ?? 0, cOt = cand.work.overtimeTolerance ?? 1
  const sOt = cOt >= jOt ? 1 : Math.max(0, 1 - (jOt - cOt) * 0.35)
  if (jOt > cOt) reasons.push(`초과근무 수용 범위 초과(요구 ${jOt} / 수용 ${cOt})`)

  // 시간대는 가부(可否)에 가까우므로 비중을 높인다 — 안 되면 나머지가 좋아도 못 다닌다.
  const score = 0.4 * sPattern + 0.25 * r.s + 0.2 * c.s + 0.15 * sOt
  return { score, reasons }
}

// ══════════════════════════════════════════════════════════════════════════════
// 5. 합성 — 매칭율과 그 설명
// ══════════════════════════════════════════════════════════════════════════════

export type AxisScore = { axis: keyof AxisWeights; label: string; score: number; weight: number; reasons: string[] }
export type MatchResult = {
  /** 0~100. 필수요건 미충족이면 eligible=false 이며 점수는 참고용이다. */
  percent: number
  eligible: boolean
  blockers: string[]
  axes: AxisScore[]
  /** 카드 한 줄 요약 — 가장 높은 축과 가장 낮은 축 */
  headline: string
}

const AXIS_LABEL: Record<keyof AxisWeights, string> = {
  K: '직무지식', S: '기술·도구', A: '태도·동기', C: '컬처핏', L: '근무조건',
}

export function matchScore(job: JobProfile, cand: CandidateProfile): MatchResult {
  const w: AxisWeights = { ...DEFAULT_WEIGHTS, ...(job.weights ?? {}) }
  const wsum = w.K + w.S + w.A + w.C + w.L
  const W: AxisWeights = { K: w.K / wsum, S: w.S / wsum, A: w.A / wsum, C: w.C / wsum, L: w.L / wsum }

  // 하드 필터 — 필수요건. ★점수로 덮지 않는다. 자격 미달을 총점으로 상쇄하면 그건 매칭이 아니다.
  const must = coverage(job.mustHave, [...cand.credentials, ...cand.knowledge, ...cand.skills], 0.7)
  const blockers = must.miss.map((m) => `필수요건 미충족: ${m}`)
  if (job.minYears != null && (cand.years ?? 0) < job.minYears) {
    blockers.push(`최소 경력 ${job.minYears}년 미만(${cand.years ?? 0}년)`)
  }

  // K
  const k = coverage(job.knowledge, [...cand.knowledge, ...cand.skills])
  const kReasons = [k.hit.length ? `보유: ${k.hit.slice(0, 4).join('·')}` : '일치 항목 없음']
  if (k.miss.length) kReasons.push(`부족: ${k.miss.slice(0, 4).join('·')}`)

  // S
  const s = coverage(job.skills, [...cand.skills, ...cand.knowledge])
  const sReasons = [s.hit.length ? `보유: ${s.hit.slice(0, 4).join('·')}` : '일치 항목 없음']
  if (s.miss.length) sReasons.push(`부족: ${s.miss.slice(0, 4).join('·')}`)

  // A — 우대요건 충족 + 경력 충분도. ⛔성격 추론 없음.
  const nice = coverage(job.niceToHave, [...cand.credentials, ...cand.knowledge, ...cand.skills])
  const yearRatio = job.minYears ? Math.min(1, (cand.years ?? 0) / Math.max(1, job.minYears)) : 0.7
  const aScore = 0.6 * nice.score + 0.4 * yearRatio
  const aReasons = [nice.hit.length ? `우대요건 ${nice.hit.length}/${job.niceToHave.length}` : '우대요건 해당 없음']

  // C — 프로파일 상관. 측정 불가면 중립(0.5)으로 두고 그 사실을 말한다.
  const corr = profileCorrelation(job.values, cand.values)
  const cScore = corr ?? 0.5
  const cReasons = corr == null
    ? ['⚠️ 가치 축 부족으로 컬처핏 측정 불가(자기소개서 기반 3축 이상 필요) — 중립 처리']
    : [`인재상 프로파일 상관 ${(corr * 2 - 1).toFixed(2)} (형태 유사도)`]

  // L
  const l = lifecycleFit(job, cand)

  // ★비중 0인 축은 설명에서 뺀다 — 쓰지 않는 축의 사유 문장이 화면에 남으면 «틀린 말»이 된다.
  //   교육 발주 매칭은 L축(근무 시간대·재택·통근)을 쓰지 않는데, 그대로 두면 headline 이
  //   「근무조건 0 확인 필요」로 나온다[2026-10-06 실측]. percent 는 0 기여라 바뀌지 않는다.
  const LBL = { ...AXIS_LABEL, ...(job.axisLabels ?? {}) }
  const axes: AxisScore[] = ([
    { axis: 'K', label: LBL.K, score: k.score, weight: W.K, reasons: kReasons },
    { axis: 'S', label: LBL.S, score: s.score, weight: W.S, reasons: sReasons },
    { axis: 'A', label: LBL.A, score: aScore, weight: W.A, reasons: aReasons },
    { axis: 'C', label: LBL.C, score: cScore, weight: W.C, reasons: cReasons },
    { axis: 'L', label: LBL.L, score: l.score, weight: W.L, reasons: l.reasons },
  ] as AxisScore[]).filter((a) => a.weight > 0)

  const percent = Math.round(axes.reduce((acc, a) => acc + a.score * a.weight, 0) * 100)
  const sorted = [...axes].sort((a, b) => b.score - a.score)
  const top = sorted[0], low = sorted[sorted.length - 1]
  const headline = `${top.label} ${Math.round(top.score * 100)} 강점 · ${low.label} ${Math.round(low.score * 100)} 확인 필요`

  return { percent, eligible: blockers.length === 0, blockers, axes, headline }
}

/**
 * 랭킹 — 동점 처리는 **설명 가능한 규칙**이어야 한다.
 * 지원 시각 오름차순(먼저 지원한 사람 우선)은 누구에게나 설명되고 보호속성과 무관하다.
 * ⛔무작위 tie-break 금지 — 같은 사람이 새로고침마다 순위가 바뀌면 설명할 수 없다.
 */
export function rankCandidates<T extends { id: string; appliedAt?: string | null }>(
  job: JobProfile,
  items: Array<T & { profile: CandidateProfile }>,
): Array<T & { match: MatchResult }> {
  return items
    .map((it) => ({ ...it, match: matchScore(job, it.profile) }))
    .sort((a, b) => {
      if (a.match.eligible !== b.match.eligible) return a.match.eligible ? -1 : 1
      if (b.match.percent !== a.match.percent) return b.match.percent - a.match.percent
      return (a.appliedAt ?? '').localeCompare(b.appliedAt ?? '')
    })
}
