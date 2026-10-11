export default function Home() {
  return (
    <main className="wrap" style={{ paddingBlock: 64 }}>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--brand-deep)', letterSpacing: '.02em' }}>
        링플 · Linkple
      </p>
      <h1 style={{ fontSize: 34, lineHeight: 1.3, margin: '10px 0 14px', letterSpacing: '-.02em' }}>
        기업교육 과정 설계 · 강사 배정
      </h1>
      <p style={{ margin: 0, color: 'var(--muted)', maxWidth: 560 }}>
        발주에서 정산까지 한 시스템에서 처리합니다. 5축 적합도 산식으로 과정에 맞는 강사를 배정합니다.
      </p>

      {/* 🔴여기는 골격이다 — 화면은 페이즈 1~4 에서 차례로 선다(WBS W-06 이후).
          지금 단계의 완료조건은 「빌드가 서고 배포 URL 이 응답한다」까지다. */}
      <section style={{ marginTop: 40, padding: 20, background: 'var(--surface)',
        border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        <h2 style={{ fontSize: 15, margin: '0 0 10px' }}>구축 현황</h2>
        <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--slate)', fontSize: 14 }}>
          <li>5축 적합도 산식 · 통제 어휘 · 명부 임포터 — 서 있음</li>
          <li>데이터 모델 13 엔티티 — ERD 초판 <code>docs/erd.png</code></li>
          <li>화면·인증·발주 CRUD — 구축 중</li>
        </ul>
      </section>
    </main>
  )
}
