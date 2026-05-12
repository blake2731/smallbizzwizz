# Onboarding flag — manual ops

The `profile.onboarding_completed` boolean controls whether a user sees the welcome flow on next login. New rows default to `false`. The flow flips it to `true` after a user finishes step 4 (the stressor question).

## Apply the migration

Production / staging (Neon):

```bash
npm run db:migrate
```

Or apply the schema diff directly without the journal:

```bash
npm run db:push
```

The migration that introduces this column is `lib/db/migrations/0001_onboarding_fields.sql`.

## Check a single user

Get the Clerk user ID from the Clerk dashboard (it looks like `user_2abc...`).

```sql
SELECT user_id, name, business_type, onboarding_completed, onboarded_at
FROM profile
WHERE user_id = 'user_2abc...';
```

## See everyone who has not finished onboarding

```sql
SELECT user_id, name, business_type, created_at
FROM profile
WHERE onboarding_completed = false
ORDER BY created_at DESC;
```

## Force one user back through onboarding

```sql
UPDATE profile
SET onboarding_completed = false
WHERE user_id = 'user_2abc...';
```

Next time they hit `/chat`, the fade-in flow runs again. Their previously saved answers (name, business type, etc.) are kept — only the flag is reset.

## Reset everyone (use sparingly)

```sql
UPDATE profile SET onboarding_completed = false;
```

This puts every existing user through the flow on their next visit.

## Wipe one user's profile completely

```sql
DELETE FROM profile WHERE user_id = 'user_2abc...';
```

On next login a fresh row is created with `onboarding_completed = false` and the flow runs.

## Notes for existing users (pre-migration)

The `0001_onboarding_fields.sql` migration adds `onboarding_completed boolean NOT NULL DEFAULT false`, so every existing row in `profile` is set to `false` automatically. Every existing user therefore sees the onboarding flow on their next visit to `/chat` — that matches the spec.
