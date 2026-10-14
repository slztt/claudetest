W.I.N.N.E.R.S. BOT
The AI assistant and PC control system for The Winners Club N.I. (winnersclubni.com)
Voice-first, with a gold holographic HUD. Thinks, hears, sees and speaks with Google Gemini (free key).

INSTALL: ONE FILE
Windows: double-click WINNERS.bat. It works on its own too (download just that file and run it).
  1. finds the WINNERS Bot next to it, or downloads it into %LOCALAPPDATA%\WinnersBot\app
  2. finds or installs a 64-bit Python 3.11-3.13
  3. builds the bot's own environment and installs everything (core, "Hey Winners" wake phrase, automation)
  4. asks for your free Gemini key (opens aistudio.google.com/apikey)
  5. makes the app: desktop + Start menu "WINNERS Bot" with the trophy icon, plus "Setup and Repair" and "Update"
  6. launches it. Every start checks for a newer version and updates itself.
It installs separately from JARVIS (own folder, own settings in ~/.winnersbot), so both can live on one PC.
Mac/Linux: ./start.sh

WAKING IT
- Say "Hey Winners" (or "Winners Bot"). The phrase is recognised offline on your PC.
- It keeps listening for a few seconds after answering so you can follow up.
- Or click the glowing core, or press / and type. Esc stops it talking.

LIVE DRAW (D key, or "Hey Winners, draw the winner of the iPhone comp, 500 tickets")
- Full-screen slot-machine reveal with confetti; one or many winners; paste a list of names or give a ticket count;
  leave out void tickets.
- Winners are picked by the PC's cryptographic random generator, never by the AI.
- Every draw is logged to Documents\WINNERS Draws\draws.csv: time, prize, pool, a SHA-256 fingerprint of the exact entry
  list, and the winners, so any draw can be checked later.

FOR THE CLUB
Ask it for competition write-ups, skill questions, Instagram/Facebook captions, winner announcements, customer replies,
spreadsheets of entries, research on prizes and prices, and video edits for social media (vertical crops, captions, music).

EVERYTHING ELSE (same engine as JARVIS)
PC control (apps, files, browser, windows, keyboard, error pop-ups pressed automatically), screen and camera vision,
web research and background jobs, Homework tab (H), video editing with FFmpeg + CapCut hand-off, Roblox Studio control,
calendar (C), holographic Earth (G), camera tracking (O), floating panels, MCP servers, standing orders.

SETTINGS
Cog button (bottom right): Gemini key, microphone and speakers, volume, wake sensitivity, accessibility.
Its title for you ("boss") can be changed with ADDRESS at the top of winners.py.
