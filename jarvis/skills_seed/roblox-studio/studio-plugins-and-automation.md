---
title: Automating Roblox Studio with plugins
domain: roblox-studio
kind: knowledge
tags: roblox studio plugin toolbar button changehistory scriptservice automation instance create
created: seed
---
- Studio cannot be driven headless from outside. Automation is done with a Studio plugin: a script with access to the `plugin` object, saved in the Plugins folder (Windows: `%LOCALAPPDATA%\Roblox\Plugins`). run_script with language `luau` writes such a plugin with a button on a JARVIS toolbar; the user clicks the button once, and Studio runs the code.
- Plugin basics: `local toolbar = plugin:CreateToolbar("JARVIS"); local button = toolbar:CreateButton("id", "tooltip", "", "Label"); button.Click:Connect(function() ... end)`.
- Wrap edits in an undo step: `local H = game:GetService("ChangeHistoryService"); local id = H:TryBeginRecording("JARVIS edit"); ... H:FinishRecording(id, Enum.FinishRecordingOperation.Commit)` (older code uses `SetWaypoint`).
- Create scripts from a plugin: `local s = Instance.new("Script"); s.Name = "X"; s.Source = [[...]]; s.Parent = game.ServerScriptService`. Plugins may set `Source`; running games may not. To edit an open script prefer `ScriptEditorService:UpdateSourceAsync`.
- Selection: `game:GetService("Selection"):Get()`. Studio-only APIs are not available in published games.
- Studio loads plugin files at start-up; after writing a new plugin file the user may need to restart Studio or use Plugins > Manage Plugins.
- The result cannot be checked automatically: ask the user whether it worked, then call script_outcome so the skill folder learns it.
- Large projects are better managed as files with Rojo (rojo.space), which syncs a folder of .lua/.luau files into Studio; research the current Rojo commands before using it.
