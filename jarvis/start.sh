#!/bin/bash
cd "$(dirname "$0")"
[ -d venv ] || python3 -m venv venv
if [ ! -f venv/core4.flag ]; then
  venv/bin/pip install -q --upgrade pip && venv/bin/pip install -r requirements.txt && touch venv/core4.flag
fi
[ -f venv/wake3.flag ] || { venv/bin/pip install -r requirements-wake.txt && touch venv/wake3.flag; } || echo "Wake word packages failed to install; click the core or type to talk."
venv/bin/python jarvis.py
