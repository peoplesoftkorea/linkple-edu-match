import type { CSSProperties } from 'react'
export const card: CSSProperties = { border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px', background: '#fff' }
export const input: CSSProperties = { padding: '11px 13px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 14, width: '100%', boxSizing: 'border-box' }
export const btnPrimary: CSSProperties = { padding: '10px 16px', borderRadius: 10, border: 'none', background: 'var(--green,#147B58)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }
export const btnGhost: CSSProperties = { padding: '10px 16px', borderRadius: 10, border: '1px solid var(--border)', background: '#fff', color: 'var(--slate,#334155)', fontWeight: 600, fontSize: 14, cursor: 'pointer' }
export const h1: CSSProperties = { fontFamily: 'var(--head)', fontSize: 24, margin: '0 0 6px' }
export const sub: CSSProperties = { color: 'var(--muted)', fontSize: 14, margin: '0 0 22px' }
export const one = (v: any) => (Array.isArray(v) ? v[0] : v)
export const th: CSSProperties = { textAlign: 'left', padding: '10px 12px', fontSize: 13, color: 'var(--muted)', borderBottom: '2px solid var(--border)', whiteSpace: 'nowrap' }
export const td: CSSProperties = { padding: '10px 12px', fontSize: 14, borderBottom: '1px solid var(--border)', verticalAlign: 'top' }
// ★값이 없을 때 «빈칸»을 내지 않는다 — 빈칸은 「없음」인지 「못 읽음」인지 구분이 안 된다(fail-to-zero).
export const fmt = (s?: string) => (s ? new Date(s).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—')
export const won = (n?: number) => `${(Number(n) || 0).toLocaleString('ko-KR')}원`
