import { describe, expect, test } from 'vitest'
import { canonicalGmail, parseInboxName, parseQuery, recipientInboxName } from './email-rules.ts'

describe('canonicalGmail', () => {
  test('maps every variant of one mailbox to one owner, rejects non-gmail', () => {
    const inputs = [
      'Tommy.De.Rossi@gmail.com',
      't.o.m.m.y.d.e.r.o.s.s.i+zele@googlemail.com',
      ' TOMMYDEROSSI+a+b@GMAIL.COM ',
      'tommy@company.com',
      'tommy@outlook.com',
      'abc@gmail.com',
      'no-at-sign',
    ]
    expect(inputs.map((i) => String(canonicalGmail(i)))).toMatchInlineSnapshot(`
      [
        "tommyderossi@gmail.com",
        "tommyderossi@gmail.com",
        "tommyderossi@gmail.com",
        "Error: Only @gmail.com addresses can own zele.sh inboxes, got tommy@company.com",
        "Error: Only @gmail.com addresses can own zele.sh inboxes, got tommy@outlook.com",
        "Error: Invalid Gmail address: abc@gmail.com",
        "Error: Invalid email: no-at-sign",
      ]
    `)
  })
})

describe('parseInboxName', () => {
  test('validates names and strips the domain', () => {
    const inputs = ['Tommy', 'tommy@zele.sh', 'a.b-c_d', 'ab', '.tommy', 'tommy.', 'to..mmy', 'postmaster', 'tommy@other.com']
    expect(inputs.map((i) => String(parseInboxName(i)))).toMatchInlineSnapshot(`
      [
        "tommy",
        "tommy",
        "a.b-c_d",
        "Error: Inbox names are 3-31 chars of a-z 0-9 . _ - and start with a letter or digit",
        "Error: Inbox names are 3-31 chars of a-z 0-9 . _ - and start with a letter or digit",
        "Error: Inbox names cannot end with . _ - or repeat them",
        "Error: Inbox names cannot end with . _ - or repeat them",
        "Error: postmaster@zele.sh is reserved",
        "Error: Inbox names are 3-31 chars of a-z 0-9 . _ - and start with a letter or digit",
      ]
    `)
  })
})

test('recipientInboxName strips +tag and ignores other domains', () => {
  expect(['Tommy+news@zele.sh', 'tommy@zele.sh', 'tommy@zele.shop'].map(recipientInboxName)).toMatchInlineSnapshot(`
    [
      "tommy",
      "tommy",
      null,
    ]
  `)
})

test('parseQuery supports from/to/subject/is:unread and quoted values', () => {
  expect(parseQuery('from:alice subject:"weekly report" is:unread invoice is:starred')).toMatchInlineSnapshot(`
    [
      {
        "field": "from",
        "value": "alice",
      },
      {
        "field": "subject",
        "value": "weekly report",
      },
      {
        "field": "unread",
        "value": "",
      },
      {
        "field": "text",
        "value": "invoice",
      },
    ]
  `)
})
