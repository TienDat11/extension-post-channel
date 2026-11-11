# Findings — fbq-auth-audit

Case: browser extension auth/session model. Preset offline-sample, sample = own packed source.

## Evidence

- E1 `manifest.json`: MV3, permissions `storage|unlimitedStorage|tabs|notifications`, host `https://*.facebook.com/*`, no `cookies`/`webRequest`/`scripting`/`<all_urls>`.
- E2 rea `inspect_artifact`: sha256 716bb1007c89cd3bacba93518d1b1a36aed21c7642f34eacaff80d4b7ede352e, 27 files, 0 integrity contradiction.
- E3 `src/bg/sw.js:1-133`: service worker only tabs/notifications/storage, zero fetch to facebook.
- E4 `src/content/adapter-group.js`: execCommand insert (:66), wait post button enabled (:184,:220), ALERT -> rate_limited (:249).
- E5 Chrome Web Store (Multigroup Poster v1.2.9.101, 07/11/2026): "uses your existing session", "reads the existing session cookie... never sees, stores, or transmits your password", "Fast sends in the background; Safe uses Facebook's normal composer".

## Finding

1. No authentication layer exists in this product class. Session is owned by the browser; extension operates inside the facebook.com origin.
2. Two execution paths only: DOM composer (Safe) and background endpoint with `fb_dtsg`/`lsd` + `credentials: include` (Fast). Current code is 100% DOM.
3. Permission surface is all-or-nothing; a truthful privacy claim can only be "no data leaves the machine", never "we only read your posts".
4. Competitor differentiates on anti-duplicate: per-group image mutation (crop/mirror/brightness/noise/fresh metadata).

## Path

- v1: DOM-only, session probe before each run, one Chrome profile per account, no `cookies`/`webRequest`/`debugger`/`<all_urls>`.
- Endpoint mode gated behind telemetry + daily kill-switch.
- Any AI bridge stays local (pairing code), drafts only, user confirms.

## Limits

- "Fast" mechanism inferred, not observed; Multigroup's CRX was not downloaded.
- No dynamic run against a live account; nothing here proves posting works end-to-end.
