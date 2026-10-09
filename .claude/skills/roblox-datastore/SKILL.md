---
name: roblox-datastore
description: Safe player-data persistence on Roblox with DataStoreService - load/save with pcall and retries, UpdateAsync, session locking, BindToClose, and request budgets. Use when writing or reviewing code that saves or loads player data, leaderboards, or any DataStore/OrderedDataStore usage.
---

# Roblox DataStores

Data loss is the most damaging bug a Roblox game can ship. Follow these rules.

## Rules
1. **Every DataStore call is wrapped in `pcall`** and retried with backoff (e.g. 3 attempts, 1s/2s/4s). Calls fail routinely.
2. **Use `UpdateAsync` for saves**, not `SetAsync`. It lets you reject stale writes (compare a version or session id inside the transform).
3. **Never save data that failed to load.** If loading fails, kick the player or mark their session as unsaved. Otherwise you overwrite real data with defaults.
4. **Session locking:** store a lock (`JobId` + timestamp) in the record. Refuse to load if another live server holds the lock, so two servers don't write the same key.
5. **Save on `PlayerRemoving` and in `game:BindToClose`.** In `BindToClose`, save every remaining player in parallel (`task.spawn`) and wait for them all to finish. The server shuts down about 30 seconds after `BindToClose` fires.
6. **Autosave** every few minutes, not every change.
7. **Respect budgets:** check `DataStoreService:GetRequestBudgetForRequestType(...)` before bursts of calls.
8. **Key per player:** `"Player_" .. player.UserId`. Never key on `Name`, because names can change.
9. **Schema version** field in the record, plus a `reconcile(data, template)` step that fills in missing fields from defaults on load.
10. Values must be JSON-serializable (no Instances, Vector3, CFrame, or mixed tables), and each key's value must stay under 4 MB.
11. In Studio, DataStores only work if "Enable Studio Access to API Services" is on. Guard against accidentally writing to the production store while testing (use a separate store name or a flag).

Consider an existing, well-tested library (ProfileStore / ProfileService, Lapis, DataStore2) before you hand-roll session locking. Ask the user which they prefer.

## Minimal pattern

```luau
--!strict
local DataStoreService = game:GetService("DataStoreService")
local Players = game:GetService("Players")

local store = DataStoreService:GetDataStore("PlayerData_v1")
local TEMPLATE = { version = 1, coins = 0 }
local sessions: { [Player]: { data: typeof(TEMPLATE), loaded: boolean } } = {}

local function retry<T>(fn: () -> T): (boolean, T | string)
	local delay = 1
	for attempt = 1, 3 do
		local ok, result = pcall(fn)
		if ok then return true, result end
		if attempt < 3 then task.wait(delay); delay *= 2 end
		warn("DataStore attempt", attempt, "failed:", result)
	end
	return false, "exhausted retries"
end

local function save(player: Player)
	local session = sessions[player]
	if not session or not session.loaded then return end -- rule 3
	retry(function()
		return store:UpdateAsync("Player_" .. player.UserId, function(_old)
			return session.data
		end)
	end)
end

Players.PlayerAdded:Connect(function(player)
	local ok, data = retry(function()
		return store:GetAsync("Player_" .. player.UserId)
	end)
	if not ok then
		player:Kick("Could not load your data, please rejoin.")
		return
	end
	local loaded = table.clone(TEMPLATE)
	for k, v in (data or {}) :: any do loaded[k] = v end
	sessions[player] = { data = loaded, loaded = true }
end)

Players.PlayerRemoving:Connect(function(player)
	save(player)
	sessions[player] = nil
end)

game:BindToClose(function()
	local pending = 0
	for player in sessions do
		pending += 1
		task.spawn(function() save(player); pending -= 1 end)
	end
	while pending > 0 do task.wait() end
end)
```

This sketch skips session locking (rule 4). Add it, or use ProfileStore, before you ship.
