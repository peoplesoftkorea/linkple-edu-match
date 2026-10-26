// import-roster — 강사 명부(CSV)를 통제 어휘로 표준화해 적재 SQL 로 만든다.
//
// ★명부는 사람이 자유롭게 쓴다. 「디지털전환·클라우드」 한 칸이 사전에서는 두 값이고
//   「서울」은 권역 「수도권」이다. 표준화 규칙의 정본은 lib/matching/vocab.ts 다.
// ★이력 요약에서 «경력 연수와 대상 층»을 추출한다 — 그 두 칸을 따로 청하면 수령이 늦어진다.
// ⛔DB 에 직접 쓰지 않는다. SQL 을 내고 적용은 사람이 한다(kps-migrate.sh).
// ⛔사전에 없는 말을 억지로 매핑하지 않는다 — 이탈로 보고하고 사람이 사전에 먼저 넣는다.
//
// 사용:
//   npx tsx tools/import-roster.mts --csv <파일> --source "<출처>"          # 미리보기
//   npx tsx tools/import-roster.mts --csv <파일> --source "<출처>" --sql     # 적재 SQL
//   npx tsx tools/import-roster.mts --restandardize <출처> [--sql]           # 기존 행 재표준화
//   npx tsx tools/import-roster.mts --selftest                               # 자가시험
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import {
  normalizeExpertise, normalizeRegion, extractYears, extractAudience,
  strayValues, extractMethods, VOCAB, type Audience, type Expertise, type Method, type Region,
} from '@/lib/matching/vocab'

const argv = process.argv.slice(2)
const flag = (name: string) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined }
const has = (name: string) => argv.includes(name)

type Parsed = {
  name: string
  expertise: Expertise[]
  methods: string[]
  audience: Audience[]
  years: number | null
  regions: Region[]
  dayRate: number | null
  contactable: boolean
  valueProfile: Record<string, number> | null
  career: string | null
  // ★재표준화에서 «잃으면 안 되는» 칸. 표준화는 표기를 고치는 일이지 데이터를 버리는 일이 아니다.
  note: string | null
  isTest: boolean
  strays: { axis: string; value: string }[]
}

// ── CSV — 따옴표 안의 쉼표를 지킨다. ⛔split(',') 한 줄로 처리하지 않는다.
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], cell = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') q = false
      else cell += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = '' }
    else if (c !== '\r') cell += c
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows.filter((r) => r.some((c) => c.trim()))
}

const splitList = (s: string) => s.split(/[,;·\/]/).map((t) => t.trim()).filter(Boolean)

// ★헤더 표기는 흔들린다 — 먼저 나간 양식은 「전문 분야」·「강의 이력(요약)」처럼 공백과 괄호를
//   쓴다. 그 양식으로 받은 명부를 못 읽으면 임포터는 «0건»을 내고, 0건은 조용하다.
//   ⇒ 공백·괄호·중점을 지우고 별칭까지 본다. 2026-10-06 에 실제로 어긋나 있었다.
const HEADER_ALIAS: Record<string, string> = {
  '성명': '성명', '이름': '성명', '강사명': '성명',
  '전문분야': '전문분야', '분야': '전문분야', '전문영역': '전문분야',
  '강의이력요약': '강의이력요약', '강의이력': '강의이력요약', '이력': '강의이력요약', '경력': '강의이력요약',
  '출강지역': '출강지역', '출강가능지역': '출강지역', '지역': '출강지역', '활동지역': '출강지역',
  '희망단가': '희망단가', '희망단가회당': '희망단가', '단가': '희망단가', '회당단가': '희망단가',
  '연락가능': '연락가능', '연락가능여부': '연락가능', '연락': '연락가능',
  '강의방식': '강의방식', '방식': '강의방식', '교육방식': '강의방식',
  '대상층': '대상층', '대상': '대상층', '교육대상': '대상층',
  '교육지향': '교육지향', '지향': '교육지향', '강의지향': '교육지향',
  '경력연수': '경력연수', '연수': '경력연수',
  '비고': '비고', '메모': '비고', '참고': '비고',
  '테스트': '테스트',
}

/** 헤더 한 칸을 표준 이름으로. 모르는 칸은 원래 이름을 그대로 둔다(버리지 않는다). */
function canonHeader(raw: string): string {
  const squeezed = raw.trim().replace(/[\s()（）·.\-_]/g, '')
  return HEADER_ALIAS[squeezed] ?? raw.trim()
}

function parseValueProfile(raw: string): Record<string, number> | null {
  const out: Record<string, number> = {}
  for (const pair of splitList(raw)) {
    const m = pair.match(/^(.+?)\s*[:=]\s*([0-9.]+)$/)
    if (!m) continue
    const v = Number(m[2])
    if (Number.isFinite(v) && v >= 0 && v <= 1) out[m[1].trim()] = v
  }
  return Object.keys(out).length ? out : null
}

/** 한 사람 분을 표준화한다. 비어 있는 칸은 «비운다» — 지어내지 않는다. */
function standardize(rec: Record<string, string>): Parsed {
  const strays: { axis: string; value: string }[] = []

  const expertise: Expertise[] = []
  for (const token of splitList(rec['전문분야'] ?? '')) {
    const { hit, stray } = normalizeExpertise(token)
    expertise.push(...hit)
    for (const s of stray) strays.push({ axis: 'expertise', value: s })
  }

  const regions: Region[] = []
  for (const token of splitList(rec['출강지역'] ?? '')) {
    const { hit, stray } = normalizeRegion(token)
    if (hit) regions.push(hit)
    else if (stray) strays.push({ axis: 'regions', value: stray })
  }

  const career = (rec['강의이력요약'] ?? '').trim() || null
  // 대상 층은 적어 준 칸이 우선이고, 없으면 이력 요약에서 추출한다.
  const given = splitList(rec['대상층'] ?? '')
  const audience = given.length
    ? (given.filter((g) => (VOCAB.audience as readonly string[]).includes(g)) as Audience[])
    : extractAudience(career, rec['대상층'])
  for (const s of strayValues('audience', given)) strays.push({ axis: 'audience', value: s })

  // 적어 준 칸이 우선이고, 없으면 이력 요약에서 추출한다(대상 층과 같은 규칙).
  const givenMethods = splitList(rec['강의방식'] ?? '')
  for (const s of strayValues('methods', givenMethods)) strays.push({ axis: 'methods', value: s })
  const methods: Method[] = givenMethods.length
    ? (givenMethods.filter((m) => (VOCAB.methods as readonly string[]).includes(m)) as Method[])
    : extractMethods(career, rec['강의방식'])

  const vp = parseValueProfile(rec['교육지향'] ?? '')
  if (vp) for (const s of strayValues('value_profile', Object.keys(vp))) strays.push({ axis: 'value_profile', value: s })

  const rateRaw = (rec['희망단가'] ?? '').replace(/[^0-9]/g, '')
  const contactRaw = (rec['연락가능'] ?? '').trim()

  return {
    name: (rec['성명'] ?? '').trim(),
    expertise: [...new Set(expertise)],
    methods: [...new Set(methods)],
    audience: [...new Set(audience)],
    years: Number(rec['경력연수']) || extractYears(career),
    regions: [...new Set(regions)],
    dayRate: rateRaw ? Number(rateRaw) : null,
    // ⛔빈 칸을 「불가」로 읽지 않는다 — 안 적은 것과 안 된다는 것은 다른 말이다.
    contactable: contactRaw ? !/불가|아니|no|false/i.test(contactRaw) : true,
    valueProfile: vp,
    career,
    note: (rec['비고'] ?? '').trim() || null,
    // ⛔기본값을 false 로 두지 않는다 — 가상 인물 샘플이 실데이터로 둔갑한다.
    //   재표준화는 기존 값을 그대로 넘겨 주고, CSV 적재는 --test 로만 true 가 된다.
    isTest: /^(true|1|y|yes)$/i.test((rec['테스트'] ?? '').trim()),
    strays,
  }
}

const sq = (s: string) => `'${s.replace(/'/g, "''")}'`
const arr = (xs: string[]) => (xs.length ? `array[${xs.map(sq).join(',')}]` : `'{}'::text[]`)

function toSql(rows: Parsed[], source: string): string {
  const L: string[] = []
  L.push(`-- 강사 명부 적재 — 출처 ${sq(source)} · ${rows.length}명`)
  L.push(`-- ⛔재실행 안전: 같은 출처를 먼저 삭제한다. 다른 출처는 건드리지 않는다.`)
  L.push(`begin;`)
  L.push(`delete from public.edu_instructors where source = ${sq(source)};`)
  L.push(`insert into public.edu_instructors`)
  L.push(`  (name, expertise, methods, audience, years, regions, day_rate, value_profile, career, note, contactable, source, is_test)`)
  L.push(`values`)
  L.push(rows.map((r) =>
    `  (${sq(r.name)}, ${arr(r.expertise)}, ${arr(r.methods)}, ${arr(r.audience)}, ` +
    `${r.years ?? 'null'}, ${arr(r.regions)}, ${r.dayRate ?? 'null'}, ` +
    `${r.valueProfile ? `${sq(JSON.stringify(r.valueProfile))}::jsonb` : 'null'}, ` +
    `${r.career ? sq(r.career) : 'null'}, ${r.note ? sq(r.note) : 'null'}, ${r.contactable}, ${sq(source)}, ${r.isTest})`
  ).join(',\n') + ';')
  L.push(`commit;`)
  return L.join('\n')
}

function report(rows: Parsed[], source: string) {
  const strays = new Map<string, number>()
  for (const r of rows) for (const s of r.strays) strays.set(`${s.axis}:${s.value}`, (strays.get(`${s.axis}:${s.value}`) ?? 0) + 1)

  console.log(`\n═══ 명부 표준화 — 출처 「${source}」 · ${rows.length}명 ═══`)
  const fill = (f: (r: Parsed) => boolean) => `${rows.filter(f).length}/${rows.length}`
  console.log(`  전문분야 ${fill((r) => r.expertise.length > 0)} · 권역 ${fill((r) => r.regions.length > 0)} · ` +
              `경력연수 ${fill((r) => r.years != null)} · 대상층 ${fill((r) => r.audience.length > 0)} · ` +
              `강의방식 ${fill((r) => r.methods.length > 0)} · 교육지향 ${fill((r) => Object.keys(r.valueProfile ?? {}).length >= 3)}`)

  const tests = rows.filter((r) => r.isTest).length
  console.log(`  테스트 표시 ${tests}명 / 운영 ${rows.length - tests}명 · 비고 보존 ${rows.filter((r) => r.note).length}명`)

  const noName = rows.filter((r) => !r.name).length
  const noExp = rows.filter((r) => r.expertise.length === 0).map((r) => r.name || '(이름 없음)')
  if (noName) console.log(`  🔴 성명이 빈 행 ${noName}건 — 적재되지 않는다`)
  if (noExp.length) console.log(`  🔴 전문분야가 비어 매칭이 서지 않는 강사 ${noExp.length}명: ${noExp.slice(0, 5).join(', ')}`)

  if (strays.size) {
    console.log(`\n  🟡 사전에 없는 말 ${strays.size}종 — 매핑하지 않고 버렸다. 사전에 넣을 값이면 vocab.ts 에 먼저 추가한다`)
    for (const [k, n] of [...strays].sort((a, b) => b[1] - a[1])) console.log(`     · ${k} (${n}건)`)
  } else {
    console.log(`\n  ✅ 사전 이탈 0종`)
  }
}

// ══════════════════════════════════════════════════════════════════════════════
if (has('--selftest')) {
  // 헤더는 «먼저 나간 양식»의 표기로 쓴다 — 공백·괄호가 있는 쪽이 실제로 돌아다닌다.
  const csv = [
    '성명,전문 분야,강의 이력(요약),출강 가능 지역,희망 단가(회당),연락 가능 여부',
    '예) 홍길동,마케팅전략,예시 행이다,수도권,100만원,가능',
    '김표준,"브랜드, 디지털전환·클라우드","대기업 마케팅 임원 15년 · CEO 대상 강의",서울,"1,200,000",가능',
    '이이탈,"투자판단, SNS 실전","팀장 대상 워크숍 8년",부산,900000,',
    '박연락,"방산","실무자 교육 3년",대구,,불가',
  ].join('\n')
  const rows = parseCsv(csv)
  const head = rows[0].map(canonHeader)
  const parsed = rows.slice(1)
    .map((r) => standardize(Object.fromEntries(head.map((h, i) => [h, r[i] ?? '']))))
    .filter((p) => p.name && !/^예\s*[)）]/.test(p.name))
  report(parsed, '자가시험')

  const checks: [string, boolean][] = [
    ['브랜드 → 브랜드전략', parsed[0].expertise.includes('브랜드전략')],
    ['한 칸이 두 값(디지털전환·클라우드)', parsed[0].expertise.includes('AXDX') && parsed[0].expertise.includes('클라우드')],
    ['서울 → 수도권', parsed[0].regions.includes('수도권')],
    ['이력에서 경력 15년 추출', parsed[0].years === 15],
    ['이력에서 대상 층 추출(임원·최고경영자)', parsed[0].audience.includes('임원') && parsed[0].audience.includes('최고경영자')],
    ['단가 쉼표 제거', parsed[0].dayRate === 1200000],
    ['사전에 없는 말은 버린다(투자판단)', !parsed[1].expertise.some((e) => String(e) === '투자판단')],
    ['SNS 실전 → SNS마케팅', parsed[1].expertise.includes('SNS마케팅')],
    ['부산 → 영남', parsed[1].regions.includes('영남')],
    ['빈 연락 칸은 「가능」', parsed[1].contactable === true],
    ['「불가」는 불가', parsed[2].contactable === false],
    ['이탈이 보고된다', parsed[1].strays.some((s) => s.value === '투자판단')],
    ['공백·괄호 헤더를 읽는다', parsed[0].name === '김표준' && parsed[0].expertise.length > 0],
    ['예시 행은 사람으로 세지 않는다', !parsed.some((p) => /^예\s*[)）]/.test(p.name))],
    ['이력에서 강의 방식 추출', parsed[0].methods.includes('강의')],
  ]
  console.log('\n── 자가시험')
  let bad = 0
  for (const [name, ok] of checks) { console.log(`  ${ok ? '✅' : '🔴'} ${name}`); if (!ok) bad++ }
  console.log(`  결과: 통과 ${checks.length - bad} · 실패 ${bad}`)
  process.exit(bad === 0 ? 0 : 1)
}

const source = flag('--source')
const csvPath = flag('--csv')
const restd = flag('--restandardize')

if (csvPath) {
  if (!source) { console.error('🔴 --source 를 지정한다. 명부를 교체·되돌릴 때 이 값 하나로 구분한다.'); process.exit(2) }
  const rows = parseCsv(readFileSync(csvPath, 'utf8'))
  const head = rows[0].map(canonHeader)
  const unknown = rows[0].map((h) => h.trim()).filter((h, i) => head[i] === h && !Object.values(HEADER_ALIAS).includes(h))
  if (unknown.length) console.log(`  🟡 알 수 없는 칸 ${unknown.length}개 — 무시한다: ${unknown.join(', ')}`)
  const asTest = has('--test')
  const parsed = rows.slice(1)
    .map((r) => standardize({ ...Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])), 테스트: asTest ? 'true' : '' }))
    // ⛔양식의 예시 행을 사람으로 적재하지 않는다. 먼저 나간 양식은 「예) 홍길동」을 쓴다.
    .filter((p) => p.name && !/^예\s*[)）]/.test(p.name) && p.name !== '홍길동')
  if (!parsed.length) { console.error('🔴 적재할 행이 0건이다 — 헤더가 양식과 같은지 확인한다.'); process.exit(3) }
  report(parsed, source)
  if (has('--sql')) { console.log(); console.log(toSql(parsed, source)) }
  process.exit(0)
}

if (restd) {
  // 기존 행을 다시 표준화한다 — 사전이 늘거나 추출 규칙이 좋아지면 이 경로로 따라잡는다.
  const out = execFileSync('kps-db-readonly.sh', [
    `select name, expertise, methods, audience, years, regions, day_rate, value_profile, career, note,
            contactable, is_test
       from public.edu_instructors where source = '${restd.replace(/'/g, "''")}' and deleted_at is null order by name;`,
  ], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  const live = JSON.parse(out.slice(out.indexOf('['))) as Record<string, unknown>[]
  if (!live.length) { console.error(`🔴 출처 「${restd}」의 강사가 0명이다.`); process.exit(3) }
  const parsed = live.map((r) => standardize({
    성명: String(r.name ?? ''),
    전문분야: ((r.expertise as string[]) ?? []).join(','),
    강의이력요약: String(r.career ?? ''),
    출강지역: ((r.regions as string[]) ?? []).join(','),
    희망단가: r.day_rate == null ? '' : String(r.day_rate),
    연락가능: r.contactable === false ? '불가' : '가능',
    강의방식: ((r.methods as string[]) ?? []).join(','),
    대상층: ((r.audience as string[]) ?? []).join(','),
    경력연수: r.years == null ? '' : String(r.years),
    교육지향: Object.entries((r.value_profile as Record<string, number>) ?? {}).map(([k, v]) => `${k}:${v}`).join(','),
    비고: String(r.note ?? ''),
    테스트: r.is_test === true ? 'true' : 'false',
  }))
  report(parsed, restd)
  if (has('--sql')) { console.log(); console.log(toSql(parsed, restd)) }
  process.exit(0)
}

console.error('🔴 --csv <파일> · --restandardize <출처> · --selftest 중 하나를 지정한다.')
process.exit(2)
