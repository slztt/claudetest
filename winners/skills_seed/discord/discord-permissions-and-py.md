---
title: Discord permission bits and discord.py skeleton
domain: discord
kind: knowledge
tags: discord permissions bitfield administrator manage channels roles kick ban discord.py bot python intents slash
created: seed
---
- Permission bits (value = 1 << n): CREATE_INSTANT_INVITE 0, KICK_MEMBERS 1, BAN_MEMBERS 2, ADMINISTRATOR 3 (=8), MANAGE_CHANNELS 4, MANAGE_GUILD 5, VIEW_CHANNEL 10 (=1024), SEND_MESSAGES 11 (=2048), MANAGE_MESSAGES 13, EMBED_LINKS 14, ATTACH_FILES 15, READ_MESSAGE_HISTORY 16, MANAGE_ROLES 28, MANAGE_WEBHOOKS 29. Add the numbers to combine. Permissions arrive in the API as strings.
- A bot can only manage roles BELOW its own highest role in the server's role list; a 403 on role or kick actions is usually this.
- discord.py (install_python_package `discord.py`):
```python
import discord
intents = discord.Intents.default()
intents.message_content = True   # needs the privileged intent enabled in the Developer Portal
client = discord.Client(intents=intents)
@client.event
async def on_ready(): print("ready", client.user)
client.run(TOKEN)
```
- For slash commands use `discord.app_commands` with `app_commands.CommandTree(client)`, and call `await tree.sync()` once after changes. Never hard-code the token in a script: read it from an environment variable.
- A bot that must stay online is a long-running process: run it as a background job and stop it with cancel_job.
