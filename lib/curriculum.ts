// 커리큘럼 분해 — 발주사의 «요구 문장»을 회차 구성으로 가른다.
//
// ★모델이 하는 일과 하지 않는 일을 코드로 가른다.
//   한다  = 요구를 회차로 쪼개고, 각 회차에 주제·시간·방식·대상 층을 붙인다
//   안 한다 = **금액**. 단가는 `@/lib/pricing/custom` 이 원가에서 쌓는다.
//   ⛔모델이 금액 비슷한 칸을 돌려주면 여기서 «버린다». 버린 횟수를 세어 함께 돌려준다 —
//     0 이 아니면 프롬프트가 새고 있다는 신호이고, 조용히 지나가면 다음엔 그 숫자가 견적에 실린다.
//
// ★태그는 통제 어휘로만 남긴다 — 자유 서술은 강사 매칭 K·S·A 축에 붙지 않는다.
//   사전 밖의 말은 버리지 않고 `stray` 로 모아 화면에 보여 준다(사전을 늘릴 재료다).
import { llmText, parseJsonLoose, explainLlmError } from '@/lib/llm'
import { EXPERTISE, METHODS, AUDIENCES } from '@/lib/matching/vocab'

export type DecomposedSession = {
  no: number
  topic: string
  hours: number
  outcome: string
  expertise: string[]
  methods: string[]
  audience: string[]
}

export type Decomposition = {
  title: string
  summary: string
  sessions: DecomposedSession[]
  notes: string[]
  /** 사전에 없어 태그로 못 붙인 말 — 버리지 않고 모아 둔다 */
  stray: string[]
  /** 모델이 돌려줬으나 서버가 버린 금액성 칸의 수 */
  droppedMoneyFields: number
}

export type DecomposeResult =
  | { ok: true; decomposition: Decomposition; provider: string; model: string; raw: string }
  | { ok: false; error: string; raw?: string }

/** 금액성 칸 — 이름에 이것이 들어 있으면 버린다. ⛔「혹시 쓸모 있을까」로 남겨 두지 않는다. */
const MONEY_KEYS = /(price|cost|fee|amount|budget|won|krw|단가|금액|비용|견적|예산|강사료)/i

const pickVocab = (raw: unknown, dict: readonly string[], stray: string[]): string[] => {
  const arr = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : []
  const out: string[] = []
  for (const v of arr) {
    const s = String(v).trim()
    if (!s) continue
    if ((dict as readonly string[]).includes(s)) out.push(s)
    else stray.push(s)
  }
  return [...new Set(out)]
}

/** 중첩된 객체에서 금액성 칸을 세며 지운다. */
function stripMoney(node: unknown, counter: { n: number }): unknown {
  if (Array.isArray(node)) return node.map((v) => stripMoney(v, counter))
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (MONEY_KEYS.test(k)) { counter.n++; continue }
      out[k] = stripMoney(v, counter)
    }
    return out
  }
  return node
}

/** 분해 지시문 — 런타임(LLM)과 로컬 도구(코덱스)가 «같은 말»을 써야 결과가 비교된다. */
export const DECOMPOSE_SYSTEM = [
  '당신은 기업 교육 과정을 설계하는 전문가입니다. 발주 기업의 요구를 회차 구성으로 분해합니다.',
  '',
  '반드시 지킬 것:',
  '1) **금액·단가·비용·예산을 절대 쓰지 마십시오.** 가격은 발주처가 아니라 당사 산식이 정합니다.',
  '2) 회차마다 주제와 그 회차가 남기는 결과(outcome)를 한 문장으로 적습니다.',
  '3) 태그(expertise·methods·audience)는 **주어진 목록의 값만** 씁니다. 목록에 없으면 비웁니다.',
  '4) 회차당 시간은 1.5~4 사이의 수로 적습니다.',
  '5) 설명 문장을 밖에 쓰지 말고 JSON 객체 하나만 출력합니다.',
  '',
  `expertise 목록: ${EXPERTISE.join(', ')}`,
  `methods 목록: ${METHODS.join(', ')}`,
  `audience 목록: ${AUDIENCES.join(', ')}`,
  '',
  '출력 형식:',
  '{"title":"과정명","summary":"한 문장 요약",',
  ' "sessions":[{"no":1,"topic":"회차 주제","hours":3,"outcome":"이 회차로 무엇이 가능해지는가",',
  '   "expertise":["..."],"methods":["..."],"audience":["..."]}],',
  ' "notes":["설계 시 유의할 점"]}',
].join('\n')

export function buildUserPrompt(req: {
  request: string; headcount: number; audience?: string; weeks?: number | null; venue: string
}): string {
  return [
    `교육 요구: ${req.request}`,
    `교육 인원: ${req.headcount}명`,
    req.audience ? `대상 층: ${req.audience}` : '',
    req.weeks ? `희망 기간: ${req.weeks}주 (회차 수를 이에 맞추십시오)` : '회차 수는 요구에 맞게 제안하십시오',
    `진행 형태: ${req.venue}`,
  ].filter(Boolean).join('\n')
}

/**
 * 모델 응답을 우리 타입으로 좁힌다.
 * ★느슨하게 받고 «엄격하게» 좁힌다 — 모델은 언제든 형식을 어긴다.
 * ⛔못 읽은 것을 빈 분해로 바꾸지 않는다. 회차가 하나도 서지 않으면 실패다.
 */
export function normalizeDecomposition(parsed: unknown): { ok: true; value: Decomposition } | { ok: false; error: string } {
  const counter = { n: 0 }
  const clean = stripMoney(parsed, counter) as Record<string, unknown> | null
  if (!clean || typeof clean !== 'object') return { ok: false, error: '모델 응답을 JSON 으로 읽지 못했습니다.' }

  const stray: string[] = []
  const rawSessions = Array.isArray(clean.sessions) ? clean.sessions : []
  const sessions: DecomposedSession[] = rawSessions.map((s, i) => {
    const o = (s ?? {}) as Record<string, unknown>
    const hours = Number(o.hours)
    return {
      no: Number.isFinite(Number(o.no)) ? Number(o.no) : i + 1,
      topic: String(o.topic ?? '').trim().slice(0, 200),
      // 시간은 1.5~4 로 가둔다 — 범위 밖 값이 그대로 총시간에 곱해지면 금액이 통째로 흔들린다
      hours: Number.isFinite(hours) ? Math.min(4, Math.max(1.5, hours)) : 2,
      outcome: String(o.outcome ?? '').trim().slice(0, 300),
      expertise: pickVocab(o.expertise, EXPERTISE, stray),
      methods: pickVocab(o.methods, METHODS, stray),
      audience: pickVocab(o.audience, AUDIENCES, stray),
    }
  }).filter((s) => s.topic.length > 0)

  if (sessions.length === 0) return { ok: false, error: '회차가 하나도 분해되지 않았습니다 — 요구를 더 구체적으로 적어 주십시오.' }

  return {
    ok: true,
    value: {
      title: String(clean.title ?? '').trim().slice(0, 120) || '맞춤 과정',
      summary: String(clean.summary ?? '').trim().slice(0, 400),
      sessions: sessions.map((s, i) => ({ ...s, no: i + 1 })),
      notes: (Array.isArray(clean.notes) ? clean.notes : []).map((n) => String(n).trim().slice(0, 300)).filter(Boolean).slice(0, 10),
      stray: [...new Set(stray)].slice(0, 30),
      droppedMoneyFields: counter.n,
    },
  }
}

/** 요구 문장을 회차로 분해한다. 실패는 사람이 읽는 문장으로 돌려준다. */
export async function decomposeCurriculum(req: {
  request: string; headcount: number; audience?: string; weeks?: number | null; venue: string
}): Promise<DecomposeResult> {
  const r = await llmText({ system: DECOMPOSE_SYSTEM, user: buildUserPrompt(req), maxTokens: 2400 })
  if (!r.ok) return { ok: false, error: `분해하지 못했습니다 — ${explainLlmError(r.error)}` }

  const parsed = parseJsonLoose<unknown>(r.text)
  if (parsed == null) return { ok: false, error: '모델이 JSON 이 아닌 답을 돌려줬습니다.', raw: r.text }

  const n = normalizeDecomposition(parsed)
  if (!n.ok) return { ok: false, error: n.error, raw: r.text }
  return { ok: true, decomposition: n.value, provider: r.provider, model: r.model, raw: r.text }
}
