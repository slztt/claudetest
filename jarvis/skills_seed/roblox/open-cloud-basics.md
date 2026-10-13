---
title: Roblox Open Cloud: keys, base URL, common endpoints
domain: roblox
kind: knowledge
tags: roblox open cloud api key datastore messaging universe place publish http
created: seed
---
- Base URL `https://apis.roblox.com`; authenticate with the header `x-api-key: <Open Cloud key>` (api_request with service `roblox` adds it). Keys are made at create.roblox.com > Credentials, scoped to specific experiences and operations.
- Universe ID is not the Place ID. The Universe ID is shown in Creator Hub for the experience; a place's universe can be looked up at `https://apis.roblox.com/universes/v1/places/<placeId>/universe`.
- Data stores (v2): `/cloud/v2/universes/{universeId}/data-stores/{name}/entries/{id}`; the older v1 form is `/datastores/v1/universes/{id}/standard-datastores/datastore/entries/entry?datastoreName=..&entryKey=..`. Verify the current path with research before using either.
- Messaging Service: `POST /messaging-service/v1/universes/{universeId}/topics/{topic}` with JSON `{"message": "text"}`; servers receive it through `MessagingService:SubscribeAsync`.
- Publishing a place file: `POST /universes/v1/{universeId}/places/{placeId}/versions?versionType=Published` with the raw .rbxl/.rbxlx as the body and `Content-Type: application/octet-stream`.
- A 403 almost always means the key lacks the scope or the experience was not added to the key.
- The Roblox website APIs (`users.roblox.com`, `games.roblox.com`, etc.) are separate and change without notice; research the current shape and handle errors.
