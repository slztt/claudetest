---
name: roblox-project-setup
description: Scaffold or repair a Rojo-based Roblox project with a toolchain manager (Rokit), Rojo, Selene, StyLua, and Wally. Use when the user wants to start a Roblox game in this repo, sync code into Roblox Studio, add linting/formatting, or add Wally packages.
---

# Roblox project setup (Rojo)

Use this when the repo has no Roblox project yet, or when parts of the toolchain are missing. Check what exists first (`ls`, `cat rokit.toml default.project.json`) and only add what is missing.

## 1. Toolchain
Install [Rokit](https://github.com/rojo-rbx/rokit) if `rokit` is not on PATH, then:

```sh
rokit init
rokit add rojo-rbx/rojo
rokit add Kampfkarren/selene
rokit add JohnnyMorganz/StyLua
rokit add UpliftGames/wally     # only if the user wants packages
```

This writes `rokit.toml` with pinned versions. Commit it.

## 2. Layout

```
src/
  server/   -> ServerScriptService.Server
  client/   -> StarterPlayer.StarterPlayerScripts.Client
  shared/   -> ReplicatedStorage.Shared
default.project.json
selene.toml
stylua.toml
```

`default.project.json`:

```json
{
  "name": "game",
  "tree": {
    "$className": "DataModel",
    "ReplicatedStorage": {
      "Shared": { "$path": "src/shared" },
      "Packages": { "$path": "Packages" }
    },
    "ServerScriptService": {
      "Server": { "$path": "src/server" }
    },
    "StarterPlayer": {
      "StarterPlayerScripts": {
        "Client": { "$path": "src/client" }
      }
    }
  }
}
```

Drop the `Packages` entry if Wally isn't used. Starter files:

- `src/server/init.server.luau` – `print("Server started")`
- `src/client/init.client.luau` – `print("Client started")`
- `src/shared/.gitkeep` (or a first ModuleScript)

## 3. Lint and format config
`selene.toml`:
```toml
std = "roblox"
```

`stylua.toml`:
```toml
column_width = 120
line_endings = "Unix"
indent_type = "Tabs"
indent_width = 4
quote_style = "AutoPreferDouble"
call_parentheses = "Always"
```

## 4. Wally (optional)
```sh
wally init
```
Add dependencies under `[dependencies]` in `wally.toml`, then run `wally install`. Add `Packages/` and `ServerPackages/` to `.gitignore`.

## 5. .gitignore
```
Packages/
ServerPackages/
*.rbxl
*.rbxlx
*.rbxl.lock
*.rbxlx.lock
sourcemap.json
```

## 6. Verify
```sh
stylua --check src
selene src
rojo build -o build.rbxlx
```
All three must pass. Tell the user to run `rojo serve` and connect with the Rojo plugin in Roblox Studio to live-sync.

Follow the `roblox-luau` skill for any code you write.
