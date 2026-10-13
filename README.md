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
- **Accessibility**: reduced motion, high contrast, captions, text size, hologram speed, screen-reader labels and keyboard control.
- **Free local AI**: one-click Ollama setup that picks the best thinking model for your GPU, native Ollama API with large context, tool routing, local vision helper (`jarvis/jv_models.py`).
- **Free voice**: Kokoro British voice (offline) and local speech recognition (faster-whisper).
- **MCP client**: Roblox Studio, Blender, Playwright, GitHub and any MCP server; tools work with every model (`jarvis/jv_mcp.py`).
- **Autonomy**: standing orders, autopilot, background deep research with cited reports (`jarvis/jv_power.py`).
- **PC control**: UI Automation, OCR click, Playwright browser, wait_for, scheduled routines (`jarvis/jv_auto.py`).
- **Calendar**: month/week/day/agenda/year holographic views with recurring events and natural-language add (`jarvis/jv_calendar.py`, `jarvis/hud/calendar.js`).
- **Generated holograms**: JARVIS designs objects from parts or loads .glb/.obj/.stl files (`jarvis/hud/holo.js`).

`JARVIS-3.zip` is the ready-to-run package. See `jarvis/README.txt` for setup.
