import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '링플 — 기업교육 과정 설계·강사 배정',
  description: '발주에서 정산까지 한 시스템. 5축 적합도 산식 기반의 기업교육 과정 설계·강사 배정 플랫폼.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
