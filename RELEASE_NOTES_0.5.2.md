# Tylo Sauna v0.5.2

- The temperature graph now includes an integrated **Sessions · Heating and standby** timeline for the selected period.
- Added long-term Recorder statistics sensors for numeric heating/standby state (0/1). The activity ribbon works with the shared TadoX date-range picker, including the 3-year preset.
- Current and target temperature and humidity are overlaid in their long-term graphs. Target values are retained in statistics when heating is off.
- Removed the separate short-retention heating/lighting/connectivity history card.
- Sidebar icon changed to `mdi:hot-tub`.
- All controls, entity IDs, the original climate mode indicator, safety blocking and standard HACS release mechanism are preserved.

**Important:** Historical activity cannot be reconstructed before the new sensors start recording. Long-term averages approximate activity per time bucket; they do not provide exact session boundaries or runtime totals.
