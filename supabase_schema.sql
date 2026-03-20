create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = timezone('utc', now());
    return new;
end;
$$;

create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    email text unique,
    display_name text not null default 'User',
    role text not null default 'user' check (role in ('user', 'admin')),
    status text not null default 'active' check (status in ('active', 'inactive')),
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.chat_threads (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references auth.users(id) on delete cascade,
    bot_id text not null default 'assistant',
    title text not null default 'New chat',
    title_source text not null default 'local' check (title_source in ('local', 'remote', 'manual')),
    pinned boolean not null default false,
    remote_session_id text,
    remote_parent_id text,
    last_trace jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.chat_messages (
    id uuid primary key default gen_random_uuid(),
    thread_id uuid not null references public.chat_threads(id) on delete cascade,
    role text not null check (role in ('user', 'assistant', 'system', 'error')),
    content text not null default '',
    meta jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.app_settings (
    id text primary key default 'global' check (id = 'global'),
    brand_name text not null default 'Lumora',
    brand_tagline text not null default 'Secure AI workspace with clean chat and separate admin controls.',
    theme_default text not null default 'obsidian',
    welcome_title text not null default 'Start a new conversation',
    welcome_copy text not null default 'Ask for writing help, coding support, strategy, or analysis.',
    default_model text not null default 'qwen3.5-plus',
    default_image_model text not null default 'qwen3.5-plus',
    allowed_models jsonb not null default '["qwen3.5-plus"]'::jsonb,
    model_aliases jsonb not null default '{}'::jsonb,
    bots jsonb not null default '[]'::jsonb,
    system_prompt text not null default '',
    thinking_enabled boolean not null default false,
    thinking_budget integer not null default 81920,
    gateway_base_url text not null default 'https://chat.qwen.ai',
    gateway_proxy_template text not null default 'https://cors-bypass.quotesiaofficial.workers.dev/?url={url_encoded}',
    gateway_email text not null default '',
    gateway_password_hash text not null default '',
    updated_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.gateway_account_pool (
    id uuid primary key default gen_random_uuid(),
    label text not null default 'Pool account',
    email text not null,
    password_hash text not null default '',
    access_token text not null default '',
    token_expiry timestamptz,
    max_users integer not null default 4 check (max_users > 0 and max_users <= 500),
    status text not null default 'active' check (status in ('active', 'inactive')),
    created_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

drop index if exists gateway_account_pool_email_key;
create unique index if not exists gateway_account_pool_email_key
on public.gateway_account_pool (email);

create table if not exists public.profile_gateway_pool_assignments (
    user_id uuid primary key references auth.users(id) on delete cascade,
    pool_id uuid references public.gateway_account_pool(id) on delete set null,
    assigned_by uuid references auth.users(id) on delete set null,
    note text not null default '',
    assigned_at timestamptz not null default timezone('utc', now()),
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists profile_gateway_pool_assignments_pool_id_idx
on public.profile_gateway_pool_assignments (pool_id);

alter table public.gateway_account_pool
add column if not exists label text not null default 'Pool account';

alter table public.gateway_account_pool
add column if not exists email text;

alter table public.gateway_account_pool
add column if not exists password_hash text not null default '';

alter table public.gateway_account_pool
add column if not exists access_token text not null default '';

alter table public.gateway_account_pool
add column if not exists token_expiry timestamptz;

alter table public.gateway_account_pool
add column if not exists max_users integer not null default 4;

alter table public.gateway_account_pool
add column if not exists status text not null default 'active';

alter table public.gateway_account_pool
add column if not exists created_by uuid references auth.users(id) on delete set null;

alter table public.gateway_account_pool
add column if not exists created_at timestamptz not null default timezone('utc', now());

alter table public.gateway_account_pool
add column if not exists updated_at timestamptz not null default timezone('utc', now());

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'gateway_account_pool_status_check'
    ) then
        alter table public.gateway_account_pool
        add constraint gateway_account_pool_status_check
        check (status in ('active', 'inactive'));
    end if;
end;
$$;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'gateway_account_pool_max_users_check'
    ) then
        alter table public.gateway_account_pool
        add constraint gateway_account_pool_max_users_check
        check (max_users > 0 and max_users <= 500);
    end if;
end;
$$;

alter table public.profile_gateway_pool_assignments
add column if not exists user_id uuid;

alter table public.profile_gateway_pool_assignments
add column if not exists pool_id uuid references public.gateway_account_pool(id) on delete set null;

alter table public.profile_gateway_pool_assignments
add column if not exists assigned_by uuid references auth.users(id) on delete set null;

alter table public.profile_gateway_pool_assignments
add column if not exists note text not null default '';

alter table public.profile_gateway_pool_assignments
add column if not exists assigned_at timestamptz not null default timezone('utc', now());

alter table public.profile_gateway_pool_assignments
add column if not exists created_at timestamptz not null default timezone('utc', now());

alter table public.profile_gateway_pool_assignments
add column if not exists updated_at timestamptz not null default timezone('utc', now());

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'profile_gateway_pool_assignments_pkey'
    ) then
        alter table public.profile_gateway_pool_assignments
        add constraint profile_gateway_pool_assignments_pkey
        primary key (user_id);
    end if;
end;
$$;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'profile_gateway_pool_assignments_user_id_fkey'
    ) then
        alter table public.profile_gateway_pool_assignments
        add constraint profile_gateway_pool_assignments_user_id_fkey
        foreign key (user_id) references auth.users(id) on delete cascade;
    end if;
end;
$$;

alter table public.app_settings
add column if not exists theme_default text not null default 'obsidian';

alter table public.app_settings
add column if not exists default_image_model text not null default 'qwen3.5-plus';

alter table public.app_settings
add column if not exists model_aliases jsonb not null default '{}'::jsonb;

alter table public.app_settings
add column if not exists bots jsonb not null default '[]'::jsonb;

alter table public.chat_threads
add column if not exists title_source text not null default 'local';

alter table public.chat_threads
add column if not exists bot_id text not null default 'assistant';

create index if not exists chat_threads_owner_bot_updated_idx
on public.chat_threads (owner_id, bot_id, updated_at desc);

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

insert into public.app_settings (id)
values ('global')
on conflict (id) do nothing;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, email, display_name)
    values (
        new.id,
        new.email,
        coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1), 'User')
    )
    on conflict (id) do nothing;

    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute procedure public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.profiles
        where id = auth.uid()
          and role = 'admin'
          and status = 'active'
    );
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

create or replace function public.get_public_workspace_ui_settings()
returns table (
    brand_name text,
    brand_tagline text,
    theme_default text
)
language sql
stable
security definer
set search_path = public
as $$
    select
        settings.brand_name,
        settings.brand_tagline,
        settings.theme_default
    from public.app_settings settings
    where settings.id = 'global'
    limit 1;
$$;

revoke all on function public.get_public_workspace_ui_settings() from public;
grant execute on function public.get_public_workspace_ui_settings() to anon, authenticated;

create or replace function public.resolve_gateway_runtime_credentials(target_user_id uuid default auth.uid())
returns table (
    pool_id uuid,
    pool_label text,
    gateway_email text,
    gateway_password_hash text,
    gateway_access_token text,
    gateway_token_expiry timestamptz,
    assignment_source text,
    assigned_users integer,
    max_users integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
    effective_user_id uuid;
    chosen_pool_id uuid;
    chosen_source text := 'fallback';
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    effective_user_id := coalesce(target_user_id, auth.uid());

    if effective_user_id <> auth.uid() and not public.is_admin() then
        raise exception 'Not allowed';
    end if;

    select assignment.pool_id
    into chosen_pool_id
    from public.profile_gateway_pool_assignments assignment
    join public.gateway_account_pool pool
        on pool.id = assignment.pool_id
    where assignment.user_id = effective_user_id
      and pool.status = 'active'
      and (
            (
                nullif(btrim(pool.access_token), '') is not null
                and (
                    pool.token_expiry is null
                    or pool.token_expiry > timezone('utc', now()) + interval '1 minute'
                )
            )
            or (
                nullif(btrim(pool.email), '') is not null
                and nullif(btrim(pool.password_hash), '') is not null
            )
      )
    limit 1;

    if chosen_pool_id is not null then
        chosen_source := 'assigned';
    else
        with usage_counts as (
            select
                pool.id,
                coalesce(count(assignment.user_id), 0)::int as assigned_count,
                pool.max_users
            from public.gateway_account_pool pool
            left join public.profile_gateway_pool_assignments assignment
                on assignment.pool_id = pool.id
            left join public.profiles profile
                on profile.id = assignment.user_id
            where pool.status = 'active'
              and (
                    (
                        nullif(btrim(pool.access_token), '') is not null
                        and (
                            pool.token_expiry is null
                            or pool.token_expiry > timezone('utc', now()) + interval '1 minute'
                        )
                    )
                    or (
                        nullif(btrim(pool.email), '') is not null
                        and nullif(btrim(pool.password_hash), '') is not null
                    )
              )
              and (profile.id is null or profile.status = 'active')
            group by pool.id, pool.max_users
        )
        select id
        into chosen_pool_id
        from usage_counts
        order by
            case when assigned_count < max_users then 0 else 1 end,
            assigned_count asc,
            id asc
        limit 1;

        if chosen_pool_id is not null then
            insert into public.profile_gateway_pool_assignments (
                user_id,
                pool_id,
                assigned_by,
                assigned_at
            )
            values (
                effective_user_id,
                chosen_pool_id,
                case when public.is_admin() then auth.uid() else null end,
                timezone('utc', now())
            )
            on conflict (user_id) do update
            set pool_id = excluded.pool_id,
                assigned_by = excluded.assigned_by,
                assigned_at = excluded.assigned_at,
                updated_at = timezone('utc', now());

            chosen_source := 'auto';
        end if;
    end if;

    if chosen_pool_id is null then
        return;
    end if;

    return query
    select
        pool.id,
        pool.label,
        pool.email,
        pool.password_hash,
        pool.access_token,
        pool.token_expiry,
        chosen_source,
        coalesce(pool_usage.assigned_count, 0)::int as assigned_users,
        pool.max_users
    from public.gateway_account_pool pool
    left join (
        select pool_id, count(*)::int as assigned_count
        from public.profile_gateway_pool_assignments
        group by pool_id
    ) pool_usage
        on pool_usage.pool_id = pool.id
    where pool.id = chosen_pool_id
    limit 1;
end;
$$;

revoke all on function public.resolve_gateway_runtime_credentials(uuid) from public;
grant execute on function public.resolve_gateway_runtime_credentials(uuid) to authenticated;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute procedure public.set_updated_at();

drop trigger if exists threads_set_updated_at on public.chat_threads;
create trigger threads_set_updated_at
before update on public.chat_threads
for each row
execute procedure public.set_updated_at();

drop trigger if exists app_settings_set_updated_at on public.app_settings;
create trigger app_settings_set_updated_at
before update on public.app_settings
for each row
execute procedure public.set_updated_at();

drop trigger if exists gateway_account_pool_set_updated_at on public.gateway_account_pool;
create trigger gateway_account_pool_set_updated_at
before update on public.gateway_account_pool
for each row
execute procedure public.set_updated_at();

drop trigger if exists profile_gateway_pool_assignments_set_updated_at on public.profile_gateway_pool_assignments;
create trigger profile_gateway_pool_assignments_set_updated_at
before update on public.profile_gateway_pool_assignments
for each row
execute procedure public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;
alter table public.app_settings enable row level security;
alter table public.gateway_account_pool enable row level security;
alter table public.profile_gateway_pool_assignments enable row level security;

drop policy if exists "profiles_select_self_or_admin" on public.profiles;
create policy "profiles_select_self_or_admin"
on public.profiles
for select
using (auth.uid() = id or public.is_admin());

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self"
on public.profiles
for insert
with check (auth.uid() = id);

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin"
on public.profiles
for update
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "threads_select_owner_or_admin" on public.chat_threads;
create policy "threads_select_owner_or_admin"
on public.chat_threads
for select
using (owner_id = auth.uid() or public.is_admin());

drop policy if exists "threads_insert_owner_or_admin" on public.chat_threads;
create policy "threads_insert_owner_or_admin"
on public.chat_threads
for insert
with check (owner_id = auth.uid() or public.is_admin());

drop policy if exists "threads_update_owner_or_admin" on public.chat_threads;
create policy "threads_update_owner_or_admin"
on public.chat_threads
for update
using (owner_id = auth.uid() or public.is_admin())
with check (owner_id = auth.uid() or public.is_admin());

drop policy if exists "threads_delete_owner_or_admin" on public.chat_threads;
create policy "threads_delete_owner_or_admin"
on public.chat_threads
for delete
using (owner_id = auth.uid() or public.is_admin());

drop policy if exists "messages_select_owner_or_admin" on public.chat_messages;
create policy "messages_select_owner_or_admin"
on public.chat_messages
for select
using (
    exists (
        select 1
        from public.chat_threads
        where public.chat_threads.id = chat_messages.thread_id
          and (public.chat_threads.owner_id = auth.uid() or public.is_admin())
    )
);

drop policy if exists "messages_insert_owner_or_admin" on public.chat_messages;
create policy "messages_insert_owner_or_admin"
on public.chat_messages
for insert
with check (
    exists (
        select 1
        from public.chat_threads
        where public.chat_threads.id = chat_messages.thread_id
          and (public.chat_threads.owner_id = auth.uid() or public.is_admin())
    )
);

drop policy if exists "messages_update_owner_or_admin" on public.chat_messages;
create policy "messages_update_owner_or_admin"
on public.chat_messages
for update
using (
    exists (
        select 1
        from public.chat_threads
        where public.chat_threads.id = chat_messages.thread_id
          and (public.chat_threads.owner_id = auth.uid() or public.is_admin())
    )
)
with check (
    exists (
        select 1
        from public.chat_threads
        where public.chat_threads.id = chat_messages.thread_id
          and (public.chat_threads.owner_id = auth.uid() or public.is_admin())
    )
);

drop policy if exists "messages_delete_owner_or_admin" on public.chat_messages;
create policy "messages_delete_owner_or_admin"
on public.chat_messages
for delete
using (
    exists (
        select 1
        from public.chat_threads
        where public.chat_threads.id = chat_messages.thread_id
          and (public.chat_threads.owner_id = auth.uid() or public.is_admin())
    )
);

drop policy if exists "app_settings_select_authenticated" on public.app_settings;
create policy "app_settings_select_authenticated"
on public.app_settings
for select
using (auth.role() = 'authenticated');

drop policy if exists "app_settings_insert_admin" on public.app_settings;
create policy "app_settings_insert_admin"
on public.app_settings
for insert
with check (public.is_admin());

drop policy if exists "app_settings_update_admin" on public.app_settings;
create policy "app_settings_update_admin"
on public.app_settings
for update
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "gateway_account_pool_select_admin" on public.gateway_account_pool;
create policy "gateway_account_pool_select_admin"
on public.gateway_account_pool
for select
using (public.is_admin());

drop policy if exists "gateway_account_pool_insert_admin" on public.gateway_account_pool;
create policy "gateway_account_pool_insert_admin"
on public.gateway_account_pool
for insert
with check (public.is_admin());

drop policy if exists "gateway_account_pool_update_admin" on public.gateway_account_pool;
create policy "gateway_account_pool_update_admin"
on public.gateway_account_pool
for update
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "gateway_account_pool_delete_admin" on public.gateway_account_pool;
create policy "gateway_account_pool_delete_admin"
on public.gateway_account_pool
for delete
using (public.is_admin());

drop policy if exists "pool_assignments_select_self_or_admin" on public.profile_gateway_pool_assignments;
create policy "pool_assignments_select_self_or_admin"
on public.profile_gateway_pool_assignments
for select
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "pool_assignments_insert_admin" on public.profile_gateway_pool_assignments;
create policy "pool_assignments_insert_admin"
on public.profile_gateway_pool_assignments
for insert
with check (public.is_admin());

drop policy if exists "pool_assignments_update_admin" on public.profile_gateway_pool_assignments;
create policy "pool_assignments_update_admin"
on public.profile_gateway_pool_assignments
for update
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "pool_assignments_delete_admin" on public.profile_gateway_pool_assignments;
create policy "pool_assignments_delete_admin"
on public.profile_gateway_pool_assignments
for delete
using (public.is_admin());
