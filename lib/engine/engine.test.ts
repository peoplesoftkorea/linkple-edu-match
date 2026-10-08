// 매칭 엔진 검증 — 경계값 + ★반사실 공정성(배포 게이트).
// 실행: npx tsx lib/engine/engine.test.ts
import { matchScore, rankCandidates, profileCorrelation, type JobProfile, type CandidateProfile } from './engine'

let fail = 0
const t = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? '✅' : '🔴'} ${name} — ${JSON.stringify(got)}${ok ? '' : ` (기대 ${JSON.stringify(want)})`}`)
}
const near = (name: string, got: number, want: number, tol = 2) => {
  const ok = Math.abs(got - want) <= tol
  if (!ok) fail++
  console.log(`${ok ? '✅' : '🔴'} ${name} — ${got}${ok ? '' : ` (기대 ${want}±${tol})`}`)
}

const JOB: JobProfile = {
  mustHave: ['대학 행정 경력'],
  niceToHave: ['학사정보시스템'],
  knowledge: ['학사행정', '수강신청', '졸업사정'],
  skills: ['엑셀', '학사정보시스템', '민원응대'],
  minYears: 3,
  values: { 정확성: 0.9, 협업: 0.8, 주도성: 0.4, 고객지향: 0.7 },
  work: { pattern: '9-6', remote: 'onsite', regionCode: '1141', overtime: 1 },
}
const FIT: CandidateProfile = {
  knowledge: ['학사행정', '수강신청', '졸업사정 운영'],
  skills: ['엑셀 고급', '학사정보시스템', '민원응대'],
  years: 6,
  credentials: ['대학 행정 경력 6년'],
  values: { 정확성: 0.85, 협업: 0.75, 주도성: 0.35, 고객지향: 0.7 },
  work: { patterns: ['9-6'], remote: 'onsite', regionCode: '1141', overtimeTolerance: 2 },
}

console.log('── 기본 동작')
const m = matchScore(JOB, FIT)
t('적격', m.eligible, true)
console.log(`   매칭율 ${m.percent}% · ${m.headline}`)
t('축 5개', m.axes.length, 5)
t('모든 축이 사유를 갖는다', m.axes.every((a) => a.reasons.length > 0), true)

console.log('\n── 하드 필터: 필수요건은 총점으로 상쇄되지 않는다')
const noCred: CandidateProfile = { ...FIT, credentials: [], years: 1 }
const m2 = matchScore(JOB, noCred)
t('부적격', m2.eligible, false)
t('차단 사유 명시', m2.blockers.length > 0, true)
console.log(`   ${m2.blockers.join(' / ')}`)

console.log('\n── L축: 근무형태')
const remoteWant: CandidateProfile = { ...FIT, work: { ...FIT.work, remote: 'remote' } }
const mr = matchScore(JOB, remoteWant)
const lFit = m.axes.find((a) => a.axis === 'L')!.score
const lRemote = mr.axes.find((a) => a.axis === 'L')!.score
t('전면출근 공고에 전면원격 희망 = L 하락', lRemote < lFit, true)
console.log(`   L ${(lFit * 100).toFixed(0)} → ${(lRemote * 100).toFixed(0)}`)

const farAway: CandidateProfile = { ...FIT, work: { ...FIT.work, regionCode: '4713' } }
t('광역권 다르면 L 하락', matchScore(JOB, farAway).axes.find((a) => a.axis === 'L')!.score < lFit, true)

const nightOnly: CandidateProfile = { ...FIT, work: { ...FIT.work, patterns: ['night'] } }
t('시간대 불가면 L 크게 하락', matchScore(JOB, nightOnly).axes.find((a) => a.axis === 'L')!.score < 0.65, true)

console.log('\n── C축: 프로파일 상관(형태 유사도)')
// 절대값이 낮아도 «상대적 우선순위»가 같으면 높아야 한다 — 코사인이 아니라 상관을 쓴 이유
const lowFlat = profileCorrelation({ a: 0.9, b: 0.8, c: 0.4, d: 0.7 }, { a: 0.45, b: 0.4, c: 0.2, d: 0.35 })!
near('절대값 절반이어도 형태 같으면 高', Math.round(lowFlat * 100), 100, 3)
const inverted = profileCorrelation({ a: 0.9, b: 0.8, c: 0.4, d: 0.7 }, { a: 0.2, b: 0.3, c: 0.9, d: 0.5 })!
t('우선순위가 뒤집히면 低', inverted < 0.2, true)
t('축 3개 미만이면 측정 불가(null)', profileCorrelation({ a: 1, b: 0 }, { a: 1, b: 0 }), null)

console.log('\n── ★반사실 공정성(배포 게이트)')
// 보호속성의 대리변수를 바꿔도 점수가 변하면 안 된다.
// 엔진 입력에 성별·연령·학교·지역명이 없으므로 «변할 수 없어야» 정상이다 — 실측으로 확인한다.
const proxies: Array<[string, CandidateProfile]> = [
  ['여성 표지 어휘 주입', { ...FIT, knowledge: [...FIT.knowledge, '여성인재 리더십 과정 수료'] }],
  ['남성 표지 어휘 주입', { ...FIT, knowledge: [...FIT.knowledge, '군 복무 만기 전역'] }],
  ['명문대 표지', { ...FIT, credentials: [...FIT.credentials, '서울대학교 졸업'] }],
  ['지방대 표지', { ...FIT, credentials: [...FIT.credentials, '지방 사립대 졸업'] }],
  ['경력 공백 서술', { ...FIT, credentials: [...FIT.credentials, '육아휴직 2년'] }],
]
const base = m.percent
let maxDrift = 0
for (const [label, p] of proxies) {
  const d = Math.abs(matchScore(JOB, p).percent - base)
  maxDrift = Math.max(maxDrift, d)
  console.log(`   ${d <= 2 ? '✅' : '🔴'} ${label}: 변동 ${d}p`)
}
t('대리변수 치환 시 점수 변동 ≤ 2p', maxDrift <= 2, true)

console.log('\n── 랭킹: 동점 tie-break가 결정적인가')
const items = [
  { id: 'b', appliedAt: '2026-08-23T10:00:00Z', profile: FIT },
  { id: 'a', appliedAt: '2026-08-23T09:00:00Z', profile: FIT },
  { id: 'c', appliedAt: '2026-08-23T11:00:00Z', profile: noCred },
]
const r1 = rankCandidates(JOB, items).map((x) => x.id)
const r2 = rankCandidates(JOB, [...items].reverse()).map((x) => x.id)
t('입력 순서가 달라도 결과 동일(결정적)', r1, r2)
t('동점은 먼저 지원한 순', r1.slice(0, 2), ['a', 'b'])
t('부적격은 뒤로', r1[2], 'c')

console.log(fail === 0 ? '\n✅ 전건 통과' : `\n🔴 ${fail}건 실패`)
process.exit(fail === 0 ? 0 : 1)
