---
title: How to write scripts that verify cleanly
domain: general
kind: knowledge
tags: script python powershell exact verify exit code print success idempotent
created: seed
---
- Print one clear success line at the end, for example `DONE: wrote C:\Users\me\Desktop\report.txt`, and pass that text in `expect_output`.
- Exit non-zero on any failure (`sys.exit(1)`, or `exit 1` in PowerShell). Never swallow exceptions silently.
- Use absolute paths. The `desktop`, `downloads` and `documents` shortcuts work in `expect_files`, but inside the script use `Path.home()`.
- Idempotent: running twice must not break anything (`mkdir(exist_ok=True)`, check before creating).
- Never call `input()` or anything interactive; scripts run unattended.
- Write text files as UTF-8. Check a result by reading it back (file exists, size > 0, expected text inside).
- Secrets are never written into scripts; use `api_request` with service discord/roblox, which injects saved credentials.
- Long jobs: pass `background: true` and print progress lines.
