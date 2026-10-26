'use server'
import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { isAdmin } from '@/lib/guard'
import { decomposeCurriculum } from '@/lib/curriculum'
import { customQuote, catalogControl, INSTRUCTOR_FEE_PER_SESSION, TARGET_DIRECT_RATIO } from '@/lib/pricing/custom'
import type { VenueType } from '@/lib/pricing/edu'

// AI 단가 분석 — 요구 문장을 회차로 분해(모델)하고, 금액을 원가에서 쌓는다(코드).
//
// ★두 일을 섞지 않는 것이 이 파일의 전부다.
//   모델은 «무엇을 몇 회차로 가르칠 것인가»만 답하고, 금액은 `customQuote` 가 정한다.
//   모델이 금액을 말해도 `decomposeCurriculum` 이 버리고 버린 횟수를 돌려준다 — 그 수를 원장에 남긴다.
// ⛔「AI 가 산정한 견적」이라고 부르지 않는다. AI 가 한 것은 분해이고 산정은 우리 산식이다.
//
// 🔴fail-to-zero 금지
//   · 분해 실패를 「회차 0개 견적」으로 바꾸지 않는다 — 거절하고 사유를 돌려준다
//   · 모델이 못 붙인 말(stray)을 조용히 버리지 않는다 — 화면에 보여 사전을 늘리게 한다

const back: (msg: string, to?: string) => never =
  (msg, to = '/edu/pricing') => redirect(`${to}?msg=${encodeURIComponent(msg)}`)

const num = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? '').trim()
  if (!v) return null
  const n = Number(v.replace(/,/g, ''))
  return Number.isFinite(n) ? n : NaN
}

export async function runPricing(fd: FormData) {
  if (!(await isAdmin())) back('권한이 없습니다.')

  const request = String(fd.get('request') ?? '').trim()
  if (request.length < 10) back('교육 요구를 한 문장 이상 적어 주십시오 — 분해할 내용이 있어야 금액이 섭니다.')

  const headcount = num(fd, 'headcount')
  if (headcount == null || Number.isNaN(headcount) || headcount < 1) back('교육 인원을 1명 이상 적어 주십시오.')

  const venueType = String(fd.get('venueType') ?? 'onsite') as VenueType
  if (!['onsite', 'offsite', 'online'].includes(venueType)) back('진행 형태를 고르십시오.')
  const region = String(fd.get('region') ?? '').trim() || undefined
  const audience = String(fd.get('audience') ?? '').trim() || undefined
  const weeksRaw = num(fd, 'weeks')
  const weeks = weeksRaw != null && !Number.isNaN(weeksRaw) && weeksRaw > 0 ? Math.round(weeksRaw) : null
  const orderId = String(fd.get('orderId') ?? '').trim() || null

  // 강사료·목표 직접비율은 «기본값이 있는 입력»이다 — 발주마다 다를 수 있으므로 화면에서 고칠 수 있게 한다
  const feeRaw = num(fd, 'feePerSession')
  const feePerSession = feeRaw != null && !Number.isNaN(feeRaw) && feeRaw > 0 ? Math.round(feeRaw) : INSTRUCTOR_FEE_PER_SESSION
  const ratioRaw = num(fd, 'directRatio')
  const targetDirectRatio = ratioRaw != null && !Number.isNaN(ratioRaw) && ratioRaw > 0.05 && ratioRaw < 0.95
    ? ratioRaw : TARGET_DIRECT_RATIO

  const dec = await decomposeCurriculum({ request, headcount, audience, weeks, venue: venueType })
  if (!dec.ok) back(dec.error)

  const sessions = dec.decomposition.sessions.length
  const totalHours = dec.decomposition.sessions.reduce((s, x) => s + x.hours, 0)
  const hoursPerSession = totalHours / sessions
  // 초빙 비율 — 기본은 «전 회차 초빙»이다. 사내 강사가 맡을 회차는 운영자가 줄인다.
  //   ⛔낙관적으로 낮게 잡지 않는다. 원가를 적게 잡으면 그만큼 마진이 아니라 적자가 된다.
  const outsourcedRaw = num(fd, 'outsourcedSessions')
  const outsourcedSessions = outsourcedRaw != null && !Number.isNaN(outsourcedRaw)
    ? Math.min(sessions, Math.max(0, Math.round(outsourcedRaw))) : sessions

  const quote = customQuote({
    sessions, hoursPerSession, outsourcedSessions, headcount,
    venueType, region, feePerSession, targetDirectRatio,
  })
  if (!quote.ok) back(quote.reason ?? '단가를 산정하지 못했습니다.')

  const control = catalogControl(venueType)

  const { data: run, error } = await supabaseAdmin
    .from('edu_pricing_runs')
    .insert({
      order_id: orderId,
      request, headcount, venue_type: venueType, region,
      provider: dec.provider, model: dec.model, raw_response: dec.raw.slice(0, 20_000),
      decomposition: dec.decomposition,
      pricing_input: {
        sessions, hoursPerSession, totalHours, outsourcedSessions,
        feePerSession, targetDirectRatio, venueType, region, headcount,
      },
      quote, control,
      dropped_money_fields: dec.decomposition.droppedMoneyFields,
      // 아직 실발주가 아니면 테스트로 둔다 — 영업 실적과 섞지 않는다
      is_test: !orderId,
    })
    .select('id')
    .single()
  if (error || !run) back(`산출을 남기지 못했습니다 — ${error?.message ?? '원인 미상'}`)

  redirect(`/edu/pricing/${run.id}`)
}
