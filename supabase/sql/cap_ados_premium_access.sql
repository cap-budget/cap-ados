create table public.cap_ados_premium_access (
 user_id uuid primary key references auth.users(id) on delete cascade,
 test_lifetime_access boolean not null default false,
 stripe_checkout_session_id text unique,
 paid_at timestamptz,
 updated_at timestamptz not null default now()
);
alter table public.cap_ados_premium_access enable row level security;
revoke all on public.cap_ados_premium_access from anon, authenticated;
grant select on public.cap_ados_premium_access to authenticated;
grant select, insert, update, delete on public.cap_ados_premium_access to service_role;
create policy cap_ados_read_own_access on public.cap_ados_premium_access for select to authenticated using ((select auth.uid()) = user_id);
comment on table public.cap_ados_premium_access is 'CAP Ados TEST only. Trusted Stripe webhook writes. No rights shared with CAP Budget.';