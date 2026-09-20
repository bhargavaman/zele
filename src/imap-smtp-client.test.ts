import { expect, test, describe } from 'vitest'
import { imapSearchFolders, parseImapSearchQuery, tlsSocketOptions, imapTlsOptions } from './imap-smtp-client.js'

describe('tlsSocketOptions', () => {
  test('no ca or insecure means default validation', () => {
    expect(tlsSocketOptions({})).toBeUndefined()
  })

  test('ca is trusted without disabling validation', () => {
    expect(tlsSocketOptions({ ca: 'PEM' })).toEqual({ ca: ['PEM'] })
  })

  test('insecure disables certificate verification', () => {
    expect(tlsSocketOptions({ ca: 'PEM', insecure: true })).toEqual({ ca: ['PEM'], rejectUnauthorized: false })
  })
})

describe('imapTlsOptions', () => {
  test('ip hosts drop imapflow servername=false so Bun accepts the connection', () => {
    expect(imapTlsOptions({}, '127.0.0.1')).toStrictEqual({ servername: undefined })
    expect(imapTlsOptions({ ca: 'PEM' }, '127.0.0.1')).toStrictEqual({ ca: ['PEM'], servername: undefined })
    expect(imapTlsOptions({ ca: 'PEM' }, '::1')).toStrictEqual({ ca: ['PEM'], servername: undefined })
  })

  test('hostnames keep normal SNI behavior', () => {
    expect(imapTlsOptions({}, 'imap.example.com')).toBeUndefined()
    expect(imapTlsOptions({ ca: 'PEM' }, 'imap.example.com')).toEqual({ ca: ['PEM'] })
  })
})

describe('parseImapSearchQuery', () => {
  test('to: becomes IMAP TO and does not leave leftover plain text', () => {
    expect(parseImapSearchQuery('to:alice@example.com')).toEqual({
      inFolder: undefined,
      searchCriteria: { to: 'alice@example.com' },
    })
  })

  test('in:sent selects Sent and is not searched as body text', () => {
    expect(parseImapSearchQuery('in:sent to:alice@example.com')).toEqual({
      inFolder: 'sent',
      searchCriteria: { to: 'alice@example.com' },
    })
    expect(parseImapSearchQuery('in:sent')).toEqual({
      inFolder: 'sent',
      searchCriteria: { all: true },
    })
  })

  test('in:sent with subject text searches subject or body in Sent', () => {
    expect(parseImapSearchQuery('in:sent Invoice for project work')).toEqual({
      inFolder: 'sent',
      searchCriteria: {
        or: [
          { subject: 'Invoice for project work' },
          { body: 'Invoice for project work' },
        ],
      },
    })
  })

  test('plain subject text searches subject or body', () => {
    expect(parseImapSearchQuery('Invoice for project work')).toEqual({
      inFolder: undefined,
      searchCriteria: {
        or: [
          { subject: 'Invoice for project work' },
          { body: 'Invoice for project work' },
        ],
      },
    })
  })

  test('in:inbox keeps a from: filter on Inbox', () => {
    expect(parseImapSearchQuery('in:inbox from:github')).toEqual({
      inFolder: 'inbox',
      searchCriteria: { from: 'github' },
    })
  })

  test('folder starred keeps flagged even with a from: filter', () => {
    expect(parseImapSearchQuery('from:github', { isStarred: true })).toEqual({
      inFolder: undefined,
      searchCriteria: { flagged: true, from: 'github' },
    })
  })
})

describe('imapSearchFolders', () => {
  test('mail search with no folder looks in Inbox and Sent', () => {
    expect(imapSearchFolders({
      inFolder: parseImapSearchQuery('to:alice@example.com').inFolder,
    })).toEqual(['inbox', 'sent'])
  })

  test('in:sent searches only Sent', () => {
    expect(imapSearchFolders({
      inFolder: parseImapSearchQuery('in:sent to:alice@example.com').inFolder,
    })).toEqual(['sent'])
  })

  test('in:inbox searches only Inbox', () => {
    expect(imapSearchFolders({
      inFolder: parseImapSearchQuery('in:inbox from:github').inFolder,
    })).toEqual(['inbox'])
  })

  test('mail list --folder keeps that mailbox when the query has no in:', () => {
    expect(imapSearchFolders({ folder: 'inbox' })).toEqual(['inbox'])
    expect(imapSearchFolders({ folder: 'sent' })).toEqual(['sent'])
  })

  test('in: in the query wins over --folder', () => {
    expect(imapSearchFolders({
      folder: 'inbox',
      inFolder: parseImapSearchQuery('in:sent to:alice@example.com').inFolder,
    })).toEqual(['sent'])
  })
})
