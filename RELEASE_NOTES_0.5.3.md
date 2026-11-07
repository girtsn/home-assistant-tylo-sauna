# Tylo Sauna v0.5.3 — reliable sidebar loading

- Register the integration-managed Sauna sidebar component synchronously, before loading its date-picker dependency. This avoids intermittent blank pages on slow frontend updates.
- Display a helpful loading/error message and **Retry loading** button when the date-picker module is temporarily unavailable.
- Remove automatic periodic manifest polling and page-reload attempts, while retaining versioned frontend assets and a guarded one-time reload when the Home Assistant panel version changes.
- Preserve the already working current/target temperature and humidity history, long-term heating/standby session ribbon, timer, device controls, mode indicator, and original safety checks.

After upgrading via HACS, restart Home Assistant and reopen the Sauna sidebar.
