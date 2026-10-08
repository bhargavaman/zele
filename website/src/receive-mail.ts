// Email Routing catch-all handler for *@zele.sh.
//
//   sender MTA ─► Email Routing ─► receiveMail()
//                                   ├─ D1: active inbox? owner?   (else reject)
//                                   ├─ InboxStore: owner over quota? (else reject)
//                                   ├─ R2 put <userId>/<inbox>/<id>.eml.gz
//                                   └─ InboxStore.insertMessage(pointer + headers)
//
// Only small mails are fully parsed (for snippet + attachments). Big mails get
// a headers-only parse to keep CPU low. The CLI parses bodies itself from raw.

import { env } from 'cloudflare:workers'
import PostalMime, { type Address, type Email } from 'postal-mime'
import { ulid } from 'ulid'
import { getDb } from './db.ts'
import { MAX_STORAGE_BYTES_PER_OWNER, recipientInboxName } from './email-rules.ts'
import { getInboxStore, type MailFolder } from './inbox-store.ts'

const FULL_PARSE_MAX_BYTES = 2 * 1024 * 1024

export async function receiveMail(message: ForwardableEmailMessage): Promise<void> {
  const name = recipientInboxName(message.to)
  if (!name) return message.setReject('Unknown recipient')

  const row = await getDb().query.inbox.findFirst({ where: { address: name, status: 'active' } })
  if (!row) return message.setReject('Unknown recipient')

  const store = getInboxStore(row.userId)
  // Early exit before reading the body. insertMessage re-checks atomically.
  if ((await store.usageBytes()) + message.rawSize > MAX_STORAGE_BYTES_PER_OWNER) {
    return message.setReject('Mailbox full')
  }

  const raw = new Uint8Array(await new Response(message.raw).arrayBuffer())
  const parsed = await PostalMime.parse(raw.byteLength <= FULL_PARSE_MAX_BYTES ? raw : headerBytes(raw))

  const messageId = ulid()
  const r2Key = `${row.userId}/${name}/${messageId}.eml.gz`
  const gzipped = await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer()
  await env.MAIL.put(r2Key, gzipped, {
    httpMetadata: { contentType: 'message/rfc822', contentEncoding: 'gzip' },
  })

  const from = flattenAddresses(parsed.from ? [parsed.from] : [])[0] ?? { name: '', email: message.from }
  const inserted = await store
    .insertMessage({
      maxBytes: MAX_STORAGE_BYTES_PER_OWNER,
      message: {
        messageId,
        inbox: name,
        r2Key,
        receivedAt: Date.now(),
        fromEmail: from.email,
        fromName: from.name,
        to: flattenAddresses(parsed.to ?? []),
        cc: flattenAddresses(parsed.cc ?? []),
        subject: parsed.subject ?? '',
        snippet: snippetOf(parsed),
        messageIdHeader: parsed.messageId ?? '',
        inReplyTo: parsed.inReplyTo ?? '',
        size: raw.byteLength,
        hasAttachments: parsed.attachments.some((a) => a.disposition === 'attachment'),
        folder: folderFor(parsed),
      },
    })
    .catch((err: unknown) => new Error('Failed to index received mail', { cause: err }))
  if (inserted === 'inserted') return
  await env.MAIL.delete(r2Key)
  if (inserted instanceof Error) throw inserted
  message.setReject(inserted === 'mailbox_full' ? 'Mailbox full' : 'Unknown recipient')
}

/** Headers end at the first empty line. Parsing only this keeps big mails cheap. */
function headerBytes(raw: Uint8Array): Uint8Array {
  for (let i = 0; i < raw.length - 3; i++) {
    if (raw[i] === 13 && raw[i + 1] === 10 && raw[i + 2] === 13 && raw[i + 3] === 10) return raw.subarray(0, i + 4)
    if (raw[i] === 10 && raw[i + 1] === 10) return raw.subarray(0, i + 2)
  }
  return raw.subarray(0, Math.min(raw.length, 256 * 1024))
}

function flattenAddresses(addresses: Address[]): Array<{ name: string; email: string }> {
  return addresses.flatMap((a) => (a.group ? a.group : [a])).map((m) => ({ name: m.name, email: m.address }))
}

function snippetOf(parsed: Email): string {
  const text = parsed.text ?? parsed.html?.replace(/<style[\s\S]*?<\/style>|<[^>]+>/g, ' ') ?? ''
  return text.replace(/\s+/g, ' ').trim().slice(0, 200)
}

/** Email Routing adds Authentication-Results. A DMARC fail goes to spam, not rejected. */
function folderFor(parsed: Email): MailFolder {
  const results = parsed.headers
    .filter((h) => h.key === 'authentication-results')
    .map((h) => h.value.toLowerCase())
  return results.some((v) => /\bdmarc=fail\b/.test(v)) ? 'spam' : 'inbox'
}
