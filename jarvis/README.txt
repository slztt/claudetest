J.A.R.V.I.S.
A voice-first assistant with a holographic HUD that can operate your PC.
JARVIS-3: works with almost any AI model, a 3D wireframe hologram interface and a holographic Earth with live satellites.

INSTALL: ONE FILE
Windows: double-click JARVIS.bat. That is all. It works on its own too (download just that file and run it).
It scans the PC and sets up everything that is missing, then launches JARVIS:
  1. finds JARVIS next to it, or downloads it from GitHub into %LOCALAPPDATA%\JARVIS\app
  2. finds a 64-bit Python 3.11-3.13, or installs Python 3.12 for you (winget, else python.org)
  3. builds JARVIS's own environment and installs every package (core, wake word, automation, voice, speech)
  4. scans your graphics card and asks once whether to install the FREE local AI (Ollama + the best model for
     your GPU + a vision model); answers itself after 25 seconds if you walk away
  5. downloads the free British voice and local speech recognition, a browser for automation if you have none,
     and connects MCP servers it finds (Claude Desktop config, Blender, Node-based thinking tools)
  6. makes the app: Start menu + desktop "JARVIS" with its icon, plus "JARVIS Setup and Repair" and "JARVIS Update";
     asks once whether JARVIS should start with Windows
  7. starts the local AI engine if needed and launches JARVIS (first run opens Configuration if no brain is set)
Later runs take a second: a health check, then launch. Options: JARVIS.bat repair | update | nolocal | nolaunch.
Mac/Linux: ./start.sh does the same (Linux also needs: sudo apt install libportaudio2).
Want a cloud brain instead? Paste a Gemini key (aistudio.google.com/apikey) or any provider's key in Configuration.

THE FILM VOICE (Fish Audio)
- JARVIS speaks with the "Jarvis (MCU) J.A.R.V.I.S" voice from Fish Audio:
  https://fish.audio/m/612b878b113047d9a770c069c8b4fdfe/
- Create a free account at fish.audio, open the API section of your dashboard, create an API key, and paste it
  into Configuration (cog, bottom right) under "Fish Audio API key". Fish gives some free credit; after that it is
  pay-as-you-go. Without a key (or if the credit runs out) he uses the built-in Gemini voice instead.

WAKING HIM
- Say "Hey JARVIS". The wake word is detected on your PC, so nothing is sent anywhere until you say it.
- After he answers he keeps listening for about 8 seconds so you can follow up without repeating it.
- No wake word working? Click the glowing core, or press / and type a command.
- Esc stops him mid-sentence. The mic button mutes him completely.

WHAT HE CAN DO
He prefers commands and the keyboard to moving the mouse: PowerShell, opening apps and sites (including
incognito / InPrivate windows in Chrome, Edge, Firefox or Brave), clicking and filling buttons and fields by name,
typing and shortcuts into a chosen window, files, windows, volume and media, clipboard, web search, weather,
timers, tasks, notes and contacts. Messages to WhatsApp or email are sent for you (he types them and presses Send).
He sees your screen on request ("look at this"): the monitor you are using, just the active window, or all monitors,
and can save a screenshot to Pictures\Screenshots and copy it to the clipboard.
If something is unclear (which contact, what to say, which country a phone number is from) he asks first.
Save phone numbers with the country code, e.g. +44 7700 900123.

AUTHORISATION
Risky actions (deleting, installing, overwriting, power, registry...) show an AUTHORISATION card:
Enter allows, Esc denies. Tick "Auto-authorise for this session" on the card to stop being asked until you close
JARVIS; a chip at the bottom left shows it is on, and clicking it turns it off. Disk formatting, partitioning and
similar irreversible commands always ask, even then.

NOTES
- His title for you ("sir") can be changed with ADDRESS at the top of jarvis.py (set it to "" for none).
- Settings and notes live in the .jarvis folder in your home directory.
- If he misses the wake word, raise "Wake word sensitivity"; if he wakes by accident, lower it.

JARVIS-2: WHAT'S NEW
Research first: for Roblox Studio, Roblox, Discord, Blender and Google work he must call research() before he may run a
script. It reads his skill folder, a Google-grounded answer and the official docs. (Switch off in Control Centre > Settings.)
Scripts, not guesses: every multi-step job is one script, run by the right interpreter (Python, PowerShell, bash, cmd, Node,
Blender's bpy headless; Luau becomes a Roblox Studio plugin button). Each run is checked against expected files/output.
He only says "done" when the check passed, retries up to three times, then reports the failure honestly.
Background: say "do this in the background" (or type a goal in Control Centre > Jobs). A worker researches, scripts,
verifies and reports back out loud. You can see, read and stop jobs in the Control Centre; the limit is in Settings.
Learning: verified scripts are saved as recipes and failures as lessons in ~/.jarvis/skills/<domain>/ as plain markdown.
Browse, edit or delete them in Control Centre > Skills. Built-in knowledge notes live in skills_seed/ (never overwritten).
Administration: file_ops (deletes go to a recoverable trash), process_control, download_file, api_request (Discord and
Roblox credentials added for you), install_python_package, find_program, run_script with admin rights.
Access levels: Control Centre > Access sets off / ask if risky / ask always / allow for files, programs, scripts, admin, network.
Settings: themes (cyan, violet, emerald, amber, crimson, mono), dry-run mode, job limit, research time, worker model,
Blender path, Discord token / webhook, Roblox Open Cloud key. Open the Control Centre with the grid button in the command bar.
Honest limits: nobody can promise 100% accuracy. Roblox Studio itself can only be driven through a plugin that you click once,
so those results are confirmed by you ("it worked"), which teaches him. APIs change, so he re-reads the docs each time.

JARVIS-2 PERSONAL LAYER (Control Centre > Personal)
calendar (local, clash warnings, free slots, spoken reminders, .ics export), inbox (read-only IMAP, drafts saved but never sent),
finance (ledger, budgets, CSV import, advice from your real numbers), memory + knowledge graph (kept across sessions),
workflow (record the tool calls he makes for you, replay them) and custom_command (your own phrases), learn_online (trusted
documentation hosts only, saved to the skill folder), explain_actions (audit trail), system_review (performance and
security, read-only), daily_brief, camera_look (needs opencv-python), redact_text.
Stored in ~/.jarvis/personal/. Offline mode (Settings) blocks every network tool, but the live voice talks to Google's Gemini.
Not built (needs hardware or services that do not exist here): AR headset control, joining meetings as you, real
gesture tracking beyond single camera frames, direct dealings with other AI services beyond api_request.

JARVIS-3: ANY MODEL
Configuration (cog) > AI model provider. Choose one:
  Gemini Live (default, native voice) · Anthropic Claude · OpenAI · Google Gemini text models · OpenRouter (hundreds of models)
  · Groq · Mistral · DeepSeek · xAI Grok · Together · Ollama (local) · LM Studio (local) · any custom OpenAI-compatible server.
Paste the provider's key (local models need none), press List to see every model your key can use, pick one, press Test model.
Every tool, the authorisation cards, the background worker and the hologram work the same with every provider.
Voice with non-Gemini models: the wake word still runs on your PC. Speech is turned into text by the provider's Whisper
(OpenAI, Groq), by Gemini if you also keep a Gemini key, or entirely on your PC with "pip install faster-whisper".
Replies are spoken by the Fish Audio film voice if you have a key, OpenAI's voice when OpenAI is the provider, or your
computer's own voice (Windows/macOS built in; Linux needs espeak-ng). Choose under Voice input / Voice output.
Screenshots ("look at this") are sent to the model as images, so pick a vision-capable model for that.
Small local models may not support tools; JARVIS then still chats but cannot act.

JARVIS-3: HOLOGRAPHIC EARTH
Press G (or the globe button, top right), or just ask: "show me the Earth", "where is the ISS?", "track Hubble",
"take me to Tokyo", "ride along with the space station", "show the GPS satellites", "set my home to Leeds".
- Dot-matrix continents, vector coastlines and borders (Natural Earth), the real day/night terminator and subsolar point.
- Live satellites from CelesTrak (stations, brightest, GPS, weather, science, geostationary, Starlink), propagated with SGP4
  in real time and refreshed every 3 hours. Offline it shows clearly labelled simulated orbits instead.
- Click a satellite (or search for it) to lock on: orbit, ground track, coverage footprint, altitude, speed, period.
  Satellite view (V) rides along with it looking down at Earth.
- Drag to rotate, scroll or +/- to zoom, arrows to turn, [ and ] to step through notable satellites, Esc to release.
- Altitudes above 2,000 km are drawn compressed so high orbits fit on the screen; the numbers are always real.
Everything 3D (three.js, satellite.js, the map) ships inside the hud/vendor folder, so the HUD loads with no internet.

JARVIS-3: ACCESSIBILITY
Configuration > Accessibility: reduce motion (also follows your system setting), high contrast, captions on/off and
text/panel size. Every button has a label, JARVIS's replies are read out by screen readers, the authorisation card is a
proper dialog, and everything on the hologram (satellite readouts, places) is also written out as text.

JARVIS-3: FREE LOCAL AI (THINKS, PRIVATE, NO KEY)
Configuration (cog) > "Set up local AI". One click: installs Ollama, checks your graphics card, downloads the best free
model your PC can run, plus a small vision model so it can see your screen, and switches JARVIS to it with a local voice.
  60 GB+ (big Mac / workstation): gpt-oss:120b    22-32 GB GPU: Qwen3.6 35B (or qwen3:30b)    14-16 GB: gpt-oss:20b
  8-12 GB: Qwen3.5 9B (or qwen3:8b)               less / no GPU: qwen3:4b (works on the CPU, slowly)
These "think" before answering (Thinking setting: automatic, always, hard, briefly, off) and call tools.
JARVIS talks to Ollama natively, so the model gets a large context (8-32k depending on your GPU) instead of Ollama's tiny
default, and only the ~30 tools that matter for each request are sent (small models get confused by 80+). That is what
made local models feel "really bad" before. A bigger GPU = a smarter JARVIS. Hosted models (Claude, GPT, Gemini) are
still smarter than any model a home PC can run; you can switch at any time.

JARVIS-3: FREE VOICE
Voice output > Kokoro: a free, offline, natural British voice ("George" is the most JARVIS-like; also Lewis, Daniel,
Fable). Downloads once (about 340 MB) and runs on the CPU faster than real time. It works with every brain, including
Gemini Live. Fish Audio's film voice is still available if you have a key. Speech recognition runs locally too
(faster-whisper), so a local setup sends nothing to the internet except searches and web pages.

JARVIS-3: MCP (ROBLOX STUDIO, BLENDER AND MORE)
Configuration > MCP servers. Add a preset or import what you already set up for Claude Desktop / Cursor:
- Roblox Studio: install the official Roblox Studio MCP server (github.com/Roblox/studio-rust-mcp-server); its installer
  adds the Studio plugin. Then "Import from Claude Desktop" or add the roblox_studio preset. Keep Studio open.
- Blender: blender-mcp. Add the preset (JARVIS installs uv for you), install the add-on in Blender, then
  N panel > BlenderMCP > Start MCP Server.
- Also: Playwright browser, file system, fetch, sequential thinking, memory, GitHub, or any server (Edit JSON).
Their tools appear to JARVIS as server__tool and work with every model. He can add servers himself ("set up the Blender MCP").

JARVIS-3: HE DOES THINGS ON HIS OWN
- Standing orders (Configuration): permanent instructions he follows without you. The default makes him act instead of
  asking, finish and verify jobs, try three approaches before giving up, research before guessing, and build holograms when
  explaining physical things. Say "from now on, always ..." and he adds the rule himself.
- Autopilot: "work on this by yourself: ..." He plans, uses every tool (the screen too if you allow it), checks results,
  fixes problems and reports back. Up to 4 hours.
- Deep research: "research ... in the background". Many searches, many sources, follow-ups for gaps, then a cited report
  in Documents/JARVIS Research. Several can run at once while you keep talking.
- Scheduled routines (automation tool): "every weekday at 8:30, open Outlook and tell me how many unread emails I have".

JARVIS-3: PC CONTROL THAT WORKS
He picks the most reliable way to reach anything, verifies, and falls back automatically:
commands/COM/Settings links -> his own browser (Playwright; sign in once, it remembers) -> any app's buttons and fields
through Windows UI Automation (no mouse) -> reading and clicking text on screen (Windows' built-in OCR) -> screenshot + mouse.
wait_for waits for windows, programs, files, on-screen text or an idle CPU instead of guessing delays.

JARVIS-3: HOLOGRAMS HE BUILDS
Ask him to show or explain an object ("show me how a jet engine works", "hologram of my Roblox castle") and he designs it
from parts and projects it as a wireframe hologram with labelled callouts; "explode it" separates the parts. He can also
project real 3D files (.glb, .gltf, .obj, .stl), e.g. a model exported from Blender. Drag to turn, scroll to zoom, Esc to exit.

JARVIS-3: CALENDAR
Press C, click the calendar button, or ask ("open my calendar for March"). Month, week, day, agenda and year views;
plain-English quick add ("Gym every Monday and Wednesday 7pm"); repeating events; reminders; drag to reschedule;
categories; search; public holidays; 16-day forecast (after setting a home location on the Earth view); moon phases;
free-time finder; .ics import/export for Google Calendar, Outlook and Apple Calendar.

Hologram too fast or too busy? Configuration > Accessibility > Hologram speed, or Reduce motion.
