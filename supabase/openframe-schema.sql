-- OpenFrame: run this in Supabase SQL Editor after the profiles table exists.
create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 70),
  topic text not null check (topic in ('science','life_skills','language','art_design','movement_health')),
  age_band text not null check (age_band in ('10-12','13-15','16-18')),
  content_language text not null check (content_language in ('zh-Hans','zh-Hant','en','bilingual')),
  summary text not null check (char_length(summary) between 1 and 220),
  source_url text not null,
  source_note text,
  video_path text,
  status text not null default 'pending' check (status in ('pending','revision_requested','published','declined')),
  review_note text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  reason text not null,
  detail text,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists submissions_set_updated_at on public.submissions;
create trigger submissions_set_updated_at
before update on public.submissions
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.submissions enable row level security;
alter table public.content_reports enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles read own') then
    create policy "profiles read own" on public.profiles for select to authenticated using (id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'submissions' and policyname = 'creator reads own submissions') then
    create policy "creator reads own submissions" on public.submissions for select to authenticated using (creator_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'submissions' and policyname = 'creator submits own content') then
    create policy "creator submits own content" on public.submissions for insert to authenticated with check (creator_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'submissions' and policyname = 'public reads published metadata') then
    create policy "public reads published metadata" on public.submissions for select to anon, authenticated using (status = 'published');
  end if;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('videos', 'videos', false, 104857600, array['video/mp4','video/webm'])
on conflict (id) do update set public = false, file_size_limit = 104857600, allowed_mime_types = array['video/mp4','video/webm'];

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'creator uploads own video') then
    create policy "creator uploads own video" on storage.objects for insert to authenticated
      with check (bucket_id = 'videos' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'creator reads own video') then
    create policy "creator reads own video" on storage.objects for select to authenticated
      using (bucket_id = 'videos' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
end;
$$;