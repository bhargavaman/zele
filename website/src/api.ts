// zele.sh JSON API under /api/v1. Auth: better-auth session, as a bearer token
// (CLI, `Authorization: Bearer <token>`) or cookie (future web UI).
// Receive-only: there is no send route.
// TODO: sending is disabled to prevent spam. Add it with per-inbox daily quotas,
// account age gates, and outbound content checks before exposing env.EMAIL for user mail.

import { env } from 'cloudflare:workers'
import { Spiceflow, json } from 'spiceflow'
import { z } from 'zod'
import { getDb, getSession, type AuthSession } from './db.ts'
import { MAX_INBOXES_PER_OWNER, ZELE_DOMAIN, parseInboxName } from './email-rules.ts'
import { MAIL_FOLDERS, getInboxStore, type MessageRow } from './inbox-store.ts'

const LOGIN_HINT = 'Not signed in to zele.sh. Run: zele login zele'

async function requireSession(request: Request): Promise<AuthSession> {
  const session = await getSession(request)
  if (!session) throw json({ message: LOGIN_HINT }, { status: 401 })
  return session
}

async function listActiveInboxes(userId: string) {
  return getDb().query.inbox.findMany({
    where: { userId, status: 'active' },
    orderBy: { createdAt: 'asc' },
  })
}

function inboxJson(row: { address: string; createdAt: Date }) {
  return { address: `${row.address}@${ZELE_DOMAIN}`, createdAt: row.createdAt.toISOString() }
}

function messageJson(row: MessageRow) {
  const { r2Key: _r2Key, inbox, ...rest } = row
  return { ...rest, inbox: `${inbox}@${ZELE_DOMAIN}`, receivedAt: new Date(row.receivedAt).toISOString() }
}

/** Accepts "tommy" or "tommy@zele.sh" and checks the caller owns it. */
async function requireOwnedInbox(userId: string, input: string) {
  const name = parseInboxName(input)
  if (name instanceof Error) throw json({ message: name.message }, { status: 400 })
  const row = await getDb().query.inbox.findFirst({ where: { address: name, userId, status: 'active' } })
  if (!row) throw json({ message: `${name}@${ZELE_DOMAIN} is not one of your inboxes. List them with: zele inbox list` }, { status: 404 })
  return row
}

const messageIdSchema = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, 'Invalid message id')

export const apiApp = new Spiceflow()
  .route({
    method: 'GET',
    path: '/api/v1/inboxes',
    async handler({ request }) {
      const session = await requireSession(request)
      const rows = await listActiveInboxes(session.user.id)
      return { owner: session.user.email, limit: MAX_INBOXES_PER_OWNER, inboxes: rows.map(inboxJson) }
    },
  })
  .route({
    method: 'POST',
    path: '/api/v1/inboxes',
    request: z.object({ name: z.string().min(1) }),
    async handler({ request }) {
      const session = await requireSession(request)
      const name = parseInboxName((await request.json()).name)
      if (name instanceof Error) throw json({ message: name.message }, { status: 400 })

      const now = Date.now()
      // One statement: the limit check and the insert are atomic. ON CONFLICT keeps
      // deleted addresses blocked forever, so a new owner never gets old mail.
      const result = await env.DB.prepare(
        `INSERT INTO inbox (address, user_id, status, created_at)
         SELECT ?1, ?2, 'active', ?3
         WHERE (SELECT count(*) FROM inbox WHERE user_id = ?2 AND status = 'active') < ?4
         ON CONFLICT (address) DO NOTHING`,
      )
        .bind(name, session.user.id, now, MAX_INBOXES_PER_OWNER)
        .run()
      if (result.meta.changes === 0) {
        const existing = await getDb().query.inbox.findFirst({ where: { address: name } })
        if (existing) {
          throw json({ message: `${name}@${ZELE_DOMAIN} is taken. Try another name: zele inbox create ${name}2` }, { status: 409 })
        }
        throw json(
          { message: `Inbox limit reached (${MAX_INBOXES_PER_OWNER}) for ${session.user.email}. Delete one: zele inbox delete <address>` },
          { status: 403 },
        )
      }
      const rows = await listActiveInboxes(session.user.id)
      return { ...inboxJson({ address: name, createdAt: new Date(now) }), used: rows.length, limit: MAX_INBOXES_PER_OWNER }
    },
  })
  .route({
    method: 'DELETE',
    path: '/api/v1/inboxes/:address',
    async handler({ request, params }) {
      const session = await requireSession(request)
      const row = await requireOwnedInbox(session.user.id, params.address)
      const deletedMessages = await getInboxStore(session.user.id).deleteInbox(row.address)
      await env.DB.prepare(`UPDATE inbox SET status = 'deleted', deleted_at = ? WHERE address = ? AND user_id = ?`)
        .bind(Date.now(), row.address, session.user.id)
        .run()
      return { address: `${row.address}@${ZELE_DOMAIN}`, deletedMessages }
    },
  })
  .route({
    method: 'GET',
    path: '/api/v1/messages',
    query: z.object({
      inbox: z.string().min(1),
      folder: z.enum([...MAIL_FOLDERS, 'starred', 'all']).default('inbox'),
      q: z.string().optional(),
      cursor: messageIdSchema.optional(),
      limit: z.coerce.number().int().min(1).max(100).default(25),
    }),
    async handler({ request, query }) {
      const session = await requireSession(request)
      const row = await requireOwnedInbox(session.user.id, query.inbox)
      const page = await getInboxStore(session.user.id).listMessages({
        inboxes: [row.address],
        folder: query.folder,
        query: query.q,
        cursor: query.cursor,
        limit: query.limit,
      })
      return { messages: page.messages.map(messageJson), nextCursor: page.nextCursor }
    },
  })
  .route({
    method: 'GET',
    path: '/api/v1/messages/:messageId/raw',
    async handler({ request, params }) {
      const session = await requireSession(request)
      const messageId = messageIdSchema.safeParse(params.messageId)
      if (!messageId.success) throw json({ message: 'Invalid message id' }, { status: 400 })
      const message = await getInboxStore(session.user.id).getMessage(messageId.data)
      if (!message) throw json({ message: `Message ${messageId.data} not found` }, { status: 404 })
      const object = await env.MAIL.get(message.r2Key)
      if (!object) throw json({ message: `Raw content for ${messageId.data} is missing` }, { status: 404 })
      return new Response(object.body.pipeThrough(new DecompressionStream('gzip')), {
        headers: { 'content-type': 'message/rfc822', 'cache-control': 'private, no-store' },
      })
    },
  })
  .route({
    method: 'GET',
    path: '/api/v1/messages/:messageId',
    async handler({ request, params }) {
      const session = await requireSession(request)
      const messageId = messageIdSchema.safeParse(params.messageId)
      if (!messageId.success) throw json({ message: 'Invalid message id' }, { status: 400 })
      const message = await getInboxStore(session.user.id).getMessage(messageId.data)
      if (!message) throw json({ message: `Message ${messageId.data} not found` }, { status: 404 })
      return messageJson(message)
    },
  })
  .route({
    method: 'PATCH',
    path: '/api/v1/messages',
    request: z.object({
      messageIds: z.array(messageIdSchema).min(1).max(500),
      folder: z.enum(MAIL_FOLDERS).optional(),
      unread: z.boolean().optional(),
      starred: z.boolean().optional(),
    }),
    async handler({ request }) {
      const session = await requireSession(request)
      const body = await request.json()
      const updated = await getInboxStore(session.user.id).updateMessages(body)
      return { updated }
    },
  })
