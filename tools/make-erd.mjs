// ERD 생성기 — 운영 환경의 실제 스키마에서 mermaid erDiagram 을 생성한다.
//
// ★왜 라이브에서 읽는가: 리포의 DDL 과 운영 환경이 어긋나는 일이 실제로 생긴다.
//   ERD 가 리포 파일을 읽으면 그 어긋남을 그대로 베낀다. 측정의 기준은 운영 환경이다.
// ★손으로 옮겨 적지 않는다 — 스키마가 바뀌면 다시 생성한다.
//
// 실행: bash tools/make-erd.sh   ← 수집·생성·저장을 한 번에 한다(질의 전문은 그 파일에)
//   직접 호출: node tools/make-erd.mjs <cols.json> <fks.json> <kinds.json> > docs/erd-edu.mmd

import { readFileSync } from 'node:fs'

const [colsPath, fksPath, kindsPath] = process.argv.slice(2)
if (!colsPath || !fksPath || !kindsPath) {
  console.error('사용법: node make-erd.mjs <cols.json> <fks.json> <kinds.json>')
  process.exit(2)
}

const cols  = JSON.parse(readFileSync(colsPath, 'utf8'))
const fks   = JSON.parse(readFileSync(fksPath, 'utf8'))
const kinds = JSON.parse(readFileSync(kindsPath, 'utf8'))

// 뷰는 ERD 에 그리지 않는다 — 실체가 아니라 조회 경로다.
const tables = new Set(kinds.filter((r) => r.table_type === 'BASE TABLE').map((r) => r.table_name))

// 전 표에 있는 공통 칸은 생략하고 각주로 대신한다. 그리지 않으면 ERD 가 읽힌다.
const OMIT = new Set(['created_at', 'updated_at'])

// 타입 표기 — mermaid 는 공백을 허용하지 않는다
const TYPE = {
  'uuid': 'uuid', 'text': 'text', 'integer': 'int', 'bigint': 'bigint',
  'boolean': 'bool', 'numeric': 'numeric', 'jsonb': 'jsonb', 'json': 'json',
  'date': 'date', 'timestamp with time zone': 'timestamptz',
  'timestamp without time zone': 'timestamp', 'ARRAY': 'array', 'inet': 'inet',
}
const typeOf = (t) => TYPE[t] ?? t.replace(/\s+/g, '_')

// FK 를 컬럼 단위로 색인 — PK/FK 표기에 쓴다
// 엔티티명 — auth.users 처럼 스키마가 붙은 이름은 mermaid 문법에서 쓰지 못한다
const ent = (n) => n.replace(/\./g, '_')

const fkCol = new Map()      // "표.컬럼" → 대상 표
for (const f of fks) fkCol.set(`${f.src}.${f.src_col}`, f.dst)

const byTable = new Map()
for (const c of cols) {
  if (!tables.has(c.table_name)) continue
  if (OMIT.has(c.column_name)) continue
  if (!byTable.has(c.table_name)) byTable.set(c.table_name, [])
  byTable.get(c.table_name).push(c)
}

const out = []
out.push('%% 자동 생성 — tools/make-erd.mjs · 운영 환경 스키마 실측본')
out.push('%% ⛔손으로 고치지 않는다. 스키마를 바꾼 뒤 다시 생성한다.')
const external = [...new Set(fks.map((f) => f.dst))].filter((d) => !tables.has(d))
out.push(`%% 표 ${byTable.size}개 · 관계 ${fks.length}개 · 공통 칸(created_at·updated_at)은 생략`)
out.push(`%% 외부 참조 ${external.length}종(컬럼 정의 없이 관계만 그린다): ${external.join(' · ') || '없음'}`)
out.push('erDiagram')

// 관계 — 왼쪽 기호는 «자식이 부모를 몇 개 갖는가»다.
//   FK not null → 부모 정확히 1개(||) · nullable → 0 또는 1(|o)
//   오른쪽은 항상 0개 이상(o{) — not null FK 라도 자식이 한 건도 없을 수 있다.
//   ⛔nullable 을 자식 쪽 카디널리티로 읽지 않는다. 그것은 다른 축이다.
const nullableFk = new Set(
  cols.filter((c) => c.is_nullable === 'YES').map((c) => `${c.table_name}.${c.column_name}`)
)
for (const f of fks) {
  if (!tables.has(f.src)) continue
  const optional = nullableFk.has(`${f.src}.${f.src_col}`)
  const link = optional ? '|o--o{' : '||--o{'
  const label = `${f.src_col}${f.delete_rule === 'CASCADE' ? ' ⟲' : ''}`
  out.push(`  ${ent(f.dst)} ${link} ${ent(f.src)} : "${label}"`)
}
out.push('')

for (const [t, list] of [...byTable].sort((a, b) => a[0].localeCompare(b[0]))) {
  out.push(`  ${t} {`)
  for (const c of list) {
    const key = c.column_name === 'id' ? 'PK' : fkCol.has(`${t}.${c.column_name}`) ? 'FK' : ''
    const note = c.is_nullable === 'YES' ? '"null 허용"' : ''
    out.push(`    ${typeOf(c.data_type)} ${c.column_name}${key ? ' ' + key : ''}${note ? ' ' + note : ''}`)
  }
  out.push('  }')
}

console.log(out.join('\n'))
