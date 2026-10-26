import Link from 'next/link'

// 미러 진입 화면 — 심사자가 처음 보는 자리.
//
// ★여기서 할 일은 «무엇을 하는 제품인지»와 «어디로 들어가는지» 둘뿐이다.
//   기능 설명을 늘리지 않는다 — 기능은 콘솔에서 직접 눌러 보는 것이 낫다.
// ⛔「구축 중」 같은 상태 문구를 손으로 적지 않는다. 종전 판이 그랬고, 사업 본체가
//   다 지어진 뒤에도 그 문구가 15일간 그대로 공개돼 있었다(2026-10-26 적발).

const FLOW = [
  { step: '1', title: '발주 접수', desc: '기업의 교육 발주를 등록하고 상태를 전이한다' },
  { step: '2', title: '강사 배정', desc: '주제·방식·경력대상·교육지향 네 축으로 후보를 산출하고 운영자가 확정한다' },
  { step: '3', title: '계약·서명', desc: '확정된 위촉에서 계약서를 생성하고 양측이 전자서명한다' },
  { step: '4', title: '정산', desc: '수료 판정 뒤 강사료를 산정하고 원천징수를 적용한다' },
]

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <p className="text-xs font-bold tracking-wide text-muted-foreground">링플 · Linkple</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">기업교육 과정 설계 · 강사 배정</h1>
      <p className="mt-3 max-w-xl text-muted-foreground">
        교육 발주를 받아 과정을 설계하고, 적합한 강사를 배정하고, 계약·실시·정산까지 한 시스템에서 처리합니다.
      </p>

      <ol className="mt-10 grid gap-3 sm:grid-cols-2">
        {FLOW.map((f) => (
          <li key={f.step} className="rounded-lg border p-4">
            <div className="text-xs font-bold text-muted-foreground">{f.step}</div>
            <div className="mt-1 font-medium">{f.title}</div>
            <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
          </li>
        ))}
      </ol>

      <div className="mt-10">
        <Link
          href="/edu"
          className="inline-flex items-center rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          운영 콘솔 열기 →
        </Link>
        <p className="mt-3 text-xs text-muted-foreground">
          시연용 공개본입니다. 표시되는 값은 모두 시드 데이터이며 실제 거래·개인정보가 아닙니다.
        </p>
      </div>
    </main>
  )
}
