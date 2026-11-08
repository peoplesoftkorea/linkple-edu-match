'use client'
// 분석 동의 배너.
//
// ★「동의는 사람이 하는 것이다」 — 배포 env 로 켜고 끄면 그것은 이용자의 답이 아니라 우리 스위치다.
//   사람 단위로 저장하고(localStorage), 동의가 «있을 때만» SDK 를 만든다.
// ⛔거부를 기본값으로 둔다. 무응답 = 거부다.
// ⛔본체(linkple-web) 토큰(--brand·--shadow·--container-narrow·--radius-ctl)은 이 리포에 없다 — 이 리포 토큰+기본값만 쓴다
//   [2026-11-09 대표님 지적: 배너가 스타일 없이 바닥에 맨글자로 노출, 「동의」 버튼은 흰 글자·투명 배경으로 안 보였다].
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
      position: 'fixed', left: 16, bottom: 16, width: 'calc(100% - 32px)', maxWidth: 400, zIndex: 50,
      background: 'hsl(var(--card, 0 0% 100%))', border: '1px solid var(--line, #E2E8F0)', borderRadius: 'var(--radius, 10px)',
      padding: 16, boxShadow: '0 8px 24px rgba(15,30,24,.12)', fontSize: 13, lineHeight: 1.7,
    }}>
      <p style={{ margin: '0 0 12px', color: 'var(--slate, #334155)' }}>
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
  flex: 1, height: 40, borderRadius: 8, fontSize: 13, fontWeight: 650,
  cursor: 'pointer',
  background: primary ? 'var(--green, #147B58)' : 'transparent',
  color: primary ? '#fff' : 'var(--slate, #334155)',
  border: `1px solid ${primary ? 'var(--green, #147B58)' : 'var(--line, #E2E8F0)'}`,
})
