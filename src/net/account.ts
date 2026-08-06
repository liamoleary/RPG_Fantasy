/**
 * Device identity (Launch Plan §1), client side.
 *
 * The token is the account. It lives in localStorage, is sent as a bearer on
 * every call, and is never shown to the player — the link code is the thing
 * they see and type. Losing it (cleared site data, no linked device) loses the
 * account, which §1 accepts explicitly for a playtest.
 */
import { api } from './client'

export const ACCOUNT_KEY = 'bannerfell.account.v1'

export interface DeviceAccount {
  accountId: string
  token: string
  displayName: string
}

export function readAccount(): DeviceAccount | null {
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as DeviceAccount
    if (typeof parsed?.token !== 'string' || typeof parsed?.accountId !== 'string') return null
    return parsed
  } catch {
    return null
  }
}

export function writeAccount(account: DeviceAccount): void {
  try {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account))
  } catch {
    // Private-mode Safari. The session still works; it just won't survive a reload.
  }
}

export function clearAccount(): void {
  try {
    localStorage.removeItem(ACCOUNT_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * Returns the device's account, creating one if this is a first visit.
 * Resolves to null when the server is unreachable — the caller carries on
 * without sync rather than waiting or retrying.
 */
export async function ensureAccount(): Promise<DeviceAccount | null> {
  const existing = readAccount()
  if (existing) return existing

  const res = await api<{ accountId: string; token: string; displayName: string }>('POST', '/api/account', { body: {} })
  if (!res.ok || !res.data?.token) return null

  const account: DeviceAccount = {
    accountId: res.data.accountId,
    token: res.data.token,
    displayName: res.data.displayName,
  }
  writeAccount(account)
  return account
}

/** Rename (§1: the player picks a name after the account exists). */
export async function renameAccount(displayName: string): Promise<boolean> {
  const account = readAccount()
  if (!account) return false
  const res = await api<{ displayName: string }>('PATCH', '/api/account', {
    token: account.token,
    body: { displayName },
  })
  if (!res.ok || !res.data) return false
  writeAccount({ ...account, displayName: res.data.displayName })
  return true
}

/** Mint a link code to show in Settings (§1). */
export async function requestLinkCode(): Promise<{ linkCode: string; expiresAt: string } | null> {
  const account = readAccount()
  if (!account) return null
  const res = await api<{ linkCode: string; expiresAt: string }>('POST', '/api/account/code', { token: account.token })
  return res.ok && res.data ? res.data : null
}

/**
 * Redeem a code on this device. On success the device adopts the returned
 * token, becoming a second device on that account — the previous identity on
 * this device is replaced, which is the point.
 */
export async function redeemLinkCode(linkCode: string): Promise<DeviceAccount | null> {
  const res = await api<DeviceAccount>('POST', '/api/account/link', { body: { linkCode } })
  if (!res.ok || !res.data?.token) return null
  writeAccount(res.data)
  return res.data
}
