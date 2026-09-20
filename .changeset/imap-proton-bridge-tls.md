---
'zele': minor
---

Support self-signed IMAP/SMTP TLS endpoints like Proton Mail Bridge.

`login imap` gained `--smtp-tls` to force implicit TLS on a custom SMTP port (Bridge SSL mode keeps port 1025), `--ca <path>` to trust a PEM certificate such as Bridge's exported `cert.pem`, and `--insecure` to skip certificate verification when explicitly requested. `--insecure` is unsafe; prefer `--ca`. `--no-tls` disables implicit IMAP TLS, while STARTTLS is still attempted when the server advertises it.

```bash
# Proton Bridge default (STARTTLS on 1143/1025), trusting the exported cert
zele login imap \
  --email you@proton.me \
  --imap-host 127.0.0.1 --imap-port 1143 \
  --smtp-host 127.0.0.1 --smtp-port 1025 \
  --password "<bridge-password>" \
  --no-tls --ca ~/bridge/cert.pem

# Same, without exporting the cert (unsafe: disables certificate verification)
zele login imap \
  --email you@proton.me \
  --imap-host 127.0.0.1 --imap-port 1143 \
  --smtp-host 127.0.0.1 --smtp-port 1025 \
  --password "<bridge-password>" \
  --no-tls --insecure

# Bridge SSL mode: both listeners use implicit TLS
zele login imap \
  --email you@proton.me \
  --imap-host 127.0.0.1 --imap-port 1143 \
  --smtp-host 127.0.0.1 --smtp-port 1025 \
  --password "<bridge-password>" \
  --smtp-tls --ca ~/bridge/cert.pem
```
