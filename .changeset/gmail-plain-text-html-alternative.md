---
'zele': patch
---

Fix Gmail hard-wrapping plain-text drafts and replies at ~78 columns.

A text-only draft opens in Gmail's plain-text composer, which inserts hard line breaks in long paragraphs when you send it. Plain-text bodies are now sent as `multipart/alternative`: the original text plus an escaped HTML copy, so Gmail wraps lines naturally. Thanks @Cvikli for finding this in #17.

HTML detection is also stricter. A body counts as HTML only if it has a closing tag or `<br>`, so text like `Bob <bob@example.com>` or `Vec<String>` is no longer sent as broken HTML. This also fixed forwarded drafts, whose `From: Name <email>` line made them HTML and collapsed their newlines.
