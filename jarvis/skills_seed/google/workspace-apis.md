---
title: Google Workspace APIs: auth, Drive, Sheets, Gmail, Calendar
domain: google
kind: knowledge
tags: google workspace oauth drive sheets docs gmail calendar api service account apps script clasp scopes
created: seed
---
- Install: `google-api-python-client google-auth-httplib2 google-auth-oauthlib`. Enable each API in a Google Cloud project first, create an OAuth client (Desktop app) and download `credentials.json`; the first run opens a browser for consent and stores a token.
- Use the narrowest scope: `drive.file` rather than `drive`; `spreadsheets` for Sheets; `gmail.send` or `gmail.readonly`; `calendar.events`. Changing scopes means deleting the stored token.
- Sheets: `service.spreadsheets().values().get(spreadsheetId=ID, range="Sheet1!A1:C10")`; write with `.update(..., valueInputOption="USER_ENTERED", body={"values": rows})`.
- Drive upload: `MediaFileUpload(path)` with `service.files().create(body={"name": n}, media_body=media, fields="id")`.
- A service account has its own empty Drive: share the file or folder with the service account's email, or it cannot see it.
- Apps Script (script.google.com) runs JavaScript inside Google; `clasp` (npm) pushes local files to it. Good for Sheets/Docs automation that runs on Google's side on a schedule.
- Keep client secrets and tokens in the user folder, never inside shared scripts.
