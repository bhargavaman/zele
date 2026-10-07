---
'zele': minor
---

Add `zele label rename <label-id> <name>` to rename a Gmail label in place.

The label keeps its ID and every thread already assigned to it, so there is no need to create a new label and re-apply it. Before this, a misnamed label could only be deleted and recreated.

```bash
zele label list
zele label rename Label_12 Bookings
```
