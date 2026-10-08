---
'zele': minor
---

Add free, permanent `@zele.sh` email addresses (receive-only for now). Sign in with a @gmail.com owner (`--owner`) and create up to 10 addresses for yourself, a project, or your agents:

```bash
zele login zele --owner you@gmail.com --name tommy
zele inbox create bills
zele inbox list
zele mail list --account tommy@zele.sh
```

The sign-in code is read automatically from the owner Gmail when it is already a zele account. Each inbox works with `mail list`, `mail read`, `mail search`, `mail watch`, star, archive, trash, spam, and attachments. Sending, drafts, and labels return a clear "receive-only" error. `zele logout zele` signs out and removes the inbox accounts from this machine.
