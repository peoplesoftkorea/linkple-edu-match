'use server'
import { createHash, randomBytes } from 'node:crypto'
import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { isAdmin } from '@/lib/guard'
import { serverClient } from '@/lib/supabase/server'
import {
  INSTRUCTOR_CONTRACT_TEMPLATE, TEMPLATE_REV, TEMPLATE_APPROVED,
  fillContract, sessionRow,
} from '@/lib/contracts'
import { TRAVEL_FEE, VENUE_LABEL, type VenueType } from '@/lib/pricing/edu'

// 위촉계약서 — 확정된 위촉에서 계약서를 «그 건의 값으로» 만들고 양측이 서명한다.
//
// ★채우지 못한 칸이 남으면 만들지 않는다. 무엇이 비었는지 이름으로 말하고 멈춘다.
// ★서명 시점의 전문을 원장에 박는다 — 템플릿이 개정돼도 과거 계약은 흔들리지 않는다.
// 🔴승인 게이트 — 문안이 대표님 서명을 받기 전에는 «강사에게 보내지» 못한다.
//   생성과 내부 검토까지만 열어 둔다(`TEMPLATE_APPROVED`).
// ⛔토큰 원문을 저장하지 않는다 — 저장하면 원장을 읽을 수 있는 사람이 곧 서명자가 된다.

const back: (msg: string, to?: string) => never =
  (msg, to = '/edu/matching') => redirect(`${to}?msg=${encodeURIComponent(msg)}`)

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')
const won = (n: number) => n.toLocaleString('ko-KR')
const kstDate = (d = new Date()) =>
  new Date(d.getTime() + 9 * 3_600_000).toISOString().slice(0, 10)

/** 소득 구분 — 사업자등록이 있으면 사업소득, 없으면 기타소득. 원고 제9조의 두 갈래 그대로. */
const incomeTypeOf = (bizNo: string | null) =>
  bizNo && bizNo.trim() && bizNo.trim() !== '해당 없음'
    ? '사업소득(3%)'
    : '기타소득(20%·필요경비 공제 후)'

export async function generateContract(fd: FormData) {
  if (!(await isAdmin())) back('권한이 없습니다.')
  const engagementId = String(fd.get('engagementId') ?? '')
  const runId = String(fd.get('runId') ?? '')
  const to = runId ? `/edu/matching/${runId}` : '/edu/matching'
  if (!engagementId) back('대상 위촉 건이 없습니다.', to)

  const { data: eng } = await supabaseAdmin
    .from('edu_instructor_engagements')
    .select('id, status, scope, session_id, cohort_id, fee, is_test, instructor:edu_instructors(id, name, email, phone, bio, regions)')
    .eq('id', engagementId)
    .maybeSingle()
  if (!eng) back('위촉 건을 찾지 못했습니다.', to)
  if (eng.status !== 'confirmed') back('확정된 위촉에서만 계약서를 만듭니다 — 먼저 확정하십시오.', to)

  const who = (Array.isArray(eng.instructor) ? eng.instructor[0] : eng.instructor) as
    { id: string; name: string; email: string | null; phone: string | null; regions: string[] | null } | null
  if (!who) back('강사 정보를 읽지 못했습니다.', to)

  // 회차 명세 — 기수 위촉이면 그 기수의 회차 전부, 회차 위촉이면 그 한 회차
  const { data: sessions } = eng.scope === 'cohort'
    ? await supabaseAdmin.from('edu_sessions')
        .select('session_no, title, topic, held_on, starts_at, ends_at, venue')
        .eq('cohort_id', eng.cohort_id!).order('session_no')
    : await supabaseAdmin.from('edu_sessions')
        .select('session_no, title, topic, held_on, starts_at, ends_at, venue, cohort_id')
        .eq('id', eng.session_id!)

  const rows = sessions ?? []
  if (rows.length === 0) back('위촉 대상에 회차가 없습니다 — 회차를 먼저 등록하십시오. 빈 명세로는 계약서를 만들지 않습니다.', to)

  const cohortId = eng.cohort_id ?? (rows[0] as { cohort_id?: string }).cohort_id ?? null
  const { data: cohort } = cohortId
    ? await supabaseAdmin.from('edu_cohorts').select('title, cohort_no, program_slug, venue, is_test').eq('id', cohortId).maybeSingle()
    : { data: null }
  const { data: order } = cohortId
    ? await supabaseAdmin.from('edu_org_orders').select('org_name, venue_type, venue_region').eq('cohort_id', cohortId).limit(1).maybeSingle()
    : { data: null }

  const venueType = (order?.venue_type ?? 'onsite') as VenueType
  const region = order?.venue_region ?? (who.regions ?? [])[0] ?? null
  const travelPer = venueType === 'onsite' ? (TRAVEL_FEE[region ?? '수도권'] ?? 0) : 0

  // 회차 줄 — 빈 줄을 남기지 않는다(원고 별표1)
  const minutesOf = (s: { starts_at?: string | null; ends_at?: string | null }) => {
    if (!s.starts_at || !s.ends_at) return 0
    return Math.max(0, Math.round((Date.parse(s.ends_at) - Date.parse(s.starts_at)) / 60000))
  }
  const fmtWhen = (s: { held_on?: string | null; starts_at?: string | null; ends_at?: string | null }) => {
    if (!s.held_on) return ''
    if (!s.starts_at || !s.ends_at) return s.held_on
    const hm = (x: string) => new Date(Date.parse(x) + 9 * 3_600_000).toISOString().slice(11, 16)
    return `${s.held_on} ${hm(s.starts_at)}~${hm(s.ends_at)}`
  }
  const sessionRows = rows.map((s, i) =>
    sessionRow(s.session_no ?? i + 1, fmtWhen(s), s.venue ?? cohort?.venue ?? '', s.topic || s.title || '', minutesOf(s)),
  ).join('\n')

  const fee = eng.fee ?? 0
  const bizNo = String(fd.get('instructorBizNo') ?? '').trim() || '해당 없음'
  const values: Record<string, string | number | null | undefined> = {
    instructorName: who.name,
    instructorBizNo: bizNo,
    instructorAddress: String(fd.get('instructorAddress') ?? '').trim(),
    instructorContact: String(fd.get('instructorContact') ?? '').trim() || who.email || who.phone || '',
    programTitle: cohort?.title ?? '',
    cohortLabel: cohort?.cohort_no ? `${cohort.cohort_no}기` : '',
    orgName: order?.org_name ?? String(fd.get('orgName') ?? '').trim(),
    sessionCount: rows.length,
    venueLabel: VENUE_LABEL[venueType],
    region: region ?? '',
    sessionRows,
    priorClients: String(fd.get('priorClients') ?? '').trim() || '없음',
    feePerSession: won(fee),
    feeTotal: won(fee * rows.length),
    travelPerSession: won(travelPer),
    travelSessions: venueType === 'onsite' ? rows.length : 0,
    travelTotal: won(travelPer * (venueType === 'onsite' ? rows.length : 0)),
    travel충청강원: won(TRAVEL_FEE['충청·강원'] ?? 0),
    travel영호남: won(TRAVEL_FEE['영남'] ?? 0),
    travel제주: won(TRAVEL_FEE['제주'] ?? 0),
    incomeType: incomeTypeOf(bizNo),
    vatType: bizNo !== '해당 없음' ? '과세사업자 — 세금계산서 발급' : '해당 없음',
    bankAccount: String(fd.get('bankAccount') ?? '').trim(),
    contractDate: kstDate(),
  }
  // ⛔강사료가 0이면 만들지 않는다 — 금액이 빠진 계약서가 가장 위험한 빈칸이다
  if (fee <= 0) back('회당 강사료가 없습니다 — 위촉 건에 강사료를 먼저 적으십시오.', to)

  const filled = fillContract(INSTRUCTOR_CONTRACT_TEMPLATE, values)
  if (!filled.ok) back(`계약서를 만들지 않았습니다 — ${filled.label}`, to)

  const { error } = await supabaseAdmin.from('edu_contracts').insert({
    engagement_id: engagementId,
    template_rev: TEMPLATE_REV,
    body: filled.body,
    fields: values,
    body_sha256: sha256(filled.body),
    status: 'draft',
    is_test: eng.is_test || !!cohort?.is_test,
    created_by: (await (await serverClient()).auth.getUser()).data.user?.id ?? null,
  })
  if (error) {
    const dup = error.code === '23505'
    back(dup ? '이 위촉에는 이미 계약서가 있습니다 — 무효로 한 뒤 다시 만드십시오.' : `계약서를 남기지 못했습니다 — ${error.message}`, to)
  }
  back('계약서를 만들었습니다. 내용을 확인한 뒤 서명하십시오.', to)
}

/** 당사 서명 — 운영자가 콘솔에서 한다. */
export async function signAsCompany(fd: FormData) {
  if (!(await isAdmin())) back('권한이 없습니다.')
  const contractId = String(fd.get('contractId') ?? '')
  const runId = String(fd.get('runId') ?? '')
  const to = runId ? `/edu/matching/${runId}` : '/edu/matching'
  const signerName = String(fd.get('signerName') ?? '').trim()
  if (!contractId || !signerName) back('서명자 성명을 적으십시오.', to)

  const { data: c } = await supabaseAdmin.from('edu_contracts').select('id, status, body_sha256').eq('id', contractId).maybeSingle()
  if (!c) back('계약서를 찾지 못했습니다.', to)
  if (c.status === 'void') back('무효 처리된 계약서입니다.', to)

  const consent = '본인은 위 계약서의 내용을 확인하였으며, 회사를 대표하여 이에 서명합니다.'
  const { error } = await supabaseAdmin.from('edu_contract_signatures').insert({
    contract_id: contractId, party: 'company', signer_name: signerName,
    body_sha256: c.body_sha256, consent_text: consent,
    signed_by: (await (await serverClient()).auth.getUser()).data.user?.id ?? null,
  })
  if (error) back(error.code === '23505' ? '이미 당사 서명이 있습니다.' : `서명하지 못했습니다 — ${error.message}`, to)
  back('당사 서명을 기록했습니다.', to)
}

/**
 * 강사 서명 요청 — 1회용 링크를 만든다.
 * 🔴문안이 승인되기 전에는 거절한다. 이 게이트가 「미승인 초안을 강사에게 보내지 않는다」의 집행이다.
 */
export async function requestInstructorSignature(fd: FormData) {
  if (!(await isAdmin())) back('권한이 없습니다.')
  const contractId = String(fd.get('contractId') ?? '')
  const runId = String(fd.get('runId') ?? '')
  const to = runId ? `/edu/matching/${runId}` : '/edu/matching'
  if (!contractId) back('계약서가 없습니다.', to)

  if (!TEMPLATE_APPROVED) {
    back('계약 문안이 아직 승인 전입니다 — 대표님 승인 뒤에 강사에게 보냅니다. 지금은 생성과 내부 확인까지만 됩니다.', to)
  }

  const token = randomBytes(32).toString('base64url')
  const { error } = await supabaseAdmin.from('edu_contracts').update({
    status: 'sent',
    sign_token_sha256: sha256(token),
    sign_token_expires_at: new Date(Date.now() + 14 * 24 * 3_600_000).toISOString(),
  }).eq('id', contractId).eq('status', 'draft')
  if (error) back(`서명 요청을 만들지 못했습니다 — ${error.message}`, to)

  // ⛔토큰은 이 한 번만 보인다 — 원장에는 해시만 남는다
  back(`서명 링크를 만들었습니다(14일 유효). 강사에게 이 주소를 전달하십시오: /sign/${token}`, to)
}

export async function voidContract(fd: FormData) {
  if (!(await isAdmin())) back('권한이 없습니다.')
  const contractId = String(fd.get('contractId') ?? '')
  const runId = String(fd.get('runId') ?? '')
  const to = runId ? `/edu/matching/${runId}` : '/edu/matching'
  const reason = String(fd.get('reason') ?? '').trim() || '운영자 무효 처리'
  const { error } = await supabaseAdmin.from('edu_contracts')
    .update({ status: 'void', void_reason: reason, sign_token_sha256: null, sign_token_expires_at: null })
    .eq('id', contractId)
  if (error) back(`무효 처리하지 못했습니다 — ${error.message}`, to)
  back('계약서를 무효로 했습니다. 다시 만들 수 있습니다.', to)
}
