// 강사 매칭 통제 어휘 — 5축 입력의 «값 사전». 이 파일이 정본이다.
//
// ★왜 통제 어휘인가: 자유 텍스트로 적으면 매칭이 붙지 않는다. 「SNS마케팅」과
//   「SNS 마케팅」과 「sns마케팅」은 사람에게 같은 말이지만 K축에는 세 값이다.
// ★왜 코드인가 [2026-10-06]: 사전이 seed_instructors_sample.sql 의 «주석»에만 있었다.
//   주석은 코드가 읽지 못하고, 이탈 검사도 사람이 질의를 손으로 쳐야 했다.
//   ⇒ 정본을 여기로 올리고 검사기(e2e/vocabguard.mts)가 이 파일을 읽어 운영 환경과 대조한다.
// ⛔새 값을 쓰려면 먼저 이 파일에 추가한다. 반대 순서로 하면 검사기가 잡는다.

// ══════════════════════════════════════════════════════════════════════════════
// K축 — 강의 주제 적합(전문 분야)
// ══════════════════════════════════════════════════════════════════════════════
// 출처: 운영 과정 3종의 실제 회차 주제에서 역산(defense-amp 11회차 · ev-battery-amp 12주 ·
//   marketing-amp 12차수 = 35회차). ⛔상상으로 만든 분류가 아니다.
export const EXPERTISE = [
  // 산업
  '전기차', '배터리', '폐배터리순환경제', '자동차산업', '소재', '방산', '국방안보', '클라우드',
  // AI
  '생성형AI', 'AI에이전트', '데이터분석', 'AXDX', 'AI마케팅',
  // 마케팅
  '마케팅전략', '브랜드전략', '포지셔닝', 'SNS마케팅', '고객인사이트',
  // 경영
  '리더십', '조직문화', '코칭', '창의성발상', '협상', '네트워킹', '이미지브랜딩', '위기불황경영',
  // 방법론
  'TRIZ', '문제해결',
  // 안전
  '배터리안전', '화재안전',
  // 그 밖
  '미래전', '전쟁사', '정부조달', 'B2G', '수출협상', '세무회계',
] as const

// ══════════════════════════════════════════════════════════════════════════════
// S축 — 강의 방식 적합
// ══════════════════════════════════════════════════════════════════════════════
// 출처: 과정 카탈로그(lib/programs.ts)의 format 문장 6종에서 역산.
//   「강의 · 토론 · AI 실습 · 산업 현장 사례」 · 「전문가 강의 · 토론과 워크숍 · 경영사례 연구 ·
//   원우 네트워크」 · 「전문가 강의 · 현장 학습 · 팀별 실습 · CEO 네트워크」 · 「강의 · 계산 실습 ·
//   운영 화면 시연」
// ⛔온라인·오프라인은 방식이 아니라 «운영 형태»다 — L축에 둔다.
export const METHODS = [
  '강의', '워크숍', '토론', '실습', '사례연구', '코칭', '현장학습', '네트워킹세션', '시연',
] as const

// ══════════════════════════════════════════════════════════════════════════════
// A축 — 대상 층
// ══════════════════════════════════════════════════════════════════════════════
// 출처: 과정 카탈로그의 target 문장에서 역산.
// ⛔「신입」은 운영 과정 어디에도 없다 — 없는 칸을 만들지 않는다. 필요해지면 그때 보탠다.
export const AUDIENCES = [
  '최고경영자', '임원', '중간관리자', '실무자', '공공기관', '창업예정자',
] as const

// ══════════════════════════════════════════════════════════════════════════════
// C축 — 교육 지향 가치(조직 성향 적합)
// ══════════════════════════════════════════════════════════════════════════════
// ★이 축은 설계 결정이다. 발주 협의에서 실제로 갈리는 요구를 6개로 추렸다 —
//   「바로 써먹을 수 있게」 / 「남의 사례를 보고 싶다」 / 「듣기만 하면 졸린다」 /
//   「구조적으로 알고 싶다」 / 「지금 벌어지는 일을 듣고 싶다」 / 「효과를 보고해야 한다」.
// ★C축은 프로파일 «상관»으로 재므로 절대값이 아니라 «무엇을 상대적으로 더 중시하는가»를 본다.
//   ⇒ 발주사가 3개 미만만 답하면 상관이 의미를 갖지 못해 C축은 null(측정 불가)이 된다.
//     ⛔그 경우 0 으로 채우지 않는다.
export const VALUE_AXES = [
  '실무적용', '사례중심', '참여유도', '이론체계', '최신동향', '성과측정',
] as const

// ══════════════════════════════════════════════════════════════════════════════
// L축 — 운영 조건(지역·형태)
// ══════════════════════════════════════════════════════════════════════════════
// ★4권역 — 강사풀 시드가 실제로 쓰는 단위다[실측 2026-10-06: 수도권 28 · 영남 11 · 호남 6 ·
//   충청강원 5]. ⛔충청과 강원을 쪼개지 않는다 — 과세분화하면 「충청강원」이 전부 이탈이 되고
//   매칭 L축이 끊긴다. 초판에서 7권역으로 적었다가 검사기가 5건을 잡아 되돌렸다.
// ⛔제주·전국은 운영 데이터에 없다. 없는 칸을 미리 만들지 않는다 — 필요해지면 그때 보탠다.
export const REGIONS = ['수도권', '충청강원', '호남', '영남'] as const
export const VENUE_TYPES = ['onsite', 'offsite', 'online'] as const  // edu_org_orders.venue_type 과 같은 값


// ══════════════════════════════════════════════════════════════════════════════
// 표준화 — 받은 말을 사전의 값으로 옮긴다
// ══════════════════════════════════════════════════════════════════════════════
// ★명부는 사람이 자유롭게 쓴다. 「디지털전환·클라우드」 한 칸이 사전에서는 두 값이고,
//   「브랜드」는 「브랜드전략」이다. 표준화를 임포터 안에 숨기면 규칙이 보이지 않는다.
// ⛔추측으로 매핑하지 않는다 — 여기 있는 항목은 «실제로 관측된 표기»다:
//   운영 환경 이탈값 5종(2026-10-06 vocabguard) + 강사풀 요청 문안이 쓴 분야명 9종.
// ⛔사전에 대응이 없는 말은 매핑하지 않고 «이탈로 남긴다». 억지로 붙이면 틀린 매칭이 된다.
export const EXPERTISE_SYNONYMS: Record<string, readonly Expertise[]> = {
  '브랜드': ['브랜드전략'],
  '브랜딩': ['브랜드전략'],
  '디지털전환': ['AXDX'],
  '디지털전환·클라우드': ['AXDX', '클라우드'],
  'DX': ['AXDX'],
  'AX': ['AXDX'],
  '방산마케팅': ['방산', '마케팅전략'],
  '배터리산업': ['배터리'],
  '이차전지': ['배터리'],
  '창의적 발상': ['창의성발상'],
  '창의력': ['창의성발상'],
  '협상과 네트워크': ['협상', '네트워킹'],
  '폐배터리·순환경제': ['폐배터리순환경제'],
  '순환경제': ['폐배터리순환경제'],
  '배터리 화재안전': ['배터리안전', '화재안전'],
  'SNS 실전': ['SNS마케팅'],
  'SNS': ['SNS마케팅'],
  '불황기 경영': ['위기불황경영'],
  '이미지 브랜딩': ['이미지브랜딩'],
  '생성형 AI': ['생성형AI'],
  'AI 에이전트': ['AI에이전트'],
  '데이터 분석': ['데이터분석'],
}

// ★권역 — 광역 지명을 4권역으로 모은다. 명부는 「서울」·「경기」·「부산」으로 온다.
export const REGION_SYNONYMS: Record<string, Region> = {
  '서울': '수도권', '경기': '수도권', '인천': '수도권', '수도권': '수도권',
  '대전': '충청강원', '충남': '충청강원', '충북': '충청강원', '세종': '충청강원',
  '강원': '충청강원', '충청': '충청강원', '충청·강원': '충청강원', '충청강원': '충청강원',
  '광주': '호남', '전남': '호남', '전북': '호남', '호남': '호남',
  '부산': '영남', '대구': '영남', '울산': '영남', '경남': '영남', '경북': '영남', '영남': '영남',
}

/** 대상 층 — 경력 서술에서 찾아낼 말들. ⛔없으면 비워 둔다(지어내지 않는다). */
export const AUDIENCE_CUES: Record<string, Audience> = {
  'CEO': '최고경영자', '대표': '최고경영자', '최고경영': '최고경영자', '최고위': '최고경영자',
  '임원': '임원', '경영진': '임원', 'C레벨': '임원',
  '팀장': '중간관리자', '관리자': '중간관리자', '중간관리': '중간관리자', '리더': '중간관리자',
  '실무': '실무자', '담당자': '실무자', '사원': '실무자',
  '공공': '공공기관', '지자체': '공공기관', '공무원': '공공기관',
  '창업': '창업예정자', '예비창업': '창업예정자',
}

/** 강의 방식 — 경력 서술에서 찾아낼 말들. ⛔없으면 비워 둔다. */
export const METHOD_CUES: Record<string, Method> = {
  '강의': '강의', '세미나': '강의', '특강': '강의', '강연': '강의',
  '워크숍': '워크숍', '워크샵': '워크숍',
  '실습': '실습', '핸즈온': '실습',
  '사례': '사례연구', '케이스': '사례연구',
  '코칭': '코칭', '멘토링': '코칭',
  '토론': '토론', '디베이트': '토론',
  '현장': '현장학습', '견학': '현장학습', '투어': '현장학습',
  '시연': '시연', '데모': '시연',
}

/** 경력 서술에서 수행 가능한 강의 방식을 뽑는다. ⛔못 찾으면 빈 배열 — 「강의」로 때우지 않는다. */
export function extractMethods(...texts: (string | null | undefined)[]): Method[] {
  const blob = texts.filter(Boolean).join(' ')
  const out = new Set<Method>()
  for (const [cue, m] of Object.entries(METHOD_CUES)) if (blob.includes(cue)) out.add(m)
  return [...out]
}

/** 자유 텍스트 한 칸 → 사전 값들. 대응이 없으면 stray 로 돌려준다. */
export function normalizeExpertise(raw: string): { hit: Expertise[]; stray: string[] } {
  const token = raw.trim()
  if (!token) return { hit: [], stray: [] }
  const dict = new Set<string>(EXPERTISE)
  if (dict.has(token)) return { hit: [token as Expertise], stray: [] }
  const syn = EXPERTISE_SYNONYMS[token]
  if (syn) return { hit: [...syn], stray: [] }
  // 공백·가운뎃점을 지운 표기까지만 본다. ⛔부분 일치로 넘겨짚지 않는다.
  const squeezed = token.replace(/[\s·.\-]/g, '')
  if (dict.has(squeezed)) return { hit: [squeezed as Expertise], stray: [] }
  const syn2 = EXPERTISE_SYNONYMS[squeezed]
  if (syn2) return { hit: [...syn2], stray: [] }
  return { hit: [], stray: [token] }
}

export function normalizeRegion(raw: string): { hit: Region | null; stray: string | null } {
  const t = raw.trim()
  if (!t) return { hit: null, stray: null }
  const direct = REGION_SYNONYMS[t] ?? REGION_SYNONYMS[t.replace(/[\s·]/g, '')]
  return direct ? { hit: direct, stray: null } : { hit: null, stray: t }
}

/** 경력 서술에서 연수를 뽑는다. 여러 개면 가장 큰 값 — 「15년 경력 · 수출 12건」에서 15를 고른다. */
export function extractYears(career: string | null | undefined): number | null {
  if (!career) return null
  const found = [...career.matchAll(/(\d{1,2})\s*년/g)].map((m) => Number(m[1]))
  const sane = found.filter((n) => n >= 1 && n <= 60)
  return sane.length ? Math.max(...sane) : null
}

/** 경력 서술에서 대상 층을 뽑는다. ⛔못 찾으면 빈 배열 — 「실무자」로 때우지 않는다. */
export function extractAudience(...texts: (string | null | undefined)[]): Audience[] {
  const blob = texts.filter(Boolean).join(' ')
  const out = new Set<Audience>()
  for (const [cue, aud] of Object.entries(AUDIENCE_CUES)) if (blob.includes(cue)) out.add(aud)
  return [...out]
}

export type Expertise = (typeof EXPERTISE)[number]
export type Method    = (typeof METHODS)[number]
export type Audience  = (typeof AUDIENCES)[number]
export type ValueAxis = (typeof VALUE_AXES)[number]
export type Region    = (typeof REGIONS)[number]

/** 사전 한 벌 — 검사기가 축 이름으로 집어 쓴다. 축을 늘리면 여기에도 보탠다. */
export const VOCAB = {
  expertise:     EXPERTISE,
  methods:       METHODS,
  audience:      AUDIENCES,
  value_profile: VALUE_AXES,   // jsonb 의 «키»가 검사 대상이다
  regions:       REGIONS,
} as const satisfies Record<string, readonly string[]>

export type VocabAxis = keyof typeof VOCAB

/** 사전을 벗어난 값만 돌려준다. 빈 배열 = 이탈 없음. */
export function strayValues(axis: VocabAxis, values: readonly string[]): string[] {
  const dict = new Set<string>(VOCAB[axis])
  return values.filter((v) => !dict.has(v))
}

/** C축 산출 가능 여부 — 3개 미만이면 측정하지 않는다(엔진 규율). */
export function cultureMeasurable(profile: Record<string, number> | null | undefined): boolean {
  return !!profile && Object.keys(profile).length >= 3
}
