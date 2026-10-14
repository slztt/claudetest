---
title: Gemini API and Google AI Studio keys
domain: google
kind: knowledge
tags: google gemini api key genai python generate_content model grounding search
created: seed
---
- Python package `google-genai` (`from google import genai`). `client = genai.Client(api_key=KEY); r = client.models.generate_content(model="gemini-2.5-flash", contents="..."); print(r.text)`. The older `google-generativeai` package is deprecated.
- REST: `POST https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent` with header `x-goog-api-key`. Model names change often (previews are retired); research the current names and prefer a stable one.
- Search grounding: `config=types.GenerateContentConfig(tools=[types.Tool(google_search=types.GoogleSearch())])`; sources are in `candidates[0].grounding_metadata`.
- Free keys come from aistudio.google.com/apikey and have per-minute and per-day limits; handle 429 with a delay.
- Structured output: set `response_mime_type="application/json"` and a response schema.
