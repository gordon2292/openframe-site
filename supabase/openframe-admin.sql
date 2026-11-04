-- OpenFrame: run this in Supabase SQL Editor after openframe-schema.sql.
alter table public.profiles
  add column if not exists role text not null default 'creator'
  check (role in ('creator','reviewer','super_admin'));

create or replace function public.can_review()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid() and role in ('reviewer','super_admin')
  );
$$;

grant execute on function public.can_review() to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='profiles' and policyname='admin reads profiles'
  ) then
    create policy "admin reads profiles"
      on public.profiles for select to authenticated
      using (public.can_review());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='submissions' and policyname='admin reads all submissions'
  ) then
    create policy "admin reads all submissions"
      on public.submissions for select to authenticated
      using (public.can_review());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='submissions' and policyname='admin reviews submissions'
  ) then
    create policy "admin reviews submissions"
      on public.submissions for update to authenticated
      using (public.can_review())
      with check (public.can_review());
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects' and policyname='admin reads submitted videos'
  ) then
    create policy "admin reads submitted videos"
      on storage.objects for select to authenticated
      using (bucket_id='videos' and public.can_review());
  end if;
end;
$$;

-- Promote a signed-in reviewer after their first magic-link login:
-- update public.profiles set role='reviewer' where id=(select id from auth.users where email='reviewer@example.com');