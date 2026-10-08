---
'zele': minor
---

Make `mail watch` the way to wait for a reply after sending.

- `mail send` and `mail reply` now print the exact watch command to run next:

  ```bash
  zele mail send --to bob@example.com --subject "Question" --body "Hey"
  # Wait for the reply: zele mail watch --account me@example.com --filter 'from:bob@example.com subject:"Question"' --timeout 259200
  ```

- `mail watch` prints how long it waited: an `elapsed` field on the match, `Timed out after 3d 0h 0m 0s` on timeout, and `# Still watching, 3m 0s elapsed` on stderr every minute.
- `mail watch` no longer exits on a network error. It prints `# Poll failed ..., retrying` and polls again, so a watch can run for days. Auth errors still stop it.
- Fix `mail watch` on Gmail returning an old email as a match. It reused a history cursor saved by an earlier run and replayed emails that arrived since then. Now only emails that arrive after the command starts can match, same as IMAP.
