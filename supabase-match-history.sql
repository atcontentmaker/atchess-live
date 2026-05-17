create table if not exists public.match_history (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    played_at timestamptz not null default now(),
    mode text not null check (mode in ('engine', 'online')),
    result text not null check (result in ('win', 'loss', 'draw')),
    reason text not null,
    opponent_name text not null default 'Unknown Opponent',
    player_color text not null check (player_color in ('white', 'black')),
    pgn text not null default '',
    fen text not null default ''
);

create index if not exists match_history_user_id_played_at_idx
    on public.match_history (user_id, played_at desc);

alter table public.match_history enable row level security;

create policy "Users can read their own match history"
    on public.match_history
    for select
    using (auth.uid() = user_id);

create policy "Users can insert their own match history"
    on public.match_history
    for insert
    with check (auth.uid() = user_id);
