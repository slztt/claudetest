J.A.R.V.I.S.
A voice-first assistant with a holographic HUD that can operate your PC.
JARVIS-3: works with almost any AI model, a 3D wireframe hologram interface and a holographic Earth with live satellites.

INSTALL (Windows)
1. Nothing to install by hand: the installer finds a 64-bit Python 3.11-3.13 or installs Python 3.12 for you
   (the newest Python versions and 32-bit Python lack packages JARVIS needs).
2. Get a free Gemini API key: https://aistudio.google.com/apikey
3. Double-click "Install JARVIS.bat". It sets everything up and adds JARVIS to your Start menu
   and Desktop. (Or just double-click "Start JARVIS.bat" to run without shortcuts.)
   Mac/Linux: run ./start.sh   (Linux also needs: sudo apt install libportaudio2)
4. First launch needs internet: it installs packages, downloads the wake-word model and loads the
   3D engine. Click the cog (bottom right), paste your API key, pick your mic and speakers, press Close.

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
