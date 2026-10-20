// D1 schema for zele.sh: better-auth core tables plus the inbox registry.
// Messages are not here. They live in one InboxStore Durable Object per owner
// (pointers + flags) and R2 (raw gzipped .eml).

import { defineRelations } from 'drizzle-orm'
import * as s from 'drizzle-orm/sqlite-core'
import { ulid } from 'ulid'

const createdAt = () => s.integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date())
const updatedAt = () => s.integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date())

// ── better-auth core tables ─────────────────────────────────────────

export const user = s.sqliteTable('user', {
  id: s.text('id').primaryKey().notNull().$defaultFn(() => ulid()),
  name: s.text('name').notNull(),
  email: s.text('email').notNull().unique(),
  emailVerified: s.integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: s.text('image'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const session = s.sqliteTable(
  'session',
  {
    id: s.text('id').primaryKey().notNull().$defaultFn(() => ulid()),
    userId: s.text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    token: s.text('token').notNull().unique(),
    expiresAt: s.integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    ipAddress: s.text('ip_address'),
    userAgent: s.text('user_agent'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [s.index('session_user_id_idx').on(table.userId)],
)

export const account = s.sqliteTable(
  'account',
  {
    id: s.text('id').primaryKey().notNull().$defaultFn(() => ulid()),
    userId: s.text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    accountId: s.text('account_id').notNull(),
    providerId: s.text('provider_id').notNull(),
    accessToken: s.text('access_token'),
    refreshToken: s.text('refresh_token'),
    accessTokenExpiresAt: s.integer('access_token_expires_at', { mode: 'timestamp_ms' }),
    refreshTokenExpiresAt: s.integer('refresh_token_expires_at', { mode: 'timestamp_ms' }),
    scope: s.text('scope'),
    idToken: s.text('id_token'),
    password: s.text('password'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [s.index('account_user_id_idx').on(table.userId)],
)

export const verification = s.sqliteTable(
  'verification',
  {
    id: s.text('id').primaryKey().notNull().$defaultFn(() => ulid()),
    identifier: s.text('identifier').notNull(),
    value: s.text('value').notNull(),
    expiresAt: s.integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [s.index('verification_identifier_idx').on(table.identifier)],
)

// ── inbox registry ──────────────────────────────────────────────────

/** One row per address ever created. Deleted rows stay so the address is never reused. */
export const inbox = s.sqliteTable(
  'inbox',
  {
    /** Local part only, e.g. "tommy" for tommy@zele.sh. */
    address: s.text('address').primaryKey().notNull(),
    userId: s.text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    status: s.text('status', { enum: ['active', 'deleted'] }).notNull().default('active'),
    createdAt: createdAt(),
    deletedAt: s.integer('deleted_at', { mode: 'timestamp_ms' }),
  },
  (table) => [s.index('inbox_user_id_idx').on(table.userId)],
)

export type InboxStatus = typeof inbox.$inferSelect.status

export const relations = defineRelations({ user, session, account, verification, inbox }, (r) => ({
  user: {
    sessions: r.many.session(),
    accounts: r.many.account(),
    inboxes: r.many.inbox(),
  },
  session: {
    user: r.one.user({ from: r.session.userId, to: r.user.id }),
  },
  account: {
    user: r.one.user({ from: r.account.userId, to: r.user.id }),
  },
  inbox: {
    user: r.one.user({ from: r.inbox.userId, to: r.user.id }),
  },
}))
