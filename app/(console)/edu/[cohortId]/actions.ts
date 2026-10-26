'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { isAdmin } from '@/lib/guard'

// 교육 운영 액션 — 회차 생성 · 출결 저장 · 수료증 발급.
//
// ★form action 은 «값을 돌려줄 수 없다»(void 만 허용). 결과는 redirect 의 쿼리로 넘겨
//   화면이 읽는다 — 성공도 실패도 «사람이 보이는 문장»으로 남겨야 운영자가 다음 행동을 안다.
//   ⛔조용히 실패하고 목록만 새로 그리면 「저장된 줄 알았다」가 생긴다.
// ★서버 액션마다 isAdmin() 을 다시 확인한다. 레이아웃 게이트를 믿고 생략하면
//   액션은 «직접 POST» 로도 불릴 수 있다(심층방어 · 2026-07-25 감사 H2 와 같은 형태).

const back = (cohortId: string, msg: string, sessionId?: string) =>
  redirect(`/edu/${cohortId}?${sessionId ? `s=${sessionId}&` : ''}msg=${encodeURIComponent(msg)}`)

export async function addSession(cohortId: string, formData: FormData): Promise<void> {
  if (!(await isAdmin())) back(cohortId, '권한이 없습니다.')
  const no = Number(formData.get('session_no') || 0)
  if (!Number.isInteger(no) || no <= 0) back(cohortId, '회차 번호를 확인해 주세요.')

  const { error } = await supabaseAdmin.from('edu_sessions').insert({
    cohort_id: cohortId,
    session_no: no,
    title: String(formData.get('title') || '') || null,
    held_on: String(formData.get('held_on') || '') || null,
    instructor: String(formData.get('instructor') || '') || null,
    venue: String(formData.get('venue') || '') || null,
    // 출결 분모에서 뺄 회차(특강·OT)는 체크로 표시한다. ⛔삭제로 처리하지 않는다.
    counts_for_attendance: formData.get('counts') !== 'off',
  })
  if (error) {
    console.error('[edu/addSession]', error.message)
    back(cohortId, '회차를 추가하지 못했습니다.')
  }
  revalidatePath(`/edu/${cohortId}`)
  back(cohortId, `${no}회차를 추가했습니다.`)
}

// 출결 저장 — 한 회차의 «전원»을 한 번에 기록한다.
// ★미입력을 absent 로 «자동 기록하지 않는다» — 행이 없는 것과 결석은 다른 사건이다.
//   화면에서 「미입력」을 고른 행은 기존 기록을 지운다(기록의 취소이지 결석 처리가 아니다).
export async function saveAttendance(cohortId: string, sessionId: string, formData: FormData): Promise<void> {
  if (!(await isAdmin())) back(cohortId, '권한이 없습니다.', sessionId)

  const upserts: { session_id: string; enrollment_id: string; status: string }[] = []
  const clears: string[] = []
  for (const [k, v] of formData.entries()) {
    if (!k.startsWith('att:')) continue
    const enrollmentId = k.slice(4)
    const status = String(v)
    if (status === 'none') clears.push(enrollmentId)
    else if (['present', 'late', 'absent', 'excused'].includes(status)) {
      upserts.push({ session_id: sessionId, enrollment_id: enrollmentId, status })
    }
  }

  if (upserts.length) {
    const { error } = await supabaseAdmin
      .from('edu_attendance')
      .upsert(upserts, { onConflict: 'session_id,enrollment_id' })
    if (error) {
      console.error('[edu/saveAttendance] upsert', error.message)
      back(cohortId, '출결을 저장하지 못했습니다.', sessionId)
    }
  }
  if (clears.length) {
    const { error } = await supabaseAdmin
      .from('edu_attendance')
      .delete()
      .eq('session_id', sessionId)
      .in('enrollment_id', clears)
    if (error) console.error('[edu/saveAttendance] clear', error.message)
  }

  revalidatePath(`/edu/${cohortId}`)
  back(cohortId, `출결 ${upserts.length}건 저장${clears.length ? ` · ${clears.length}건 기록 삭제` : ''}`, sessionId)
}

// 수료증 발급 — 판정·서명은 edu 앱의 발급 경로가 한다(정본 한 곳).
// ★여기서 다시 계산하지 않는다. 같은 판정을 두 곳에서 하면 언젠가 갈라진다.
export async function issueCredential(cohortId: string, enrollmentId: string): Promise<void> {
  if (!(await isAdmin())) back(cohortId, '권한이 없습니다.')
  const base = process.env.EDU_APP_URL || 'https://linkple-edu-match.vercel.app'
  const token = process.env.EDU_ADMIN_TOKEN
  if (!token) back(cohortId, '발급 토큰(EDU_ADMIN_TOKEN)이 설정되지 않았습니다.')

  let msg = ''
  try {
    const res = await fetch(`${base}/api/credentials/issue`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-token': token as string },
      body: JSON.stringify({ enrollmentId }),
      cache: 'no-store',
    })
    const json = (await res.json()) as Record<string, unknown>
    revalidatePath(`/edu/${cohortId}`)
    // 409(이미 발급·요건 미충족)는 «실패»가 아니라 상태다. 문구를 그대로 올린다.
    msg = res.ok ? `수료증 발급 완료 · ${String(json.publicId || '')}` : String(json.error || '발급하지 못했습니다.')
  } catch (e) {
    console.error('[edu/issueCredential]', e)
    msg = '발급 경로에 연결하지 못했습니다.'
  }
  back(cohortId, msg)
}

// ════════════════════════════════════════════════════════════════════════════
// 공모 — 이 회차의 강사를 공개 모집한다 (e25)
// ════════════════════════════════════════════════════════════════════════════
// ★왜 운영자 화면에 있는가 — 강사 창구(`edu /instructor`)는 «열린 회차»만 보여 준다.
//   여기서 열지 않으면 그 창구는 영영 빈 목록이다. 두 화면이 한 묶음이라 같은 날 붙인다.
// ★공모 대상은 «당사가 이미 수주한» 과정의 회차다 — 그래서 기수 상세 안에 둔다.
//   밖에 독립 화면으로 두면 수주와 무관한 회차에도 열 수 있게 되고, 그것은 알선의 외형이다.
// ⛔「닫기」를 삭제로 처리하지 않는다. 공모한 사실은 남는다(open_call_closed_at 을 찍는다).
export async function openCall(cohortId: string, sessionId: string, formData: FormData): Promise<void> {
  if (!(await isAdmin())) back(cohortId, '권한이 없습니다.', sessionId)

  const raw = String(formData.get('fee') || '').replace(/[,\s]/g, '')
  const fee = raw === '' ? null : Number(raw)
  if (fee !== null && (!Number.isFinite(fee) || fee < 0)) {
    back(cohortId, '예상 강사료는 0원 이상의 숫자로 적어 주세요.', sessionId)
  }

  const { error } = await supabaseAdmin.from('edu_sessions').update({
    open_call_at: new Date().toISOString(),
    open_call_closed_at: null,          // 다시 여는 경우 — 닫힌 표시를 지운다
    open_call_fee: fee === null ? null : Math.trunc(fee),
    open_call_note: String(formData.get('note') || '') || null,
  }).eq('id', sessionId).eq('cohort_id', cohortId)

  if (error) {
    console.error('[edu/openCall]', error.message)
    back(cohortId, '공모를 열지 못했습니다.', sessionId)
  }
  revalidatePath(`/edu/${cohortId}`)
  back(cohortId, '강사 공모를 열었습니다 — 강사 창구에 이 회차가 나타납니다.', sessionId)
}

export async function closeCall(cohortId: string, sessionId: string): Promise<void> {
  if (!(await isAdmin())) back(cohortId, '권한이 없습니다.', sessionId)

  const { error } = await supabaseAdmin.from('edu_sessions')
    .update({ open_call_closed_at: new Date().toISOString() })
    .eq('id', sessionId).eq('cohort_id', cohortId)

  if (error) {
    console.error('[edu/closeCall]', error.message)
    back(cohortId, '공모를 닫지 못했습니다.', sessionId)
  }
  revalidatePath(`/edu/${cohortId}`)
  back(cohortId, '공모를 닫았습니다 — 이미 들어온 지원은 그대로 남습니다.', sessionId)
}
