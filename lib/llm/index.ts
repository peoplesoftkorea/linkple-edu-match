// LLM 공통 백본 — 프로바이더 선택·폴백·비전(이미지 판독).
//
// ★원칙 [AI 거버넌스] — 앱에서 프로바이더 API 를 «직접 fetch 하지 않는다».
//   한 곳에서 고르고 부르고, 반환에 provider/model 을 실어 로깅·비용 추적으로 잇는다.
//   앱마다 복제하면 모델·폴백·단가 정책이 갈리고, 갈린 순간 어느 쪽이 도는지 아무도 모른다.
//
// ★비전이 필요해진 계기 [대표님 지시 2026-09-19]
//   *"제출서류는 ocr로 자동 검사를 통해 1)선행 심사 후 관리자가 2)최종 의사결정할 수 있는 절차"*
//   종전 llm 모듈은 텍스트 전용이라 등록증 이미지를 읽을 수가 없었다.

export type LLMProvider = 'openai' | 'gemini' | 'anthropic'
export type LLMChoice = { provider: LLMProvider; model: string }

/** 비전 가능한 모델. ⛔텍스트 전용 모델을 여기 적지 않는다 — 이미지를 보내면 조용히 무시된다. */
const VISION_MODELS: Record<LLMProvider, string> = {
  gemini: 'gemini-3.6-flash',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-opus-4-8',
}

/** 일시 오류인가 — 과부하·속도제한·게이트웨이. ⛔인증 실패·잘못된 요청은 재시도해도 같다. */
export function isTransient(msg: string): boolean {
  return /\b(429|500|502|503|504)\b/.test(msg) || /rate.?limit|overload|high demand|timeout|ETIMEDOUT|ECONNRESET/i.test(msg)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** 같은 프로바이더에서 일시 오류만 다시 시도한다. 횟수와 간격을 작게 둔다 —
 *  서버리스 함수의 제한 시간 안에 끝나야 하고, 오래 끌면 사람이 먼저 포기한다. */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3, baseMs = 1200): Promise<T> {
  let last: unknown
  for (let i = 0; i < attempts; i++) {
    try { return await fn() } catch (e) {
      last = e
      const msg = e instanceof Error ? e.message : String(e)
      if (i === attempts - 1 || !isTransient(msg)) break
      await sleep(baseMs * (i + 1))
    }
  }
  throw last
}

function keyFor(p: LLMProvider): string | undefined {
  if (p === 'openai') return process.env.OPENAI_API_KEY
  if (p === 'anthropic') return process.env.ANTHROPIC_API_KEY
  return process.env.GEMINI_API_KEY
}

// 비전 기본 순서 = gemini → openai → anthropic.
//   텍스트(gpt-4o-mini 우선)와 «다르다» — 이미지 토큰 단가에서 gemini-flash 가 앞선다[2차출처].
//   ★Anthropic 의존도↓ 방침이 마지막 자리를 정한다.
const VISION_ORDER: LLMProvider[] = ['gemini', 'openai', 'anthropic']

export function visionChain(): LLMChoice[] {
  const pref = (process.env.LLM_VISION_PROVIDER || '').toLowerCase() as LLMProvider
  const order = VISION_ORDER.includes(pref)
    ? [pref, ...VISION_ORDER.filter((p) => p !== pref)]
    : VISION_ORDER
  return order.filter((p) => !!keyFor(p)).map((p) => ({ provider: p, model: VISION_MODELS[p] }))
}

/** 텍스트 전용 모델. ⛔비전 체인과 «다르다» — 이미지가 없으면 텍스트 단가가 싼 쪽이 먼저다. */
const TEXT_MODELS: Record<LLMProvider, string> = {
  openai: 'gpt-4o-mini',
  gemini: 'gemini-3.6-flash',
  // ★텍스트 폴백은 가용성이 목적 — Haiku 4.5($1/$5) [대표이사 결재 2026-10-27].
  //   ⛔VISION_MODELS 는 건드리지 않았다 — 비전은 등록증 판독처럼 정확도가 돈과 직결되는 축이라
  //     단가로 내릴 자리가 아니다(별건).
  anthropic: 'claude-haiku-4-5',
}
const TEXT_ORDER: LLMProvider[] = ['openai', 'gemini', 'anthropic']

export function textChain(): LLMChoice[] {
  const pref = (process.env.LLM_TEXT_PROVIDER || '').toLowerCase() as LLMProvider
  const order = TEXT_ORDER.includes(pref)
    ? [pref, ...TEXT_ORDER.filter((p) => p !== pref)]
    : TEXT_ORDER
  return order.filter((p) => !!keyFor(p)).map((p) => ({ provider: p, model: TEXT_MODELS[p] }))
}

export type VisionImage = { mime: string; base64: string }
export type VisionResult =
  | { ok: true; text: string; provider: LLMProvider; model: string; fellBack?: boolean }
  | { ok: false; error: string }

async function callGemini(c: LLMChoice, system: string, user: string, images: VisionImage[], maxTokens: number) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${c.model}:generateContent`,
    {
      method: 'POST',
      headers: { 'x-goog-api-key': keyFor('gemini')!, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{
          role: 'user',
          parts: [
            { text: user },
            ...images.map((im) => ({ inline_data: { mime_type: im.mime, data: im.base64 } })),
          ],
        }],
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0 },
      }),
    },
  )
  if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const j = await res.json()
  const text = (j?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('')
  if (!text) throw new Error('gemini: 빈 응답')
  return text
}

async function callOpenAI(c: LLMChoice, system: string, user: string, images: VisionImage[], maxTokens: number) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${keyFor('openai')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: c.model, max_tokens: maxTokens, temperature: 0,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: [
          { type: 'text', text: user },
          ...images.map((im) => ({ type: 'image_url', image_url: { url: `data:${im.mime};base64,${im.base64}` } })),
        ] },
      ],
    }),
  })
  if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const j = await res.json()
  const text = j?.choices?.[0]?.message?.content ?? ''
  if (!text) throw new Error('openai: 빈 응답')
  return text
}

async function callAnthropic(c: LLMChoice, system: string, user: string, images: VisionImage[], maxTokens: number) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': keyFor('anthropic')!,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: c.model, max_tokens: maxTokens, system,
      messages: [{ role: 'user', content: [
        { type: 'text', text: user },
        ...images.map((im) => ({ type: 'image', source: { type: 'base64', media_type: im.mime, data: im.base64 } })),
      ] }],
    }),
  })
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const j = await res.json()
  const text = (j?.content ?? []).map((b: { text?: string }) => b.text ?? '').join('')
  if (!text) throw new Error('anthropic: 빈 응답')
  return text
}

/**
 * 이미지를 읽어 텍스트를 돌려준다. 프로바이더가 실패하면 다음 것으로 넘어간다.
 * ⛔실패를 «빈 결과»로 돌려주지 않는다 — 못 읽은 것과 읽었는데 없는 것은 다른 사실이다.
 */
export async function llmVision(opts: {
  system: string
  user: string
  images: VisionImage[]
  maxTokens?: number
}): Promise<VisionResult> {
  const chain = visionChain()
  if (!chain.length) return { ok: false, error: 'LLM 키가 설정되지 않았습니다.' }
  const maxTokens = opts.maxTokens ?? 1200
  const errors: string[] = []

  for (const [i, c] of chain.entries()) {
    try {
      const text = await withRetry(() =>
        c.provider === 'gemini' ? callGemini(c, opts.system, opts.user, opts.images, maxTokens)
        : c.provider === 'openai' ? callOpenAI(c, opts.system, opts.user, opts.images, maxTokens)
        : callAnthropic(c, opts.system, opts.user, opts.images, maxTokens))
      return { ok: true, text, provider: c.provider, model: c.model, fellBack: i > 0 }
    } catch (e) {
      errors.push(`${c.provider}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return { ok: false, error: errors.join(' / ') }
}

/**
 * 텍스트만 보내고 텍스트를 돌려받는다. 프로바이더가 실패하면 다음 것으로 넘어간다.
 * ⛔실패를 «빈 결과»로 돌려주지 않는다 — 못 받은 것과 받았는데 없는 것은 다른 사실이다.
 * ★이미지 경로와 호출부를 같게 두기 위해 같은 프로바이더 함수를 쓴다(images=[]).
 */
export async function llmText(opts: {
  system: string
  user: string
  maxTokens?: number
}): Promise<VisionResult> {
  const chain = textChain()
  if (!chain.length) return { ok: false, error: 'LLM 키가 설정되지 않았습니다.' }
  const maxTokens = opts.maxTokens ?? 1600
  const errors: string[] = []
  for (const [i, c] of chain.entries()) {
    try {
      const text = await withRetry(() =>
        c.provider === 'gemini' ? callGemini(c, opts.system, opts.user, [], maxTokens)
        : c.provider === 'openai' ? callOpenAI(c, opts.system, opts.user, [], maxTokens)
        : callAnthropic(c, opts.system, opts.user, [], maxTokens))
      return { ok: true, text, provider: c.provider, model: c.model, fellBack: i > 0 }
    } catch (e) {
      errors.push(`${c.provider}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return { ok: false, error: errors.join(' / ') }
}

/**
 * 공급자 오류를 «사람이 할 수 있는 일»로 바꿔 말한다.
 * ⛔운영자에게 `gemini 402: {"error":...}` 를 그대로 보여 주지 않는다 — 그 화면을 보는 사람은
 *   무엇을 해야 하는지 알 수 없고, 결국 「AI 가 고장났다」로 보고된다.
 * ★원문은 버리지 않고 뒤에 붙인다 — 고치는 사람에게는 원문이 필요하다.
 */
export function explainLlmError(error: string): string {
  const base =
    /402|prepayment|credits are depleted|RESOURCE_EXHAUSTED|insufficient_quota|billing/i.test(error)
      ? 'AI 공급자의 잔여 크레딧이 없습니다 — 결제·충전이 필요합니다.'
    : /401|403|API key not valid|invalid_api_key|PERMISSION_DENIED/i.test(error)
      ? 'AI 공급자 키가 거부됐습니다 — 키가 만료됐거나 이 프로젝트에 등록되지 않았습니다.'
    : /키가 설정되지 않았습니다/.test(error)
      ? 'AI 공급자 키가 이 환경에 없습니다 — 배포 환경변수에 등록해야 합니다.'
    : /429|rate.?limit/i.test(error)
      ? 'AI 공급자가 속도 제한을 걸었습니다 — 잠시 뒤 다시 시도하십시오.'
    : /503|overload|high demand|500|502|504/i.test(error)
      ? 'AI 공급자가 일시적으로 응답하지 못했습니다 — 다시 시도하거나 잠시 뒤에 시도하십시오.'
    : 'AI 호출이 실패했습니다.'
  return `${base} (원문: ${error.replace(/\s+/g, ' ').slice(0, 200)})`
}

/** 모델이 ```json 펜스로 감싸 주는 일이 잦다 — 벗겨 내고 파싱한다. 실패는 null 이다(추측하지 않는다). */
export function parseJsonLoose<T>(text: string): T | null {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = (m ? m[1] : text).trim()
  try { return JSON.parse(body) as T } catch { /* 아래로 */ }
  const s = body.indexOf('{'); const e = body.lastIndexOf('}')
  if (s >= 0 && e > s) { try { return JSON.parse(body.slice(s, e + 1)) as T } catch { /* 포기 */ } }
  return null
}
