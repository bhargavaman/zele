---
'zele': patch
---

Fix `mail search` missing Sent mail on IMAP and Gmail.

IMAP SEARCH is per mailbox. `mail search` used Inbox only, so `to:` and subject queries never saw mail you sent. `in:sent` was also treated as body text. IMAP `mail search` now looks in **Inbox** and **Sent**, and `in:sent` / `in:inbox` select one mailbox. `mail list --folder` stays on that mailbox. A conflicting `in:` returns no matches instead of escaping the folder.

Gmail `mail search` had the same trap: no `--folder` still prepended `in:inbox`, so Sent was excluded. Search with no folder now uses Gmail's default all-mail query (spam and trash stay out). `mail list` still lists Inbox unless you pass `--folder`.

```bash
zele mail search "to:alice@example.com" --limit 20
zele mail search "in:sent to:alice@example.com" --limit 20
zele mail search "Invoice for project work" --limit 50
```
