// matchprobe — 강사 매칭이 «실제로 점수를 내는가»를 운영 환경 데이터로 잰다.
//
// ★「함수가 있다」와 「점수가 나온다」는 다른 말이다. 어휘가 어긋나거나 칸이 비면 함수는
//   조용히 0 을 낸다. 이 도구는 과정 3종의 수요로 매칭을 돌려 그 결과를 눈에 보이게 한다.
// ★0건을 통과로 읽지 않는다 — 재어 본 강사 수와 제외 수를 함께 출력하고, 풀이 비면 실패다.
//
// 사용: export DATABASE_URL=...  # .env.example 참조
//      npx tsx tools/matchprobe.mts [--source 샘플풀-2026-10]
import { execFileSync } from 'node:child_process'
import { rankInstructors, type InstructorRow, type DemandProfile } from 'edu-instructor-match/edu'

const idx = process.argv.indexOf('--source')
const SOURCE = idx > 0 ? process.argv[idx + 1] : '샘플풀-2026-10'

const out = execFileSync('kps-db-readonly.sh', [
  `select id, name, expertise, methods, audience, years, value_profile, regions, contactable, deleted_at, created_at,
          coalesce(note, '') as note
     from public.edu_instructors where source = '${SOURCE.replace(/'/g, "''")}' order by name;`,
], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
const rows = JSON.parse(out.slice(out.indexOf('['))) as InstructorRow[]

if (rows.length === 0) {
  console.error(`🔴 출처 「${SOURCE}」의 강사가 0명이다 — 잴 대상이 없다.`)
  process.exit(3)
}

// 수요 3종 — 운영 과정의 실제 커리큘럼에서 뽑았다. ⛔상상으로 만든 시나리오가 아니다.
const SCENARIOS: { name: string; demand: DemandProfile }[] = [
  {
    name: '마케팅 사내 MBA · 브랜드 포지셔닝 차수',
    demand: {
      topics: ['브랜드전략', '포지셔닝', '마케팅전략'], methods: ['강의', '사례연구'],
      audience: ['최고경영자'], minYears: 10, region: '수도권',
      values: { 실무적용: 0.9, 사례중심: 0.8, 최신동향: 0.5 },
    },
  },
  {
    name: '전기차 배터리 최고위 · 폐배터리 순환경제 주차',
    demand: {
      topics: ['폐배터리순환경제', '배터리', '전기차'], methods: ['강의', '토론'],
      audience: ['임원'], minYears: 8, region: '수도권',
    },
  },
  {
    name: '방산 최고위 · 수출 협상 주차',
    demand: {
      topics: ['방산', '수출협상', 'B2G'], methods: ['강의', '현장학습'],
      audience: ['최고경영자'], minYears: 10, region: '영남',
    },
  },
]

console.log(`\n═══ 매칭 실측 — 출처 「${SOURCE}」 강사 ${rows.length}명 ═══`)

// ★축별 «입력 충족률» — 칸이 비면 그 축은 0 또는 중립이 되고, 점수는 나오지만 재지 않은 것이다.
//   ⛔「매칭이 된다」와 「5축이 작동한다」는 다른 말이다. 명부 요청 양식은 이 표에서 역산한다.
const FILLED: { axis: string; label: string; effect: string; pick: (r: InstructorRow) => boolean }[] = [
  { axis: 'K', label: '전문 분야(expertise)', effect: '비면 주제 적합 0',
    pick: (r) => (r.expertise ?? []).length > 0 },
  { axis: 'S', label: '강의 방식(methods)', effect: '비면 방식 적합 0',
    pick: (r) => (r.methods ?? []).length > 0 },
  { axis: 'A', label: '대상 층(audience)', effect: '비면 우대요건 0',
    pick: (r) => (r.audience ?? []).length > 0 },
  { axis: 'A', label: '강의 경력 연수(years)', effect: '비면 최소 경력을 적용하지 못한다',
    pick: (r) => r.years != null },
  { axis: 'C', label: '교육 지향 3축 이상(value_profile)', effect: '비면 중립 0.5 — 재지 않은 것이다',
    pick: (r) => Object.keys(r.value_profile ?? {}).length >= 3 },
  { axis: '—', label: '출강 권역(regions)', effect: '비면 권역 요건에서 전부 탈락',
    pick: (r) => (r.regions ?? []).length > 0 },
]
// ★★대조군을 분모에서 가른다 — 대조군은 «일부러» 칸을 비워 둔 행이다.
//   섞어 세면 의도된 빈칸이 결함으로 읽힌다[실측 2026-10-11: C축 20/23(87%) 의 미달 3명이
//   전원 「(샘플·대조군)」이었다 — 「87%」만 보면 명부를 더 받아야 할 것처럼 읽힌다].
//   판별 = `note` 가 「대조군」으로 시작하는 행. ⛔이름 문자열로 가르지 않는다(표기가 바뀐다).
type WithNote = InstructorRow & { note?: string }
const isCtrl = (r: WithNote) => (r.note ?? '').startsWith('대조군')
const ctrl = (rows as WithNote[]).filter(isCtrl)
const real = (rows as WithNote[]).filter((r) => !isCtrl(r))

console.log('\n── 축별 입력 충족률 — 칸이 비면 그 축은 «재지 않은» 것이다')
console.log(`   분모 ${rows.length}명 = 후보 ${real.length} + 대조군 ${ctrl.length}(의도된 빈칸)`)
for (const f of FILLED) {
  const n = rows.filter(f.pick).length
  const nReal = real.filter(f.pick).length
  // 판정은 «후보 분모»로 한다 — 대조군까지 채우라는 요구는 그 자산을 없애라는 말이 된다.
  const mark = nReal === real.length ? '✅' : nReal === 0 ? '🔴' : '🟡'
  const tail = n !== nReal ? ` · ⇒ 후보만 ${nReal}/${real.length}명${nReal === real.length ? ' ✅전건' : ''}` : ''
  console.log(`  ${mark} ${f.axis}축 ${f.label} — ${n}/${rows.length}명(${Math.round((n / rows.length) * 100)}%) · ${f.effect}${tail}`)
}
if (ctrl.length > 0) {
  console.log(`   ── 대조군 ${ctrl.length}명(분모에서 가름) — 비어 있어야 «정상»이다`)
  for (const c of ctrl) console.log(`      · ${c.name} — ${c.note}`)
}
// ⛔`f.n` 잔재였다 — FILLED 를 pick 기반으로 바꾸면서 이 줄을 놓쳤다[미러 tsc 가 적발 2026-10-11].
//   «후보» 분모로 센다(대조군은 일부러 비운 행이라 「죽은 축」이 아니다).
const deadAxes = FILLED.filter((f) => real.filter(f.pick).length === 0).map((f) => f.label)
if (deadAxes.length) console.log(`  ⚠️ 입력이 0인 칸 ${deadAxes.length}개 — 명부 수령 시 이 칸을 함께 받아야 5축이 선다`)

let covered = 0
for (const sc of SCENARIOS) {
  const r = rankInstructors(sc.demand, rows)
  const eligible = r.ranked.filter((x) => x.match.eligible)
  const top = eligible[0]
  if (top) covered++

  console.log(`\n■ ${sc.name}`)
  console.log(`  재어 본 강사 ${r.examined}명${r.excluded.length ? ` · 제외 ${r.excluded.map((e) => `${e.reason} ${e.n}`).join(', ')}` : ''}`)
  console.log(`  적격 ${eligible.length}명 / 부적격 ${r.ranked.length - eligible.length}명(권역 등 필수요건)`)
  if (!top) {
    // ⛔「0명」만 적고 끝내지 않는다 — 왜 0인지 세어 말한다
    const why = new Map<string, number>()
    for (const m of r.ranked) for (const b of m.match.blockers) why.set(b, (why.get(b) ?? 0) + 1)
    console.log('  🔴 적격 후보가 없다 — 사유별 인원:')
    for (const [b, n] of [...why].sort((a, b2) => b2[1] - a[1])) console.log(`     · ${b} — ${n}명`)
    const best = r.ranked[0]
    if (best) console.log(`     (점수 최고 ${best.instructor.name} ${best.match.percent}점 · ${best.match.headline})`)
    continue
  }
  for (const [i, m] of eligible.slice(0, 3).entries()) {
    console.log(`  ${i + 1}위 ${m.instructor.name} ${m.match.percent}점 — ${m.match.headline}`)
    console.log(`     ${m.match.axes.map((a) => `${a.label} ${Math.round(a.score * 100)}`).join(' · ')}` +
                `${m.cultureMeasured ? '' : ' · 교육 지향 측정 불가'}`)
  }
  const worst = r.ranked[r.ranked.length - 1]
  if (!worst.match.eligible) console.log(`     (대조군 확인 — 최하위 ${worst.instructor.name}: ${worst.match.blockers.join(', ')})`)
}

console.log(`\n── 수요 ${SCENARIOS.length}종 중 적격 후보가 선 것 ${covered}종`)
if (covered < SCENARIOS.length) {
  console.log('   🔴 후보를 못 세운 수요가 있다 — 강사풀 또는 어휘를 점검한다.')
  process.exit(1)
}
