# Conversation log

Written: 2026-10-08 12:59 AUSEST

A summary of this Claude Code session, not a verbatim transcript.

## User profile schema

### Does the schema have users? (~12:50)
- User asked whether the schema in final has users.
- Claude found `src/db.js` defines a `users` table (`token` primary key, unique `email`, `created_at`), referenced by `checkins.user_token`. No password column; `events.created_by` has no foreign key.

### Add UserProfile fields (~12:55)
- User asked to include typical profile fields (user_id, username, display_name, email, profile_photo, date_of_birth, location, language, timezone, preferences, interests, role, subscription, created_at, updated_at) and to say where they go.
- Claude entered worktree `user-profile-schema` and added a 1:1 `user_profiles` table keyed to `users.token`. A separate table was needed because SQLite cannot add a UNIQUE column to an existing table and `username` must be unique.
- `email` and `created_at` stay in `users` and are joined in by `getProfile()` rather than duplicated. `preferences` and `interests` are JSON text. Defaults: language `en`, timezone `Australia/Sydney`, role `student`, subscription `free`.
- Added `getProfile(userId)` (creates a default row for pre-existing users) and `updateProfile(userId, fields)` (partial update, ignores email/user_id/created_at, refreshes `updated_at`). `findOrCreateUser` now creates a default profile row.
- Checked with a create, read and update against a scratch database. Committed as a91b8d1 and pushed to `worktree-user-profile-schema`. No UI, routes or field validation added yet.

### Docs (~12:59)
- User asked to update docs/conversation with a timestamp. Added this file, following the one-file-per-session rule in CLAUDE.md.
