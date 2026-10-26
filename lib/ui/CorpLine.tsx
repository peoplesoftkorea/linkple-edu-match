import React from 'react'

// 공개판 법인 식별 한 줄 — 미러 전용.
//
// ★왜 따로 두나: 정본 `packages/ui/CorpLine.tsx` 는 `brand/offering.json`(운영 법인의 상호·
//   대표자·사업자등록번호·통신판매업 신고번호·본점 주소·대표번호)을 SSOT 로 읽는다.
//   제출 요건이 「수료 이후에도 공개 유지」라 그 값이 한 번 나가면 되돌릴 수 없다.
// ★담는 것은 «형상»이고 담지 않는 것은 «값»이다 — props 와 렌더 구조는 정본과 같게 두어
//   이 컴포넌트를 쓰는 화면이 그대로 돌고, facts 자리는 역할명으로 바꾼다.

export function CorpLine({
  children,
  email = true,
  biz = true,
  mailOrder = true,
  addr = true,
  phone = true,
  className = 'corp',
}: {
  children?: React.ReactNode
  email?: boolean
  biz?: boolean
  mailOrder?: boolean
  addr?: boolean
  phone?: boolean
  className?: string
  // ⛔`style` prop 은 두지 않는다 — 값은 클래스·CSS 토큰이 쥔다(디자인 시스템 ESLint
  //   kps/no-inline-style). 정본에는 남아 있으나 미러에서 그것을 넘기는 호출부가 없다.
}) {
  // 미러는 시연용이므로 법인 facts 를 표시하지 않는다 — 발행 주체를 역할명으로만 적는다.
  void email; void biz; void mailOrder; void addr; void phone
  return (
    <div className={className}>
      <span className="nb">운영사</span>
      {children ? <> · {children}</> : null}
    </div>
  )
}
export default CorpLine
