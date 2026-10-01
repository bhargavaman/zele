---
'zele': patch
---

Fix unreadable non-ASCII IMAP message bodies. Quoted-printable, base64, and raw bodies keep their original bytes until they are decoded with the MIME part's declared charset.

Chinese UTF-8 and GBK messages, Latin-1 accents, and Windows-1252 punctuation now render correctly in single-part and multipart messages. Missing or unsupported charsets fall back to UTF-8.
