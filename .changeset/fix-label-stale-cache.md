---
'zele': patch
---

Fix `mail label --add` creating junk labels like `Label_1` or `Label_12`.

Label names resolved against a labels list cached for 30 minutes. A label created or renamed outside zele looked missing, so zele created a duplicate. Passing a label ID from `zele label list` was treated as a new name, creating a literal `Label_12` label.

Resolution now matches label IDs as well as names, and re-fetches the labels list once before treating a label as missing. An unknown `Label_<n>` ID is rejected instead of created.

```bash
zele mail label <threadId> --add Work,Label_2 --remove Inbox
```
