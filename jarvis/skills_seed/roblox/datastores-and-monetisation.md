---
title: DataStores and monetisation rules to remember
domain: roblox
kind: knowledge
tags: roblox datastore save player data bindtoclose updateasync gamepass developer product marketplaceservice robux
created: seed
---
- DataStore calls can fail and are rate limited: always `pcall`, retry with a delay, and do not save on every tiny change. Save on `Players.PlayerRemoving` AND inside `game:BindToClose` (loop over players there) so shutdowns do not lose data.
- Prefer `UpdateAsync` over `GetAsync` then `SetAsync` for values that change based on the old value (currency, counters): it avoids lost updates.
- Data stores only work in a published experience; to test in Studio enable Studio access to API Services in Game Settings > Security.
- Keys such as `"Player_" .. player.UserId`; never use the player name. Values must be JSON-serialisable (no Instances, no mixed tables).
- Purchases: Game Passes check with `MarketplaceService:UserOwnsGamePassAsync`; Developer Products grant items in `MarketplaceService.ProcessReceipt`, which must return `Enum.ProductPurchaseDecision.PurchaseGranted` only after the grant is saved.
- Do not invent economy rules: Robux amounts, the marketplace fee and payout limits are set by Roblox and change; research them.
