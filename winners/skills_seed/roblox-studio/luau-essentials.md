---
title: Luau scripting essentials and common mistakes
domain: roblox-studio
kind: knowledge
tags: roblox studio luau script task wait getservice remote event server client parent pcall
created: seed
---
- Use `task.wait()`, `task.spawn()`, `task.delay()`; the old `wait()`, `spawn()`, `delay()` are deprecated.
- Services: `local Players = game:GetService("Players")`. Do not index services as `game.Players` in new code.
- Where scripts run: `Script` (server) in ServerScriptService or Workspace; `LocalScript` (client) only runs in StarterPlayerScripts, StarterGui, StarterPack, StarterCharacterScripts or the character; `ModuleScript` runs where it is required. Shared code goes in ReplicatedStorage.
- Client/server: the client can never be trusted. RemoteEvent / RemoteFunction handlers on the server must validate every argument and the sender (`OnServerEvent` gives `player` first). Never let the client decide damage, currency or inventory.
- Set `Parent` LAST when creating instances: `local p = Instance.new("Part"); p.Size = ...; p.Parent = workspace`.
- `WaitForChild` for things that may not exist yet (especially on the client); `FindFirstChild` when absence is fine.
- Wrap anything that can fail (DataStore, HTTP, MarketplaceService) in `pcall` and handle the error.
- `--!strict` at the top enables strict typing; `local x: number = 5`.
- Disconnect connections you no longer need (`conn:Disconnect()`); `Debris:AddItem(part, seconds)` cleans up temporary parts.
- `print` and `warn` go to the Output window; use them for the success line.
