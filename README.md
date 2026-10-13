# claudetest

Roblox game project with Claude Code skills for Roblox development.

## Claude Code skills (`.claude/skills/`)

| Skill | Use it for |
| --- | --- |
| `roblox-project-setup` | Scaffolding the Rojo toolchain (Rokit, Rojo, Selene, StyLua, Wally) and project layout |
| `roblox-luau` | Luau conventions, client/server split, RemoteEvent security, review checklist |
| `roblox-datastore` | Safe player-data saving/loading with DataStoreService |

Claude loads these automatically when a task matches. You can also run one by name, e.g. `/roblox-project-setup`.

## JARVIS (`jarvis/`)

Voice-first desktop assistant with a holographic HUD, unpacked from `JARVIS-2 (1).zip` and upgraded to JARVIS-3:

- **Any model**: Gemini Live, Claude, OpenAI, Gemini text models, OpenRouter, Groq, Mistral, DeepSeek, xAI, Together, Ollama, LM Studio, or any OpenAI-compatible server (`jarvis/jv_models.py`).
- **3D wireframe hologram HUD**: hex holo-floor, projector beam, radar sweep, wireframe drones, glitch FX (`jarvis/hud/scene.js`).
- **Holographic Earth**: dot-matrix continents, coastlines, live day/night terminator, real satellites from CelesTrak via SGP4, target lock and satellite ride-along view (`jarvis/hud/globe.js`). The model can drive it through the `hologram` tool.
- **Accessibility**: reduced motion, high contrast, captions, text size, screen-reader labels and keyboard control.

`JARVIS-3.zip` is the ready-to-run package. See `jarvis/README.txt` for setup.
