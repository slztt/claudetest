#!/bin/bash
# J.A.R.V.I.S. one-file launcher for macOS and Linux: sets everything up on first run, then launches.
#   ./start.sh            set up what is missing, then launch
#   ./start.sh repair     rescan and repair       ./start.sh nolocal   skip the local AI       ./start.sh nolaunch
cd "$(dirname "$0")"
APP="$(pwd)"
ARGS=" $* "
say() { printf '\033[%sm%s\033[0m %s\n' "$1" "$2" "$3"; }
say "96" "      J . A . R . V . I . S ." ""

# Python 3.11-3.13
PY=""
for c in python3.12 python3.11 python3.13 python3; do
  if command -v $c >/dev/null && $c -c 'import sys; sys.exit(0 if (3,11)<=sys.version_info[:2]<=(3,13) else 1)' 2>/dev/null; then PY=$(command -v $c); break; fi
done
if [ -z "$PY" ]; then
  if [ "$(uname)" = "Darwin" ] && command -v brew >/dev/null; then say 93 " >>>" "Installing Python 3.12 with Homebrew"; brew install python@3.12 && PY=$(brew --prefix)/bin/python3.12
  else say 91 "  XX" "Install Python 3.12 (python.org, or: sudo apt install python3.12 python3.12-venv), then run this again."; exit 1; fi
fi
if [ -x venv/bin/python ] && ! venv/bin/python -c 'import sys; sys.exit(0 if (3,11)<=sys.version_info[:2]<=(3,13) else 1)'; then rm -rf venv; fi
[ -x venv/bin/python ] || { say 97 " >>>" "Setting up Python ($PY)"; "$PY" -m venv venv || exit 1; }

group() {  # requirements file, flag, label, required?
  if [ -f "venv/$2" ] && [[ "$ARGS" != *" repair "* ]]; then return; fi
  say 97 " >>>" "Installing $3"
  venv/bin/pip install -q --disable-pip-version-check --upgrade pip >/dev/null
  if venv/bin/pip install --disable-pip-version-check -r "$1"; then touch "venv/$2"; say 96 "  OK" "$3 installed"
  elif [ "$4" = "1" ]; then say 91 "  XX" "$3 failed. Check your internet and run this again."; exit 1
  else say 93 "  !!" "$3 did not fully install; JARVIS will retry later."; fi
}
[ "$(uname)" = "Linux" ] && ! ldconfig -p 2>/dev/null | grep -q libportaudio && say 93 "  !!" "Linux needs PortAudio for the microphone: sudo apt install libportaudio2"
group requirements.txt core4.flag "the core packages" 1
group requirements-wake.txt wake3.flag "the wake word" 0
group requirements-auto.txt auto1.flag "the power packages" 0

# scan the PC and set up the local AI, voice, speech, browser and MCP servers
LOCAL=ask; [[ "$ARGS" == *" nolocal "* ]] && LOCAL=no
if [[ "$ARGS" == *" repair "* ]] || ! grep -q '"complete": true' "$HOME/.jarvis/setup.json" 2>/dev/null; then
  venv/bin/python jv_setup.py setup --local $LOCAL
else
  say 96 "  OK" "Health check passed (./start.sh repair to rescan)"
fi

# make the app
if [ "$(uname)" = "Linux" ]; then
  mkdir -p "$HOME/.local/share/applications"
  cat > "$HOME/.local/share/applications/jarvis.desktop" <<DESK
[Desktop Entry]
Type=Application
Name=J.A.R.V.I.S.
Comment=Voice assistant with a holographic HUD
Exec="$APP/venv/bin/python" "$APP/jarvis.py"
Path=$APP
Icon=$APP/jarvis.ico
Terminal=false
Categories=Utility;
DESK
  say 96 "  OK" "App installed: find J.A.R.V.I.S. in your applications menu"
elif [ "$(uname)" = "Darwin" ]; then
  mkdir -p "$HOME/Applications"
  printf '#!/bin/bash\ncd "%s" && exec venv/bin/python jarvis.py\n' "$APP" > "$HOME/Applications/JARVIS.command"
  chmod +x "$HOME/Applications/JARVIS.command"
  say 96 "  OK" "App installed: ~/Applications/JARVIS.command (drag it to the Dock)"
fi

[[ "$ARGS" == *" nolaunch "* ]] && exit 0
if grep -q '"brain_provider": "ollama"' "$HOME/.jarvis/config.json" 2>/dev/null && ! curl -s -m 2 http://localhost:11434/api/version >/dev/null; then
  command -v ollama >/dev/null && (ollama serve >/dev/null 2>&1 &)
fi
say 97 " >>>" "Launching J.A.R.V.I.S."
exec venv/bin/python jarvis.py
