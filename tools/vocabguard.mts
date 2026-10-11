// vocabguard — 강사풀의 축 값이 통제 어휘를 벗어나지 않는지 운영 환경에서 전수 검사한다.
//
// ★왜 필요한가: 사전을 벗어난 값은 매칭에 «조용히» 안 붙는다. 점수가 0 으로 나오는 것이
//   아니라 그 축이 비어 보인다 — 화면에는 아무 경고도 뜨지 않는다.
// ★0건을 통과로 읽지 않는다 — 검사한 행 수와 값 수를 함께 출력하고, 행이 0이면 실패다.
// ★실패 주입으로 시험한다 — `--selftest` 는 가짜 이탈 값을 섞어 검사기가 잡는지 확인한다.
//
// ★★풀을 가려 잴 수 있다 — `--source <출처>` (matchprobe·cohortmatch 와 같은 관례).
//   왜: 출처가 섞여 있으면 **칸 검증용 데이터의 이탈이 상시 🔴 를 띄워** 운영에 쓰는 풀의
//   진짜 이탈을 묻는다[실측 2026-10-11: 이탈 6종이 전부 「테스트 시드」 5명분이고
//   `샘플풀-2026-10` 23명은 0종이었다]. 오탐은 그 자체로 누락을 만든다.
//   ⛔칸 검증용 데이터를 지우는 방식으로 풀지 않는다 — 2026-10-03 에 칸 검증을 위해
//     «일부러» 사전 밖 값을 넣어 만든 자산이고, 칸이 늘면 다시 쓴다.
//     대표님 지적(2026-10-10 「칸 검증용 테스트강사1이 실제 후보처럼 3위에 섰다」)의
//     처방도 «삭제»가 아니라 «풀을 고르게 하는 것»이었다(admin 콘솔 actions.ts).
//   ★기본값은 전체다 — 좁히는 쪽을 기본으로 두면 새 출처의 이탈을 못 본다(fail-closed).
//
// 사용: export DATABASE_URL=...  # .env.example 참조
//      npx tsx tools/vocabguard.mts [--selftest] [--source 샘플풀-2026-10]
import { execFileSync } from 'node:child_process'
import { VOCAB, strayValues, cultureMeasurable, type VocabAxis } from 'edu-instructor-match/edu/vocab'

const SELFTEST = process.argv.includes('--selftest')
const si = process.argv.indexOf('--source')
const SOURCE = si > 0 ? process.argv[si + 1] : null

type Row = {
  id: string; name: string
  expertise: string[] | null; methods: string[] | null; audience: string[] | null
  regions: string[] | null; value_profile: Record<string, number> | null
  is_test: boolean; source: string | null
}

function query<T>(sql: string): T[] {
  const out = execFileSync('kps-db-readonly.sh', [sql], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  const start = out.indexOf('[')
  if (start < 0) throw new Error(`🔴 조회 응답이 JSON 배열이 아니다:\n${out.slice(0, 400)}`)
  return JSON.parse(out.slice(start)) as T[]
}

const rows = query<Row>(`select id, name, expertise, methods, audience, regions, value_profile, is_test,
         coalesce(source, '(출처 없음)') as source
  from public.edu_instructors where deleted_at is null${
    SOURCE ? ` and source = '${SOURCE.replace(/'/g, "''")}'` : ''
  } order by name;`)

if (rows.length === 0) {
  console.error(`🔴 강사풀이 0행이다${SOURCE ? ` — 출처 「${SOURCE}」 에 강사가 없다(출처명 오타인지 본다)` : ''} — 검사 대상이 없다. 0건을 통과로 읽지 않는다.`)
  process.exit(3)
}

if (SELFTEST) {
  rows.push({
    id: 'selftest', name: '자가시험(가짜)', expertise: ['SNSmarketing'], methods: ['원격강의'],
    audience: ['신입'], regions: ['서울'], value_profile: { 재미: 1 }, is_test: true, source: '자가시험',
  })
}

const ARRAY_AXES: VocabAxis[] = ['expertise', 'methods', 'audience', 'regions']
let valuesSeen = 0
const strays = new Map<string, { axis: string; value: string; who: string[]; src: Set<string> }>()

for (const r of rows) {
  for (const axis of ARRAY_AXES) {
    const vals = (r[axis as keyof Row] as string[] | null) ?? []
    valuesSeen += vals.length
    for (const v of strayValues(axis, vals)) {
      const key = `${axis}:${v}`
      if (!strays.has(key)) strays.set(key, { axis, value: v, who: [], src: new Set() })
      strays.get(key)!.who.push(r.name); strays.get(key)!.src.add(r.source ?? '(출처 없음)')
    }
  }
  const keys = Object.keys(r.value_profile ?? {})
  valuesSeen += keys.length
  for (const v of strayValues('value_profile', keys)) {
    const key = `value_profile:${v}`
    if (!strays.has(key)) strays.set(key, { axis: 'value_profile', value: v, who: [], src: new Set() })
    strays.get(key)!.who.push(r.name); strays.get(key)!.src.add(r.source ?? '(출처 없음)')
  }
}

// C축 산출 가능 여부 — 결함이 아니라 현황이다. 측정 불가가 몇 명인지 «보이게» 한다.
const noCulture = rows.filter((r) => !cultureMeasurable(r.value_profile))

console.log(`\n═══ 통제 어휘 검사 — 강사 ${rows.length}명 · 값 ${valuesSeen}개 · 사전 ${
  Object.values(VOCAB).reduce((n, d) => n + d.length, 0)}종 ═══`)
console.log(`   범위: ${SOURCE ? `출처 「${SOURCE}」 만` : '전체 출처'} · 운영 ${
  rows.filter((r) => !r.is_test).length}명 · 테스트 ${rows.filter((r) => r.is_test).length}명`)

if (strays.size > 0) {
  console.log(`\n🔴 사전 이탈 ${strays.size}종`)
  for (const s of [...strays.values()].sort((a, b) => a.axis.localeCompare(b.axis))) {
    console.log(`   · ${s.axis} 「${s.value}」 — ${s.who.length}명 · 출처 ${[...s.src].join(', ')} (${s.who.slice(0, 2).join(', ')}${s.who.length > 2 ? ' 외' : ''})`)
  }
  // ★출처별로 갈라 센다 — 「6종 이탈」만 보면 어느 풀이 문제인지 모르고, 운영 풀이
  //   깨끗한데도 상시 🔴 로 읽힌다. 고칠 주체가 출처마다 다르다.
  const bySrc = new Map<string, Set<string>>()
  for (const s2 of strays.values())
    for (const src of s2.src) {
      if (!bySrc.has(src)) bySrc.set(src, new Set())
      bySrc.get(src)!.add(`${s2.axis}:${s2.value}`)
    }
  console.log('\n   ── 출처별 이탈 — 고칠 주체가 다르다')
  // ⛔`source` 는 null 일 수 있다 — 조회가 coalesce 로 '(출처 없음)' 을 넣지만 타입은 null 가능이다.
  //   미러 tsc 가 잡았다[2026-10-11]. 본체보다 엄격한 설정이 결함을 먼저 본 자리다.
  for (const src of [...new Set(rows.map((r) => r.source ?? '(출처 없음)'))].sort()) {
    const n = bySrc.get(src)?.size ?? 0
    const cnt = rows.filter((r) => r.source === src).length
    console.log(`   ${n === 0 ? '✅' : '🔴'} ${src} — 강사 ${cnt}명 · 이탈 ${n}종`)
  }
  console.log(`   ⇒ 특정 풀만 재려면 \`--source <출처>\` 로 좁힌다(종료코드도 그 범위로 결정된다).`)
} else {
  console.log(`\n✅ 사전 이탈 0종 — 검사 ${rows.length}명 · 값 ${valuesSeen}개${SOURCE ? ` (출처 「${SOURCE}」)` : ' (전체 출처)'}`)
}

console.log(`\nC축 측정 가능 ${rows.length - noCulture.length}명 · 측정 불가 ${noCulture.length}명(가치축 3개 미만)`)
if (noCulture.length === rows.length) {
  console.log('   ⚠️ 전원이 측정 불가다 — C축을 쓰려면 강사 프로파일에 가치축 3개 이상을 받아야 한다.')
}

if (SELFTEST) {
  const caught = [...strays.values()].filter((s) => s.who.includes('자가시험(가짜)')).length
  console.log(`\n── 자가시험: 주입한 이탈 5종 중 ${caught}종 검출`)
  process.exit(caught === 5 ? 0 : 9)
}

process.exit(strays.size === 0 ? 0 : 1)
