'use client'
// 분석 동의 배너.
//
// ★「동의는 사람이 하는 것이다」 — 배포 env 로 켜고 끄면 그것은 이용자의 답이 아니라 우리 스위치다.
//   사람 단위로 저장하고(localStorage), 동의가 «있을 때만» SDK 를 만든다.
// ⛔거부를 기본값으로 둔다. 무응답 = 거부다.
import { useEffect, useState } from 'react'
import { initAnalytics } from './index'

const KEY = 'lp_consent_analytics'

export function AnalyticsConsent() {
  const [asked, setAsked] = useState(true)   // 깜빡임 방지 — 읽기 전에는 띄우지 않는다

  useEffect(() => {
    const v = localStorage.getItem(KEY)
    if (v === 'granted') { void initAnalytics(); return }
    if (v === 'denied') return
    setAsked(false)
  }, [])

  if (asked) return null

  const answer = (ok: boolean) => {
    localStorage.setItem(KEY, ok ? 'granted' : 'denied')
    setAsked(true)
    if (ok) void initAnalytics()
  }

  return (
    <div role="dialog" aria-label="분석 쿠키 사용 안내" style={{
      position: 'fixed', left: 16, right: 16, bottom: 16, maxWidth: 'var(--container-narrow)', zIndex: 50,
      background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
      padding: 16, boxShadow: 'var(--shadow)', fontSize: 13, lineHeight: 1.7,
    }}>
      <p style={{ margin: '0 0 12px', color: 'var(--slate)' }}>
        서비스 개선을 위해 방문·이용 기록을 분석합니다. 거부하셔도 이용에 제한이 없습니다.
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => answer(false)} style={btn(false)}>거부</button>
        <button onClick={() => answer(true)} style={btn(true)}>동의</button>
      </div>
    </div>
  )
}

const btn = (primary: boolean): React.CSSProperties => ({
  flex: 1, height: 40, borderRadius: 'var(--radius-ctl)', fontSize: 13, fontWeight: 650,
  cursor: 'pointer',
  background: primary ? 'var(--brand)' : '#fff',
  color: primary ? '#fff' : 'var(--slate)',
  border: `1px solid ${primary ? 'var(--brand)' : 'var(--border)'}`,
})
