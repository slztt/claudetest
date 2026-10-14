---
title: Discord REST API essentials
domain: discord
kind: knowledge
tags: discord api bot token rest message channel webhook rate limit embed snowflake intents
created: seed
---
- Base URL `https://discord.com/api/v10`. Bot auth header: `Authorization: Bot <token>` (api_request with service `discord` adds it). Send `Content-Type: application/json` and a `User-Agent` like `DiscordBot (https://example.com, 1.0)`.
- Send a message: `POST /channels/{channel_id}/messages` with `{"content": "text"}`. Content max is 2000 characters; up to 10 embeds per message. IDs (snowflakes) are strings: never convert them to floats.
- Webhooks: `POST <webhook url>` with `{"content": "..."}`; add `?wait=true` to get the message back. A webhook needs no bot but cannot read anything.
- Rate limits: a 429 response gives `retry_after` seconds; wait that long then retry once. Respect the `X-RateLimit-*` headers.
- Gateway intents: `GUILD_MEMBERS`, `GUILD_PRESENCES` and `MESSAGE_CONTENT` are privileged and must be enabled in the Developer Portal; without MESSAGE_CONTENT the bot sees empty message text outside DMs and mentions.
- Adding a bot to a server: OAuth2 URL with `scope=bot applications.commands` and a `permissions` integer.
- Automating a normal USER account with a user token (self-bots) is against Discord's Terms of Service; use bot tokens and webhooks only.
- Slash commands are registered with `POST /applications/{app_id}/commands` (global, can take time to appear) or the guild-scoped route (instant, good for testing).
