# Tylö Sauna 0.5.9 — Home Assistant calendar timezone

- Date presets and selected days now use the Home Assistant timezone, even when the visitor's browser or mobile phone is in another timezone.
- Correct local midnight boundaries across DST start/end.
- A single calendar date tap selects a full day; a second tap selects an inclusive range.
- Retain existing period navigation, first weekday preferences and sauna settings.
- Add DST and single-date regression tests.
