// vocabguard — 강사풀의 축 값이 통제 어휘를 벗어나지 않는지 운영 환경에서 전수 검사한다.
//
// ★왜 필요한가: 사전을 벗어난 값은 매칭에 «조용히» 안 붙는다. 점수가 0 으로 나오는 것이
//   아니라 그 축이 비어 보인다 — 화면에는 아무 경고도 뜨지 않는다.
// ★0건을 통과로 읽지 않는다 — 검사한 행 수와 값 수를 함께 출력하고, 행이 0이면 실패다.
// ★실패 주입으로 시험한다 — `--selftest` 는 가짜 이탈 값을 섞어 검사기가 잡는지 확인한다.
//
// 사용: export DATABASE_URL=...  # .env.example 참조
//      npx tsx tools/vocabguard.mts [--selftest]
import { execFileSync } from 'node:child_process'
import { VOCAB, strayValues, cultureMeasurable, type VocabAxis } from 'edu-instructor-match/edu/vocab'

const SELFTEST = process.argv.includes('--selftest')

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
  from public.edu_instructors where deleted_at is null order by name;`)

if (rows.length === 0) {
  console.error('🔴 강사풀이 0행이다 — 검사 대상이 없다. 0건을 통과로 읽지 않는다.')
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
console.log(`   내역: 운영 ${rows.filter((r) => !r.is_test).length}명 · 테스트 ${rows.filter((r) => r.is_test).length}명`)

if (strays.size > 0) {
  console.log(`\n🔴 사전 이탈 ${strays.size}종`)
  for (const s of [...strays.values()].sort((a, b) => a.axis.localeCompare(b.axis))) {
    console.log(`   · ${s.axis} 「${s.value}」 — ${s.who.length}명 · 출처 ${[...s.src].join(', ')} (${s.who.slice(0, 2).join(', ')}${s.who.length > 2 ? ' 외' : ''})`)
  }
} else {
  console.log('\n✅ 사전 이탈 0종')
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
