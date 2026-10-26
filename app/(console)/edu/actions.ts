'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { isAdmin } from '@/lib/guard'
import { loadPrograms } from './catalog'

// 기수 개설 — 「과정을 여는」 행동. 운영자의 개시 스위치다.
//
// ★왜 이 파일이 생겼나 [대표님 승인 2026-09-26 · e2e 완주 중 적발]
//   `edu_cohorts` 에 쓰는 앱 코드가 **0개**였다. 목록 화면은 스스로
//   「기수는 edu 운영 경로에서 생성합니다」라고 적어 두었는데 그 경로가 없었고,
//   기수를 여는 유일한 방법이 SQL 이었다. 설계가 약속한 「휴먼리소스 zero」의 구멍이다.
//
// ★금액 SSOT 는 옮기지 않는다 — 과정 정가의 권위는 `lib/programs.ts` 가 계속 갖는다.
//   여기서 넣는 `price` 는 «이번 회차 실행가»이고, 승인 시 서버가 두 출처를 대조한다.
//   그래서 과정 목록도 admin 이 자기 파일에 적지 않고 edu 에 «물어본다»(§loadPrograms).
//
// 🔴fail-to-zero 금지 3곳
//   1) 과정 목록 조회가 실패하면 「과정이 없다」로 바꾸지 않는다 — 접수를 거절하고 그대로 말한다
//   2) 수강료 빈칸은 0원이 아니라 **null(미확정)** 이다 — 0원은 「무료」라는 사실 주장이 된다
//   3) 개설 실패를 조용히 삼키지 않는다 — 결과는 사람이 읽는 문장으로 화면에 돌려준다

const back = (msg: string, to = '/edu') => redirect(`${to}?msg=${encodeURIComponent(msg)}`)

const str = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? '').trim()
  return v ? v.slice(0, 500) : null
}
const num = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? '').trim()
  if (!v) return null
  const n = Number(v.replace(/,/g, ''))
  return Number.isFinite(n) ? Math.trunc(n) : NaN
}

/** 개설·수정에 공통으로 걸리는 검사. 통과하면 null, 걸리면 사람이 읽는 문장. */
function validate(f: {
  cohortNo?: number | null
  capacity: number | null
  price: number | null
  attendPct: number | null
  recruitFrom: string | null
  recruitTo: string | null
  startsOn: string | null
  endsOn: string | null
}): string | null {
  if (f.cohortNo !== undefined) {
    if (f.cohortNo === null || !Number.isInteger(f.cohortNo) || f.cohortNo <= 0) return '기수 번호는 1 이상의 정수여야 합니다.'
  }
  if (Number.isNaN(f.capacity)) return '정원은 숫자로 넣어 주십시오.'
  if (f.capacity !== null && f.capacity <= 0) return '정원은 1명 이상이어야 합니다. 정하지 않았으면 비워 두십시오.'
  if (Number.isNaN(f.price)) return '수강료는 숫자로 넣어 주십시오.'
  if (f.price !== null && f.price < 0) return '수강료는 0원 이상이어야 합니다.'
  if (f.attendPct === null || Number.isNaN(f.attendPct) || f.attendPct < 0 || f.attendPct > 100) {
    return '출석 요건은 0~100 사이여야 합니다.'
  }
  // ★날짜의 «순서»를 본다 — 거꾸로 된 기간은 화면에서 기간처럼 읽히면서 아무 신청도 받지 못한다.
  if (f.recruitFrom && f.recruitTo && f.recruitFrom > f.recruitTo) return '모집 시작이 마감보다 늦습니다.'
  if (f.startsOn && f.endsOn && f.startsOn > f.endsOn) return '개강일이 종료일보다 늦습니다.'
  return null
}

export async function createCohort(formData: FormData): Promise<void> {
  if (!(await isAdmin())) back('권한이 없습니다.')

  const slug = str(formData, 'program_slug')
  if (!slug) back('과정을 선택해 주십시오.')

  // ★과정이 «실재하는지»를 카탈로그에 되묻는다. 오타 하나로 화면에 안 뜨는 기수가 생긴다.
  const catalog = await loadPrograms()
  if (!catalog) {
    // ⛔조회 실패를 「없는 과정」으로 바꾸지 않는다 — 그러면 정상 과정이 거절된다.
    back('과정 목록을 확인하지 못해 개설을 멈췄습니다. 잠시 후 다시 시도해 주십시오.')
  }
  const program = catalog!.find((p) => p.slug === slug)
  if (!program) back(`카탈로그에 없는 과정입니다(${slug}). 과정을 먼저 코드에 추가해야 합니다.`)

  const cohortNo = num(formData, 'cohort_no')
  const capacity = num(formData, 'capacity')
  const price = num(formData, 'price')
  const attendPct = num(formData, 'attend_pct_required') ?? 67
  const recruitFrom = str(formData, 'recruit_from')
  const recruitTo = str(formData, 'recruit_to')
  const startsOn = str(formData, 'starts_on')
  const endsOn = str(formData, 'ends_on')

  const bad = validate({ cohortNo, capacity, price, attendPct, recruitFrom, recruitTo, startsOn, endsOn })
  if (bad) back(bad)

  const status = String(formData.get('status') || 'draft')
  const paymentMethod = String(formData.get('payment_method') || 'transfer')

  const { data, error } = await supabaseAdmin
    .from('edu_cohorts')
    .insert({
      program_slug: slug,
      cohort_no: cohortNo,
      title: str(formData, 'title'),
      subtitle: str(formData, 'subtitle'),
      status,
      recruit_from: recruitFrom,
      recruit_to: recruitTo,
      starts_on: startsOn,
      ends_on: endsOn,
      capacity,
      // ★빈칸 = 미확정(null). 화면은 「협의 후 확정」으로 정직하게 나가고 결제 경로가 열리지 않는다.
      price,
      price_note: str(formData, 'price_note'),
      venue: str(formData, 'venue'),
      venue_confirmed: formData.get('venue_confirmed') === 'on',
      venue_note: str(formData, 'venue_note'),
      attend_pct_required: attendPct,
      payment_method: paymentMethod,
      is_test: formData.get('is_test') === 'on',
    })
    .select('id')
    .single()

  if (error || !data) {
    // ★같은 기수 번호는 «에러»가 아니라 «이미 있다»다. DB 제약 문구를 그대로 올리지 않는다.
    if (error?.code === '23505') back(`${program!.name} ${cohortNo}기는 이미 있습니다. 다른 번호를 쓰십시오.`)
    console.error('[edu/createCohort]', error?.message)
    back('기수를 개설하지 못했습니다.')
  }

  revalidatePath('/edu')
  // ★무엇이 일어났는지까지 적는다 — 모집중으로 열면 «그 즉시 대외 화면»이 바뀐다.
  const opened = status === 'recruiting'
    ? ' · 모집중으로 열렸습니다(대외 화면 반영 최대 60초)'
    : ' · 준비(draft) 상태라 대외 화면에는 나가지 않습니다'
  const priceMsg = price === null ? ' · 수강료 미확정이라 신청·결제 경로는 열리지 않습니다' : ''
  redirect(`/edu/${data!.id}?msg=${encodeURIComponent(`${program!.name} ${cohortNo}기를 개설했습니다${opened}${priceMsg}`)}`)
}

/** 기수 설정 수정 — 상태·기간·정원·실행가·출석요건·장소·테스트표시. */
export async function updateCohort(cohortId: string, formData: FormData): Promise<void> {
  if (!(await isAdmin())) back('권한이 없습니다.', `/edu/${cohortId}`)

  const capacity = num(formData, 'capacity')
  const price = num(formData, 'price')
  const attendPct = num(formData, 'attend_pct_required') ?? 67
  const recruitFrom = str(formData, 'recruit_from')
  const recruitTo = str(formData, 'recruit_to')
  const startsOn = str(formData, 'starts_on')
  const endsOn = str(formData, 'ends_on')

  const bad = validate({ capacity, price, attendPct, recruitFrom, recruitTo, startsOn, endsOn })
  if (bad) back(bad, `/edu/${cohortId}`)

  const status = String(formData.get('status') || 'draft')

  const { error } = await supabaseAdmin
    .from('edu_cohorts')
    .update({
      title: str(formData, 'title'),
      subtitle: str(formData, 'subtitle'),
      status,
      recruit_from: recruitFrom,
      recruit_to: recruitTo,
      starts_on: startsOn,
      ends_on: endsOn,
      capacity,
      price,
      price_note: str(formData, 'price_note'),
      venue: str(formData, 'venue'),
      venue_confirmed: formData.get('venue_confirmed') === 'on',
      venue_note: str(formData, 'venue_note'),
      attend_pct_required: attendPct,
      payment_method: String(formData.get('payment_method') || 'transfer'),
      is_test: formData.get('is_test') === 'on',
    })
    .eq('id', cohortId)

  if (error) {
    console.error('[edu/updateCohort]', error.message)
    back('기수를 수정하지 못했습니다.', `/edu/${cohortId}`)
  }

  revalidatePath('/edu')
  revalidatePath(`/edu/${cohortId}`)
  // ★출석 요건을 바꾸면 «이미 발급된 수료증»의 근거와 달라진다. 그 사실을 여기서 말한다.
  back('기수 설정을 저장했습니다. 출석 요건을 바꾸셨다면 이미 발급된 수료증에는 그때의 요건이 남습니다.', `/edu/${cohortId}`)
}
