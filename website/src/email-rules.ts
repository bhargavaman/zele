// Pure rules for zele.sh addresses and owner emails. No runtime bindings here,
// so they are unit-testable and can be shared with the CLI later.

export const ZELE_DOMAIN = 'zele.sh'
export const MAX_INBOXES_PER_OWNER = 10
/** Total raw bytes kept per owner across all inboxes. Over this, new mail is rejected. */
export const MAX_STORAGE_BYTES_PER_OWNER = 1024 * 1024 * 1024
export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com'])

/**
 * Owner emails must be consumer Gmail addresses. Gmail needs phone verification,
 * so this blocks temp-mail bots. Returns the canonical form: lowercase, no dots,
 * no +tag, googlemail.com -> gmail.com. All variants of one mailbox map to one
 * owner, so the 10-inbox limit cannot be bypassed with t.o.m+1@gmail.com.
 */
export function canonicalGmail(email: string): string | Error {
  const trimmed = email.trim().toLowerCase()
  const at = trimmed.lastIndexOf('@')
  if (at <= 0) return new Error(`Invalid email: ${email}`)
  const domain = trimmed.slice(at + 1)
  if (!GMAIL_DOMAINS.has(domain)) {
    return new Error(`Only @gmail.com addresses can own zele.sh inboxes, got ${email}`)
  }
  const local = trimmed.slice(0, at).split('+')[0]!.replaceAll('.', '')
  if (!/^[a-z0-9]{6,30}$/.test(local)) return new Error(`Invalid Gmail address: ${email}`)
  return `${local}@gmail.com`
}

// RFC 2142 role names and names that could impersonate the service.
const RESERVED_NAMES = new Set([
  'abuse', 'admin', 'administrator', 'billing', 'help', 'hostmaster', 'info', 'mailer-daemon',
  'no-reply', 'noreply', 'postmaster', 'root', 'security', 'support', 'webmaster', 'www', 'zele',
])

/** Validates the local part of a new address. Accepts "tommy" or "tommy@zele.sh". */
export function parseInboxName(input: string): string | Error {
  const lower = input.trim().toLowerCase()
  const suffix = `@${ZELE_DOMAIN}`
  const name = lower.endsWith(suffix) ? lower.slice(0, -suffix.length) : lower
  if (!/^[a-z0-9][a-z0-9._-]{2,30}$/.test(name)) {
    return new Error('Inbox names are 3-31 chars of a-z 0-9 . _ - and start with a letter or digit')
  }
  if (/[._-]$/.test(name) || /[._-]{2}/.test(name)) {
    return new Error('Inbox names cannot end with . _ - or repeat them')
  }
  if (RESERVED_NAMES.has(name)) return new Error(`${name}@${ZELE_DOMAIN} is reserved`)
  return name
}

/** Recipient local part without +tag, or null when the recipient is not on zele.sh. */
export function recipientInboxName(recipient: string): string | null {
  const lower = recipient.trim().toLowerCase()
  const suffix = `@${ZELE_DOMAIN}`
  if (!lower.endsWith(suffix)) return null
  return lower.slice(0, -suffix.length).split('+')[0]!
}

export type QueryTerm = { field: 'from' | 'to' | 'subject' | 'text' | 'unread'; value: string }

/** Small subset of Gmail search: from:, to:, subject:, is:unread, free text. Quoted values allowed. */
export function parseQuery(query: string | undefined): QueryTerm[] {
  if (!query?.trim()) return []
  const terms: QueryTerm[] = []
  const re = /(?:(from|to|subject|is):)?("([^"]*)"|\S+)/gi
  for (const match of query.matchAll(re)) {
    const field = match[1]?.toLowerCase()
    const value = match[3] ?? match[2]!
    if (field === 'is') {
      if (value.toLowerCase() === 'unread') terms.push({ field: 'unread', value: '' })
      continue
    }
    if (!value) continue
    terms.push({ field: field === 'from' || field === 'to' || field === 'subject' ? field : 'text', value })
  }
  return terms
}
