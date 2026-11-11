# GeoSentinel Precautions and Safety Rules

This project supports disaster information and reporting. It must fail safely.
It is not a replacement for emergency services, government orders, or trained
responders.

## Secrets and privacy

- Never commit keys or secrets. Use:
  - `Frontend\Resq-AI\.env.local` for browser-only local configuration.
  - `Backend\server\.env` for backend secrets.
- Keep `.env.example` files limited to placeholders.
- Rotate any key that has been pasted into chat, screenshots, logs, or a
  repository.
- Do not expose backend API keys in frontend JavaScript.
- Avoid storing unnecessary personal data in prediction or audit records.
- Store uploaded files in durable protected storage in production, not a local
  public directory.

## Windy and weather data

- Windy Map Forecast is the primary map provider.
- Windy keys are browser-visible public keys and must be restricted by exact
  allowed domains.
- `localhost:5173` and `127.0.0.1:5173` are different domains.
- OpenWeather is optional. Missing or invalid OpenWeather data must show
  unavailable/stale status, never fabricated weather.
- Do not describe Windy visual layers as flood-risk predictions unless a
  separately validated prediction result is displayed.

## Flood-risk model

- The current model is a deterministic baseline and is not approved for live
  emergency alerts.
- Every result must expose status such as `SIMULATED`, `STALE`, or
  `UNAVAILABLE` where applicable.
- Do not convert an unavailable result into LOW or SAFE.
- Do not map weather readings to the 20 model features as if those mappings were
  scientifically validated. Mark them as derived/simulated until domain review.
- Complete calibration, leakage analysis, provenance review, and expert review
  before operational use.

## AI assistant and RAG

- Cached FAQs may answer only general, low-risk safety questions.
- Jurisdiction-specific questions must use approved, current government
  documents and citations.
- Refuse unsupported questions with `NO_SUPPORT`.
- Provider failures must be visible; never return a success-shaped invented
  answer.
- Treat uploaded documents and user messages as untrusted prompt content.
- Redact personal data before sending approved context to an external provider.
- Do not claim that a local starter FAQ is an official government source.

## Emergency UX

- Keep the Help action visible, red, animated, keyboard-accessible, and easy to
  tap.
- Preserve reduced-motion behavior.
- Tell users to contact local emergency services first for immediate danger.
- Do not add a phone number without a verified jurisdiction and explicit
  product approval.
- Help reports require location and should clearly communicate submission
  success or failure.

## Admin and production

- Enforce admin authorization server-side for every mutation.
- Audit report, notification, guideline, rescue-center, and emergency status
  changes.
- Keep guideline documents pending until an administrator verifies the source.
- Add malware scanning and durable object storage before production uploads.
- Disable `ALLOW_ADMIN_REGISTRATION=true` before public deployment.
- Use Atlas least-privilege credentials, HTTPS, monitoring, rate limits,
  backups, restore tests, load tests, and rollback procedures.
