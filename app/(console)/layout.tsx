import Link from 'next/link'

// 미러의 콘솔 셸 — 운영자 화면을 감싸는 틀.
//
// ★왜 운영 콘솔의 레이아웃 정본을 담지 않나: 그것은 운영 전체의 사이드바를 세우고,
//   거기에는 이 제품과 무관한 메뉴가 함께 있다. 추출하면 미러에 «열리지 않는 메뉴»가
//   줄줄이 나온다.
// ★그리고 정본은 비로그인 접근을 `redirect` 로 막는다. 미러는 심사자가 로그인 없이
//   화면을 열 수 있어야 한다(RFP §9 「배포 URL 종단간 동작」).
// ⛔여기에 기능을 넣지 않는다 — 이 파일은 «틀»이고, 화면은 전부 추출되는 쪽에 있다.

const NAV = [
  { href: '/edu', label: '대시보드' },
  { href: '/edu/orders', label: '발주' },
  { href: '/edu/matching', label: '강사 배정' },
  { href: '/edu/pricing', label: '단가 분석' },
  { href: '/edu/payouts', label: '정산' },
  { href: '/edu/notifications', label: '알림' },
  { href: '/edu/aftercare', label: '사후관리' },
]

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <Link href="/" className="text-sm font-bold">
            링플 운영 콘솔
          </Link>
          <nav className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="text-muted-foreground hover:text-foreground">
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      {/* 시연본임을 화면이 스스로 말한다 — 심사자가 실데이터로 오해하지 않도록 한다 */}
      <p className="border-b bg-muted/40 px-4 py-2 text-center text-xs text-muted-foreground">
        시연용 공개본입니다. 표시되는 값은 모두 시드 데이터이며 실제 거래·개인정보가 아닙니다.
      </p>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  )
}
