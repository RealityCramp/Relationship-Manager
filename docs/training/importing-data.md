# Importing your data

Every source is imported through the same wizard: choose a source, add the export file, review, import. People found in a new file are matched against people already in the workspace, so importing several sources enriches the same person instead of creating duplicates.

## Before you start: your addresses and domains

Go to **Settings → Workspace** and fill in:

- **My email addresses** — every address you send from. The email importer uses them to tell your sent mail from received mail.
- **Corporate email domains** — e.g. `acme.com`. People with these domains (or whose company name matches) go into the **Corporate** circle.

## LinkedIn

1. LinkedIn → **Settings & Privacy → Data privacy → Get a copy of your data**.
2. Select **Connections** and request the archive. LinkedIn emails you a zip within minutes.
3. Import `Connections.csv`.

You get name, company, position, profile URL and the date you connected. Email addresses only appear for connections who allow it. Everyone lands in **Business**; colleagues at your corporate domains move to **Corporate**.

> LinkedIn's API does not expose your connection list, so the CSV is the only complete source. The LinkedIn connector in Settings only verifies your profile token.

## Facebook

1. Facebook → **Settings → Your information → Download your information**.
2. Choose **Friends and followers**, format **JSON**, and create the file.
3. Import `friends_and_followers/friends.json` (older exports: `friends.json`).

Friends go into **Personal**; follower/following lists are tagged and go into **Social**. Names are de-garbled (Facebook double-encodes accents).

## X

1. X → **Settings → Your account → Download an archive of your data**.
2. Import `data/follower.js` and `data/following.js`.

The archive only contains numeric account IDs. Either add an **X API** connector (Settings → Integrations) and sync to resolve names, avatars and bios, or import a CSV that has `username` and `name` columns. People go into **Social**.

## Contacts

Any of these work:

- **Google Contacts** → select all → Export → vCard or Google CSV.
- **iPhone / macOS Contacts** → select all → File → Export → Export vCard.
- **Outlook** → File → Open & Export → Import/Export → CSV.

vCard 2.1–4.0 and the common CSV layouts are supported, including multiple emails and phones, organisation, title, address and labels (which become tags). Circles are decided by email domain: free-mail → Personal, other domains → Business, your domains → Corporate.

## Email (bidirectional threads)

1. **Gmail**: [takeout.google.com](https://takeout.google.com) → Mail → export as `.mbox`. You can limit it to the Inbox and Sent labels to keep the file small.
2. **Apple Mail / Thunderbird**: export the mailbox as `.mbox`.
3. Import the `.mbox` (or individual `.eml` files).

Only headers are read; message bodies are never stored. By default a person is imported only if you have **both** received mail from them **and** sent mail to them (including Cc). This keeps newsletters, notifications and cold outreach out. Turn the switch off in the wizard to import everyone instead.

Each message becomes an **interaction**, threads are reconstructed from `In-Reply-To`/`References`, and people on the same thread are linked to each other.

For a live connection instead of a file, use the **IMAP**, **Google** or **Microsoft 365** connectors — see [Integrations and API keys](integrations-and-api-keys.md).

## Review and results

**Review before importing** parses the file without saving anything and shows counts, a sample and warnings (for example "no rows found" or "X archive only has IDs"). The results table after importing shows:

- **Parsed** — people found in the file,
- **New** — people created,
- **Merged** — people matched to someone already in the workspace,
- **Interactions / Relationships** — what was recorded.

## How matching works

In order: same source + external ID → same email address → same handle on the same network → exact normalised full name (two or more words). Anything that slips through can be fixed with **People → Find duplicates** or the **Merge with…** action on a profile.

Re-importing a file is safe and idempotent.

## Limits

Files up to 200 MB are accepted. Split very large mailboxes by label or year.
