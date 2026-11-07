# Tylo Sauna v0.5.1

## HACS installation and release fix

- Match the proven **Renson Sense / TadoX** fork release model: GitHub Release from validated source, with no special ZIP asset.
- Remove `zip_release` and `filename` from `hacs.json`. This avoids HACS attempting to find a non-existent `tylo_sauna.zip` during a commit-based install.
- Add a Python/JavaScript/JSON validation workflow. Publish new stable versions automatically **only after successful validation** of the current main commit.
- The fork keeps the `tylo_sauna` integration domain, existing configuration entries, entity IDs, and all dashboard and statistics features from v0.5.0.
- No need to reinstall or recreate the device. After updating from the fork through HACS, restart Home Assistant.

GitHub Actions must be enabled in the fork for automatic publishing.
