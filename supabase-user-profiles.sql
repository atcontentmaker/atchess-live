create table if not exists public.user_profiles (
    user_id uuid primary key references auth.users(id) on delete cascade,
    username text not null,
    normalized_username text not null unique,
    avatar_url text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create or replace function public.touch_user_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists user_profiles_set_updated_at on public.user_profiles;

create trigger user_profiles_set_updated_at
before update on public.user_profiles
for each row
execute function public.touch_user_profiles_updated_at();

alter table public.user_profiles enable row level security;

create policy "Authenticated users can read user profile registry"
    on public.user_profiles
    for select
    to authenticated
    using (true);

create policy "Users can insert their own profile registry row"
    on public.user_profiles
    for insert
    to authenticated
    with check (auth.uid() = user_id);

create policy "Users can update their own profile registry row"
    on public.user_profiles
    for update
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

create policy "Users can delete their own profile registry row"
    on public.user_profiles
    for delete
    to authenticated
    using (auth.uid() = user_id);
