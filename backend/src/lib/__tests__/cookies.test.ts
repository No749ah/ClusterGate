import { describe, it, expect } from 'vitest'
import { stripClusterGateCookies } from '../cookies'

describe('stripClusterGateCookies', () => {
  it('removes the cg_session cookie', () => {
    expect(stripClusterGateCookies('cg_session=eyJhbGciOi.jwt.sig')).toBeUndefined()
  })

  it('removes every cg_ cookie but keeps application cookies in order', () => {
    expect(stripClusterGateCookies('app=1; cg_session=jwt; theme=dark; cg_csrf=tok; sid=abc')).toBe(
      'app=1; theme=dark; sid=abc'
    )
  })

  it('leaves a header without ClusterGate cookies unchanged', () => {
    expect(stripClusterGateCookies('n8n-auth=xyz; lang=de')).toBe('n8n-auth=xyz; lang=de')
  })

  it('matches the prefix case-insensitively and tolerates odd whitespace', () => {
    expect(stripClusterGateCookies('  CG_SESSION=jwt ;app=1;  Cg_Csrf=t  ')).toBe('app=1')
  })

  it('only strips cookies whose name starts with cg_', () => {
    expect(stripClusterGateCookies('mycg_session=keep; cgsession=keep; x=cg_session')).toBe(
      'mycg_session=keep; cgsession=keep; x=cg_session'
    )
  })

  it('handles valueless cookies and empty segments', () => {
    expect(stripClusterGateCookies('cg_flag; ; app')).toBe('app')
  })

  it('returns undefined for missing or empty headers', () => {
    expect(stripClusterGateCookies(undefined)).toBeUndefined()
    expect(stripClusterGateCookies('')).toBeUndefined()
    expect(stripClusterGateCookies(' ; ')).toBeUndefined()
  })
})
