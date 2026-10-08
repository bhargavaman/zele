import { expect, test } from 'vitest'
import { codeFromSubject, parseRawMessage, type ZeleShMessage } from './zele-sh-client.js'

const RAW = [
  'From: Bob <bob@example.org>',
  'To: box@zele.sh',
  'Subject: Invoice attached',
  'Message-ID: <inv-1@example.org>',
  'Date: Thu, 08 Oct 2026 12:30:00 +0000',
  'Authentication-Results: mx.cloudflare.net; dkim=pass header.d=example.org; spf=pass; dmarc=pass',
  'MIME-Version: 1.0',
  'Content-Type: multipart/mixed; boundary="XX"',
  '',
  '--XX',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'Hello, see the invoice.',
  '--XX',
  'Content-Type: text/plain; name="invoice.txt"',
  'Content-Disposition: attachment; filename="invoice.txt"',
  'Content-Transfer-Encoding: base64',
  '',
  'SW52b2ljZSB0b3RhbDogNDIgRVVSCg==',
  '--XX--',
  '',
].join('\r\n')

const META: ZeleShMessage = {
  messageId: '01M4DTEEWSBTWW154K1K46T9SE',
  inbox: 'box@zele.sh',
  receivedAt: '2026-10-08T12:30:05.000Z',
  fromEmail: 'bob@example.org',
  fromName: 'Bob',
  to: [{ name: '', email: 'box@zele.sh' }],
  cc: [],
  subject: 'Invoice attached',
  snippet: 'Hello, see the invoice.',
  messageIdHeader: '<inv-1@example.org>',
  inReplyTo: '',
  size: RAW.length,
  hasAttachments: true,
  folder: 'inbox',
  unread: true,
  starred: false,
}

test('parseRawMessage maps raw MIME and server flags to ParsedMessage', async () => {
  const parsed = await parseRawMessage({ raw: RAW, meta: META })
  expect({ ...parsed, auth: parsed.auth && { ...parsed.auth, raw: undefined } }).toMatchInlineSnapshot(`
    {
      "attachments": [
        {
          "attachmentId": "0",
          "filename": "invoice.txt",
          "mimeType": "text/plain",
          "size": 22,
        },
      ],
      "auth": {
        "authentic": true,
        "dkim": "pass",
        "dmarc": "pass",
        "raw": undefined,
        "spf": "pass",
      },
      "bcc": [],
      "body": "Hello, see the invoice.",
      "cc": null,
      "date": "2026-10-08T12:30:00.000Z",
      "from": {
        "email": "bob@example.org",
        "name": "Bob",
      },
      "id": "01M4DTEEWSBTWW154K1K46T9SE",
      "inReplyTo": undefined,
      "isDraft": false,
      "labelIds": [
        "INBOX",
        "UNREAD",
      ],
      "listUnsubscribe": undefined,
      "listUnsubscribePost": undefined,
      "messageId": "<inv-1@example.org>",
      "mimeType": "text/plain",
      "references": undefined,
      "replyTo": undefined,
      "snippet": "Hello, see the invoice.",
      "starred": false,
      "subject": "Invoice attached",
      "textBody": "Hello, see the invoice.",
      "threadId": "01M4DTEEWSBTWW154K1K46T9SE",
      "to": [
        {
          "email": "box@zele.sh",
          "name": undefined,
        },
      ],
      "unread": true,
    }
  `)
})

test('codeFromSubject reads the 6-digit code', () => {
  expect([codeFromSubject('zele.sh code: 482913'), codeFromSubject('Re: zele.sh code: 12345'), codeFromSubject('hello')]).toMatchInlineSnapshot(`
    [
      "482913",
      null,
      null,
    ]
  `)
})
