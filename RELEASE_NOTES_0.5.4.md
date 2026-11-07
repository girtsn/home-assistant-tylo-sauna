# Tylo Sauna v0.5.4 — Aligned frontend loading and cache handling

The integration-managed Sauna sidebar is now backed by a small permanent loader
that checks the installed manifest with no-cache requests, imports the release
under a version-specific path and swaps the dashboard without a Home Assistant
page reload.

- Version-scoped custom element names for both the Sauna panel and its shared
  date picker prevent reusing earlier JavaScript classes in an open tab
- Automatic version checks on focus, tab visibility and every minute
- Retry failed dynamic imports (e.g. during HA restart) without losing the
  previous working dashboard
- Defer dashboard changes while a sauna control operation is active
- Preserve existing sauna heating, light, timetable, diagnostic and history
  functionality; no changes to entities or the sauna controller

**Initial migration:** Existing 0.5.3 tabs use the old direct panel. Update in
HACS, restart Home Assistant, then close and reopen the tab. One final hard
refresh might be required if the old Home Assistant shell retains previous
panel registration. Subsequent versions should update in place once the new
loader is active.
