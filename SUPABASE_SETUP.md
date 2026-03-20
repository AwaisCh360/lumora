# Supabase Setup Guide

This guide explains the full setup for the new Lumora app in very simple steps.

After this setup, you will have:
- login page
- signup page
- user chat page
- admin page
- user/admin roles
- saved chats in Supabase
- admin-controlled chatbot settings

## Files You Will Use

- `qwen_chatbot_scratch/scripts/config.js`
- `qwen_chatbot_scratch/supabase_schema.sql`
- `qwen_chatbot_scratch/login.html`
- `qwen_chatbot_scratch/signup.html`
- `qwen_chatbot_scratch/chat.html`
- `qwen_chatbot_scratch/admin.html`

## Important Reality Check

This project is frontend-only.

That means:
- normal users will not see provider settings in the UI
- but browser devtools/network can still expose runtime requests and credentials

If you want real hidden secrets, you need a backend later.

## Step 1: Create a Supabase Project

1. Go to `https://supabase.com`
2. Create a new project
3. Wait until the database finishes provisioning

After project creation, keep your Supabase dashboard open.

## Step 2: Get Your Supabase URL and Anon Key

In Supabase dashboard:

1. Open `Project Settings`
2. Open `API`
3. Copy these two values:
   - `Project URL`
   - `anon public` key

You will paste them into `qwen_chatbot_scratch/scripts/config.js`.

## Step 3: Put Supabase Keys in config.js

Open:

`qwen_chatbot_scratch/scripts/config.js`

Replace:

```js
supabaseUrl: "https://YOUR-PROJECT.supabase.co",
supabaseAnonKey: "YOUR_SUPABASE_ANON_KEY",
```

with your real values.

Example:

```js
supabaseUrl: "https://abcdefghijklm.supabase.co",
supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...."
```

Do not change the rest unless you know what you are doing.

## Step 4: Run the Database Schema

Open Supabase dashboard:

1. Go to `SQL Editor`
2. Create a new query
3. Open the file `qwen_chatbot_scratch/supabase_schema.sql`
4. Copy the full SQL
5. Paste it into Supabase SQL Editor
6. Run it

If you already had the older Lumora version working before this UI/theme upgrade:

1. Open `SQL Editor`
2. Run the updated `qwen_chatbot_scratch/supabase_schema.sql` again

This will safely add:
- `theme_default` for workspace theming
- `default_image_model` for browser-side Qwen image generation
- `title_source` for local/manual/Qwen-generated chat titles
- `update_own_profile()` so users can change their display name from chat settings
- `gateway_account_pool` for storing Qwen pool accounts
- `profile_gateway_pool_assignments` for user-to-pool mapping
- `resolve_gateway_runtime_credentials()` for auto runtime resolution (4 users per account)

This creates:
- `profiles`
- `chat_threads`
- `chat_messages`
- `app_settings`
- `gateway_account_pool`
- `profile_gateway_pool_assignments`
- triggers
- role policies

It also auto-creates a `profiles` row when a new auth user signs up.

### If you already have an old project running

If your app is already live and you see either of these errors:

- `Could not find the 'title_source' column of 'chat_threads' in the schema cache`
- profile save/settings errors related to `update_own_profile`

then you can run this exact SQL in Supabase `SQL Editor`:

```sql
alter table public.chat_threads
add column if not exists title_source text not null default 'local';

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'chat_threads_title_source_check'
    ) then
        alter table public.chat_threads
        add constraint chat_threads_title_source_check
        check (title_source in ('local', 'remote', 'manual'));
    end if;
end;
$$;

create or replace function public.update_own_profile(next_display_name text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
    updated_profile public.profiles;
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    update public.profiles
    set display_name = coalesce(nullif(btrim(next_display_name), ''), display_name)
    where id = auth.uid()
    returning * into updated_profile;

    if updated_profile.id is null then
        raise exception 'Profile not found';
    end if;

    return updated_profile;
end;
$$;

revoke all on function public.update_own_profile(text) from public;
grant execute on function public.update_own_profile(text) to authenticated;
```

After running it:

1. wait a few seconds
2. refresh the Supabase dashboard once
3. hard refresh the browser app

## Step 5: Enable Email/Password Login

In Supabase dashboard:

1. Open `Authentication`
2. Open `Providers`
3. Make sure `Email` is enabled

Recommended:
- keep email/password enabled
- if you want instant testing, disable mandatory email confirmation for now

If email confirmation stays enabled, signup may succeed but the user may need to verify email before login works.

## Step 5A: Enable Google Login

In Supabase dashboard:

1. Open `Authentication`
2. Open `Providers`
3. Enable `Google`
4. Add your Google OAuth Client ID + Client Secret
    - In Google Cloud Console, your OAuth client must include this Authorized Redirect URI:
    - `https://<your-project-ref>.supabase.co/auth/v1/callback`
5. Open `Authentication` -> `URL Configuration`
6. Add your app URL(s) in:
    - `Site URL` (example: `http://localhost:8080`)
    - `Redirect URLs` (example: `http://localhost:8080/chat.html`)

For local file mode (`file://...`), OAuth redirect will not work reliably.
Run the app with a local server for Google login.

Once enabled, both `login.html` and `signup.html` show a `Continue with Google` button.

## Step 5B: Password Policy (8 chars + uppercase + lowercase + number + special)

This app enforces the above rule on signup UI.

For stronger backend enforcement too, also configure Supabase Auth password settings in dashboard:

1. Open `Authentication`
2. Open `Settings`
3. Set minimum password length to `8`

Supabase minimum length is server-enforced, while uppercase/special checks are enforced in this app's signup flow.

## Step 6: Open the App

You can now open:

- `qwen_chatbot_scratch/login.html`
- `qwen_chatbot_scratch/signup.html`

Usually the fastest way is to open the HTML files in the browser directly.

If you prefer a local server, you can also serve the folder with something simple like:

```bash
cd "/Users/estimation/Desktop/Lumora Ai/qwen_chatbot_scratch"
python3 -m http.server 8080
```

Then open:

`http://localhost:8080/login.html`

## Step 7: Create the First User

1. Open `signup.html`
2. Create an account
3. Use a real email/password

After signup:
- Supabase Auth creates the auth user
- the SQL trigger creates the matching row in `public.profiles`
- by default the new user role is `user`

## Step 8: Make the First User an Admin

Because signup never creates admins directly, you must promote your first account manually once.

In Supabase dashboard:

1. Open `SQL Editor`
2. Run:

```sql
update public.profiles
set role = 'admin'
where email = 'you@example.com';
```

Replace `you@example.com` with the exact email you used during signup.

Optional check:

```sql
select id, email, role, status
from public.profiles
order by created_at desc;
```

You should now see your user with:
- `role = admin`
- `status = active`

## Step 9: Login as Admin

1. Open `qwen_chatbot_scratch/login.html`
2. Sign in with the admin account
3. You should be redirected to:
   - `admin.html` if your role is `admin`
   - `chat.html` if your role is `user`

If you still land on `chat.html`, your role was not updated correctly. Re-run the SQL check from Step 8.

## Step 10: Configure the Chatbot in Admin Panel

Open:

`qwen_chatbot_scratch/admin.html`

You will see chatbot settings for:
- brand name
- brand tagline
- default workspace theme
- welcome title
- welcome copy
- gateway base URL
- route template
- gateway login email
- gateway password
- default model
- allowed models
- thinking settings
- system prompt

You will also see `Qwen Account Pool` controls in the Users section for:
- importing `account_pool.json` style records
- auto-assigning users with `4 users per account`
- manually changing any user's assigned pool account

### What these fields mean

`Brand name`
- app name shown in the UI

`Brand tagline`
- short description shown on pages

`Default workspace theme`
- default UI theme used when users choose `Workspace Default`

`Welcome title`
- empty chat heading

`Welcome copy`
- empty chat helper text

`Gateway base URL`
- usually `https://chat.qwen.ai`

`Route template`
- your CORS bypass / worker URL
- example:

```text
https://cors-bypass.quotesiaofficial.workers.dev/?url={url_encoded}
```

`Gateway login email`
- the Qwen/runtime email the hidden assistant flow should use

`Gateway password`
- the plain password for that runtime account
- the frontend hashes it before saving into Supabase

`Default model`
- the model used by default

`Allowed models`
- one model per line

`System prompt`
- hidden global instruction applied to chat requests

`Qwen Account Pool`
- stores multiple runtime accounts/tokens in DB
- can auto-balance users so one account serves 4 users
- admin can manually change pool per user from Users table

## Step 11: Save Admin Settings

Fill the admin form and click `Save Settings`.

For pooled runtime, also import your pool JSON and then click `Auto Assign 4/User` in the Users section.

After saving:
- settings go to `public.app_settings`
- pool accounts go to `public.gateway_account_pool`
- user pool mapping goes to `public.profile_gateway_pool_assignments`
- user chat page reads those settings automatically
- normal users still do not see those controls in the UI

## Step 12: Test Normal User Flow

Now test the real product flow:

1. Create another account from `signup.html`
2. Leave it as a normal `user`
3. Login with that account
4. Confirm it goes to `chat.html`
5. Confirm it does not show admin/runtime configuration
6. Start a new chat
7. Refresh the page
8. Confirm chats are still there

## Step 13: Test Admin Flow

Login with the admin account and confirm:

1. `admin.html` opens correctly
2. user list loads
3. role/status changes can be saved
4. user pool assignment can be changed and saved
5. branding updates appear on login/chat pages after refresh
6. chatbot settings save successfully

## What the Database Tables Do

`public.profiles`
- stores app users
- stores `role`
- stores `status`

`public.chat_threads`
- stores conversation list per user
- stores title, pin state, remote session ids

`public.chat_messages`
- stores each message for each thread

`public.app_settings`
- stores global admin-controlled chatbot settings

`public.gateway_account_pool`
- stores Qwen runtime pool accounts (email/password_hash/token/expiry/capacity)

`public.profile_gateway_pool_assignments`
- stores which user is mapped to which pool account

## Very Common Problems

### 1. Page says Supabase setup missing

Reason:
- `config.js` still has placeholder values

Fix:
- put real `supabaseUrl`
- put real `supabaseAnonKey`

### 2. Signup works but login fails

Possible reasons:
- email confirmation is enabled and email is not verified
- wrong password

Fix:
- verify the email
- or disable email confirmation during testing

### 3. User logs in but is not admin

Reason:
- `profiles.role` is still `user`

Fix:

```sql
update public.profiles
set role = 'admin'
where email = 'you@example.com';
```

### 4. Admin page opens but settings do not save

Possible reasons:
- SQL schema was not run fully
- RLS policies are missing
- current user is not really `admin`

Fix:
- run the full `supabase_schema.sql` again
- check `public.profiles`
- confirm your row has `role = admin`

### 5. Chat page opens but replies fail

Possible reasons:
- admin did not save gateway settings
- wrong gateway email/password
- route template is broken
- runtime model is invalid

Fix:
- open `admin.html`
- check gateway email/password
- check base URL
- check route template
- try loading live models

### 6. New users cannot see old chats after refresh

Reason:
- database inserts/selects are failing because schema or policies are incomplete

Fix:
- confirm `chat_threads` and `chat_messages` tables exist
- confirm schema was run fully
- check browser console/network for Supabase errors

## Recommended First Working Configuration

Use this as your first test:

- `Gateway base URL`: `https://chat.qwen.ai`
- `Route template`: your current worker URL
- `Default model`: `qwen3.5-plus`
- `Thinking enabled`: off

Then test basic chat first.

After that, tune:
- allowed models
- system prompt
- thinking budget
- branding

## Safe Setup Order

If you want the shortest correct order, do exactly this:

1. Create Supabase project
2. Copy URL + anon key
3. Update `scripts/config.js`
4. Run `supabase_schema.sql`
5. Enable email provider
6. Signup first user
7. Promote that user to admin
8. Login as admin
9. Save runtime settings in `admin.html`
10. Test chat with a normal user account

## Final Note

This app is designed so:
- user-facing chat stays clean
- admin settings stay separate
- auth and chat history live in Supabase

But again:
- this is not secret-safe
- frontend-only apps cannot fully hide runtime credentials

If later you want, the next upgrade should be:
- move runtime credentials to a backend
- keep Supabase only for auth/database
