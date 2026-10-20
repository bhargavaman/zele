// D1 drizzle client, better-auth instance, and session helpers.
//
// Login is email OTP on @gmail.com addresses only (see canonicalGmail). The CLI
// signs in with the bearer plugin and stores the session token. A future web
// UI uses the same auth with cookies. Google social login can be added later
// as another provider on the same `user` table, keyed by the same canonical email.

import { env, waitUntil } from 'cloudflare:workers'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { betterAuth } from 'better-auth/minimal'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { bearer, emailOTP } from 'better-auth/plugins'
import { drizzleAdapter } from 'better-auth-drizzle-adapter'
import * as schema from './schema.ts'
import { canonicalGmail } from './email-rules.ts'

export { schema }

// Convert D1 object rows to positional arrays for sqlite-proxy.
function d1ToRawRows(results: Record<string, unknown>[]) {
  return results.map((row) => Object.keys(row).map((k) => row[k]))
}

// TODO: switch to drizzle-orm/d1 once findFirst inside batch() is fixed.
// https://github.com/drizzle-team/drizzle-orm/issues/2721
export function getDb(d1: D1Database = env.DB) {
  return drizzle(
    async (sql, params, method) => {
      const stmt = d1.prepare(sql).bind(...params)
      if (method === 'run') {
        await stmt.run()
        return { rows: [] as any[] }
      }
      const rows = await stmt.raw()
      // sqlite-proxy expects a falsy value for `get` with no row.
      // https://github.com/drizzle-team/drizzle-orm/issues/5461
      if (method === 'get') return { rows: rows[0] as any }
      return { rows: rows as any[] }
    },
    async (queries) => {
      const stmts = queries.map((q) => d1.prepare(q.sql).bind(...q.params))
      const results = await d1.batch(stmts)
      return results.map((r, i) => {
        const rows = d1ToRawRows(r.results as Record<string, unknown>[])
        if (queries[i]!.method === 'get') return { rows: rows[0] as any }
        return { rows: rows as any[] }
      })
    },
    { schema, relations: schema.relations },
  )
}

const OTP_PATHS = new Set([
  '/email-otp/send-verification-otp',
  '/email-otp/check-verification-otp',
  '/sign-in/email-otp',
])

export function getAuth() {
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    // Password reset is not used (OTP only) and would send mail outside the limiter hook.
    disabledPaths: ['/email-otp/request-password-reset', '/forget-password/email-otp', '/email-otp/reset-password'],
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(getDb(), { provider: 'sqlite' }),
    session: {
      expiresIn: 60 * 60 * 24 * 365,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (!OTP_PATHS.has(ctx.path)) return
        if (ctx.path !== '/sign-in/email-otp' && ctx.body?.type !== 'sign-in') {
          throw new APIError('BAD_REQUEST', { message: 'Only sign-in codes are supported' })
        }
        const raw = typeof ctx.body?.email === 'string' ? ctx.body.email : ''
        const email = canonicalGmail(raw)
        if (email instanceof Error) throw new APIError('BAD_REQUEST', { message: email.message })
        if (ctx.path === '/email-otp/send-verification-otp') {
          const ip = ctx.request?.headers.get('cf-connecting-ip') ?? 'unknown'
          const [byEmail, byIp] = await Promise.all([
            env.OTP_EMAIL_LIMITER.limit({ key: email }),
            env.OTP_IP_LIMITER.limit({ key: ip }),
          ])
          if (!byEmail.success || !byIp.success) {
            throw new APIError('TOO_MANY_REQUESTS', { message: 'Too many codes requested. Wait a minute and retry.' })
          }
        }
        return { context: { body: { ...ctx.body, email } } }
      }),
    },
    plugins: [
      bearer(),
      emailOTP({
        otpLength: 6,
        expiresIn: 10 * 60,
        allowedAttempts: 3,
        async sendVerificationOTP({ email, otp }) {
          // Not awaited: avoids timing differences between existing and new users.
          waitUntil(sendOtpEmail({ email, otp }))
        },
      }),
    ],
    onAPIError: {
      onError(error) {
        console.error('better-auth error', error)
      },
    },
  })
}

async function sendOtpEmail({ email, otp }: { email: string; otp: string }) {
  // The code is in the subject so `zele login zele` can read it from an envelope-only list.
  const result = await env.EMAIL.send({
    from: { email: 'noreply@zele.sh', name: 'zele.sh' },
    to: email,
    subject: `zele.sh code: ${otp}`,
    text: `Your zele.sh sign-in code is ${otp}\n\nIt expires in 10 minutes. If you did not request it, ignore this email.\n`,
  }).catch((err: unknown) => new Error('Failed to send OTP email', { cause: err }))
  if (result instanceof Error) console.error(result, result.cause)
}

export type AuthSession = NonNullable<Awaited<ReturnType<ReturnType<typeof getAuth>['api']['getSession']>>>

/** Session from a bearer token or cookie. Throws on DB errors so they become 5xx, not 401. */
export async function getSession(request: Request): Promise<AuthSession | null> {
  return getAuth().api.getSession({ headers: request.headers })
}
