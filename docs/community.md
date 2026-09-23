# Tandau community — accounts, provider listings and event teams

This is an optional extension to the hackathon's public matching flow. The original 66-profile CSV remains unchanged and anonymous. A source profile does **not** become an account, an invitation recipient or a contactable person. Only locally registered providers can publish community listings and personally accept an invitation.

## Launch and browse

Double-click `Start Tandau.cmd` on Windows, or run `python start.py` after installing Python and Node as described in [README](../README.md#run-from-a-fresh-checkout). No database server, API key, external identity provider or email account is needed. Open **Providers** to browse the 66 supplied profiles without signing in. **Supplied catalog** is the default directory view; **Community listings** shows services published by local accounts. A fresh community database starts empty, deliberately: there are no fabricated accounts or implicit demonstration consents.

The core **Find a match** page stays public and uses only the organizer dataset. Browsing the source directory is not a date/budget eligibility check or a ranked recommendation: open matching to check those conditions. Source profiles retain synthetic/imputed flags and have no account or invitation action. The separate community view shows user-entered services marked **unverified**. Prices are starting prices, not quotations; a published listing makes no claim of verified availability.

## Who can do what?

| Action | Anonymous visitor | Organizer account | Provider account |
| --- | --- | --- | --- |
| Browse source matching and community listings | Yes | Yes | Yes |
| Publish/edit a community listing | No | No | Own listings only |
| Create an event and edit its service plan | No | Yes, own events | Yes, own events |
| Invite a suitable provider to an event role | No | Event owner only | Event owner only |
| Accept/decline an invitation | No | Only if addressed to this account | Invited provider only |
| Read an event's plan | No | Owner or invited account | Owner or invited account |
| Read/write private event chat | No | Event owner | Owner or currently accepted participant |

Account types are chosen at signup, not silently upgraded. Choose **Provider** to offer services; providers can organize their own events too. Handles are 3–32 ASCII letters/digits/`_`/`.`/`-`; passwords are 10–128 characters. Use disposable demonstration credentials, not a real reused password. This prototype has no recovery email or password-reset service.

## Rehearse a complete event team

Use separate browser profiles or a normal window plus an incognito window on the **same printed app address**. Tabs in one profile share the same login. A participant on a different laptop does not share a loopback-only local installation.

1. **Provider window:** open Account, select Provider, register, choose New listing. Enter a title, category **Florist**, city **Almaty**, a positive starting price and a description (20–2,000 characters). Publish. Repeat with separate provider accounts for **Catering** and **Live band** if demonstrating three-person collaboration; sign out between accounts.
2. **Visitor window:** open Providers without an account and select **Community listings**. The published listings are visible; event creation instead offers a sign-in prompt. The default **Supplied catalog** view is independently browsable. No login wall blocks source matching or either directory.
3. **Organizer window:** register an Organizer account and open Events. Create an Almaty event using the Wedding template. It suggests a venue, florist, catering, band, host and photographer. Remove unneeded roles, add another service if useful, and edit each role's notes/checklist. Save the plan before inviting.
4. Select the appropriate published listing for each role and send an invitation. The app only offers active listings matching that role's category and the event's city. An invitation is **pending**, never an automatic agreement or booking.
5. Each provider signs in, opens Events, reads the plan and explicitly chooses **Accept** or **Decline**. A pending/declined invitee cannot read or write the chat. Accepted participants and the owner can discuss the event; messages refresh periodically (about five seconds), not by email/SMS.
6. When every remaining service role has a current accepted provider, the event displays **Team ready**. Empty plans, missing invitations or declined/pending roles never count as ready. An accepted provider can later decline/leave.
7. Change a substantive role note, checklist text, category or service membership and save. Prior acceptances require reconfirmation and affected chat access is withdrawn. Completing a checklist checkbox only records progress; it does **not** withdraw consent. Editing/deactivating a provider listing also requires reconfirmation.
8. Refresh or restart the app: accounts, listings, plans and messages persist. Sign out: private content disappears and protected server endpoints still enforce permissions.

Templates cover wedding, corporate event, birthday, conference and a blank/custom plan. Service-specific checklist suggestions cover florist, caterer, band, host, photographer, videographer, venue, decorator and sound/light. Add/remove roles and checklist items, edit text and mark progress; these are editable suggestions, not automatic purchases. Interface labels support Russian/English and light/dark themes. User-entered text and the language chosen when a checklist was created are not machine-translated.

Event planning dates span 2026–2035 and do **not** inherit the source CSV's availability guarantee. Core matching still strictly enforces its supplied 23 September–31 December 2026 calendar. Event collaboration is not an availability check or reservation system.

## Boundaries and limits

- Private event plans are visible only to the owner and that event's invitees. Chat access requires current acceptance (or ownership). Membership changes are checked by the server on every request, not just hidden UI buttons.
- Plan and offer changes use a version number: stale edits/acceptances receive a conflict and must reload. Replacing an invitation or editing a linked listing advances that version too, so an old tab cannot accept a different offer or changed price. Removed/replaced invitees lose access unless they still hold another role. Each role has one chosen listing; one provider may hold multiple roles.
- A team agreement covers coordination only. No booking, payment, legal contract, notification, direct phone/email verification, actual service delivery or organizer-dataset ownership is implied.
- Bounds: 20 listings/account, 50 created events/account, 30 roles/event, 15 checklist tasks/role, 2,000 characters/message and description. Starting prices are integer KZT in `1..100000000`. The directory returns at most 200 listings; event lists at most 100; chat displays the latest 100 messages.
- Login/registration attempts are limited to 30 per client IP per five minutes; chat posts from the same member/event must be at least 0.5 seconds apart. Large write bodies over 512 KiB are rejected before JSON parsing.
- Chat is available to each accepted member while the other invitations are pending; only the readiness badge waits for all roles. Newly accepted members can read earlier team messages. Declining removes chat access but retains the invitation/plan for reconsideration. Removing the invitation removes plan access too, unless another role still grants it.
- The 100-message display limit is not automatic deletion: earlier messages remain in local storage. There is no user-facing account/message deletion or retention scheduler in this prototype; avoid sensitive data and keep backups private.

## Storage, security and deployment honesty

The backend creates `.orbit/community.sqlite3` automatically. `COMMUNITY_DB_PATH` can override it (relative to repository root). The database and SQLite sidecars are gitignored. Stop the app before copying the database for a local backup, store it privately, and restore only to a compatible app version. Deleting it deletes the local accounts and conversations; reinstalling dependencies is not a reason to delete it. CSV matching never writes to this database.

Passwords use salted scrypt (`N=32768, r=8, p=3`, a documented [OWASP parameter choice](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)); session tokens are random, stored as hashes server-side, and expire after seven days. Cookies are HttpOnly, SameSite=Strict, limited to `/api/community`, and Secure on HTTPS. Logout revokes the current session. Writes require JSON and reject unexpected browser Origins. SQL parameters, bounded models, private/no-store responses, output-as-text rendering and ownership checks are used throughout. Validation errors do not echo passwords.

These are prototype safeguards, **not** a production security certification. The launcher binds only to loopback. Public deployment still needs HTTPS, proxy/host configuration, verified identity/contact onboarding, abuse reporting/moderation, stronger distributed rate limiting, password recovery, retention/deletion policy, backups/migrations and a reviewed privacy notice. There is no end-to-end encryption; anyone with database/server access can read stored chat text. Do not use real sensitive event or personal data for the demonstration.

## Architecture and verification

`backend/app/community/` is an isolated mounted FastAPI application backed by Python's built-in SQLite. `frontend/src/community/` contains the public directory, local account dashboard and event workspace. The read-only `/api/catalog` endpoint projects the authoritative loaded CSV into the source-directory view; the published core OpenAPI includes this additive endpoint. Matching request/response contracts and source-evidence rules are unchanged. Interactive community docs are at `/api/community/docs`; schema at `/api/community/openapi.json`.

Backend checks in `backend/tests/test_community.py` cover permissions, explicit agreement, version conflicts, storage persistence, validation, credential redaction and unchanged CSV hashing. Browser acceptance in `tests/e2e/community.spec.ts` exercises the real running service; [current verification](community-verification.md) records executed checks, not intended results. Use a separate `COMMUNITY_DB_PATH` for test runs so demo accounts do not pollute your working database.
