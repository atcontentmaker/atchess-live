alter table public.match_history
    add column if not exists opponent_avatar_url text;
