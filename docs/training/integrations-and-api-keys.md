# Integrations and API keys

Connectors let the app sync directly from your accounts instead of importing files. Each one accepts **your own** keys or tokens. Secrets are encrypted at rest with AES-256-GCM using a server key, are never returned by the API, and are deleted with the connector.

Open **Settings → Integrations & API keys**, choose a provider, fill in the form, **Connect**, then use **Test** and **Sync now**. Connected accounts also appear on the Import page.

## Email (IMAP)

Works with Gmail, Outlook.com, Fastmail, iCloud, Yahoo and any IMAP server.

| Field | Notes |
|---|---|
| IMAP host | `imap.gmail.com`, `outlook.office365.com`, `imap.fastmail.com`, `imap.mail.me.com`… |
| Port | 993 (TLS) |
| Username | usually your full address |
| App password | Generate one in your provider's security settings (Gmail: [App passwords](https://support.google.com/accounts/answer/185833), requires 2-step verification) |
| Days of history | default 730 |

Sync scans INBOX and the Sent folder, reads headers only, and applies the same bidirectional rule as the mbox importer.

## Google (Gmail + Contacts)

Uses the Gmail API for threads and the People API for contacts. Provide either a short-lived **OAuth access token** (e.g. from the [OAuth Playground](https://developers.google.com/oauthplayground) with scopes `gmail.metadata` and `contacts.readonly`), or a **refresh token** plus your OAuth **client ID/secret** so the app can refresh it. An optional Gmail search query limits what's scanned (default `newer_than:2y -category:promotions -category:social`).

## Microsoft 365 / Outlook

Uses Microsoft Graph with a user **access token** that has `Mail.Read` and `Contacts.Read`. Obtain one from your Entra app registration or Graph Explorer. Sync reads the Inbox and Sent Items folders plus your contacts.

## X (Twitter)

Needs your **@username** and an API v2 **bearer token** from the [developer portal](https://developer.x.com). Sync fetches followers and following with names, avatars, bios and locations, and resolves the numeric IDs from an archive import. The free tier is enough for lookups; large accounts can cap **Max accounts per direction**.

## Facebook Graph API

Needs a **user access token** with `user_friends`. Note that Facebook only returns friends who also use your app, so the JSON download remains the complete source.

## LinkedIn API

Accepts your OAuth **client ID/secret** and an **access token**. LinkedIn does not provide a connections endpoint to normal apps, so this connector verifies the token (`/v2/userinfo`) and reminds you to import `Connections.csv`.

## Running syncs

- **Test** validates credentials and reports what it sees (folders, account name).
- **Sync now** runs the provider, then the same matching pipeline as a file import. Each source produces an import job you can see in the history.
- Errors are shown on the connector card and in the import history; keys are kept so you can fix and retry.

## Security notes

- Prefer app passwords and short-lived tokens; rotate them from the provider side.
- Secrets are stored encrypted in SQLite; the encryption key lives in `ENCRYPTION_KEY` (or `data/.secrets.json` if unset). Back that key up with the database.
- Viewers cannot see, add or sync connectors.
