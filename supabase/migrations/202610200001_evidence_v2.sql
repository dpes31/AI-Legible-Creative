-- Additive schema for the private review build. Apply only to a dedicated review project.
create table if not exists public.projects (
  id uuid primary key, owner_id uuid not null references auth.users(id) on delete cascade,
  revision bigint not null default 1, payload jsonb not null, create_key text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(owner_id, create_key)
);
create table if not exists public.sources (
  id uuid primary key, project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id), payload jsonb not null, created_at timestamptz not null default now()
);
create table if not exists public.claims (
  id uuid primary key, project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id), source_id uuid references public.sources(id),
  payload jsonb not null, created_at timestamptz not null default now()
);
create table if not exists public.analysis_revisions (
  id uuid primary key, project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id), revision bigint not null, payload jsonb not null,
  created_at timestamptz not null default now(), unique(project_id,revision)
);
create table if not exists public.channel_documents (
  id uuid primary key, project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id), channel text not null, revision bigint not null,
  payload jsonb not null, created_at timestamptz not null default now(), unique(project_id,channel,revision)
);
create table if not exists public.budgets (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  approved_usd numeric(12,6) not null default 0 check (approved_usd >= 0),
  reserved_usd numeric(12,6) not null default 0 check (reserved_usd >= 0),
  spent_usd numeric(12,6) not null default 0 check (spent_usd >= 0)
);
create table if not exists public.runs (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id), idempotency_key text not null,
  input_hash text not null, status text not null default 'pending',
  reserved_usd numeric(12,6) not null, created_at timestamptz not null default now(),
  unique(owner_id, project_id, idempotency_key)
);
create table if not exists public.run_steps (
  id uuid primary key default gen_random_uuid(), run_id uuid not null references public.runs(id) on delete cascade,
  owner_id uuid not null references auth.users(id), stage text not null,
  input_hash text not null, status text not null default 'pending', attempt integer not null default 0,
  lease_until timestamptz, provider_request_id text, result jsonb, error text,
  created_at timestamptz not null default now(), unique(run_id,stage)
);
create table if not exists public.usage_ledger (
  id uuid primary key default gen_random_uuid(), run_id uuid not null references public.runs(id),
  owner_id uuid not null references auth.users(id), amount_usd numeric(12,6) not null,
  kind text not null check(kind in ('reserve','settle','release','uncertain')),
  details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);

do $$ declare t text; begin
  foreach t in array array['projects','sources','claims','analysis_revisions','channel_documents','budgets','runs','run_steps','usage_ledger'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy owner_select on public.%I for select to authenticated using (owner_id = (select auth.uid()))',t);
  end loop;
end $$;
create policy owner_insert on public.projects for insert to authenticated
  with check (owner_id = (select auth.uid()) and payload->>'ownerId' = owner_id::text);
create policy owner_update on public.projects for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and payload->>'ownerId' = owner_id::text);

-- All paid reservations are serialized by the locked budget row. Missing budget means $0 permission.
create or replace function public.reserve_review_run(p_project uuid,p_key text,p_hash text,p_reserve numeric)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := (select auth.uid()); v_budget public.budgets%rowtype; v_run uuid;
begin
  if v_owner is null then raise exception 'unauthorized'; end if;
  if p_reserve <= 0 or p_reserve > 100 or length(p_key) > 128 then raise exception 'invalid reservation'; end if;
  if not exists(select 1 from public.projects where id=p_project and owner_id=v_owner) then raise exception 'project not found'; end if;
  select id into v_run from public.runs where owner_id=v_owner and project_id=p_project and idempotency_key=p_key;
  if v_run is not null then return v_run; end if;
  select * into v_budget from public.budgets where owner_id=v_owner for update;
  if not found or v_budget.spent_usd+v_budget.reserved_usd+p_reserve>v_budget.approved_usd then
    raise exception 'approved budget unavailable';
  end if;
  insert into public.runs(project_id,owner_id,idempotency_key,input_hash,reserved_usd)
    values(p_project,v_owner,p_key,p_hash,p_reserve) returning id into v_run;
  update public.budgets set reserved_usd=reserved_usd+p_reserve where owner_id=v_owner;
  insert into public.usage_ledger(run_id,owner_id,amount_usd,kind)
    values(v_run,v_owner,p_reserve,'reserve');
  return v_run;
end $$;
revoke all on function public.reserve_review_run(uuid,text,text,numeric) from public, anon;
grant execute on function public.reserve_review_run(uuid,text,text,numeric) to authenticated;

create or replace function public.claim_review_step(p_run uuid,p_stage text,p_hash text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := (select auth.uid()); v_step public.run_steps%rowtype;
begin
  if v_owner is null or not exists(select 1 from public.runs where id=p_run and owner_id=v_owner and status='pending') then
    raise exception 'run unavailable'; end if;
  select * into v_step from public.run_steps where run_id=p_run and stage=p_stage for update;
  if found then
    if v_step.input_hash <> p_hash then raise exception 'input changed'; end if;
    if v_step.status='succeeded' then return v_step.id; end if;
    -- A sent request may have completed or been billed. Never silently retry it.
    if v_step.status in ('running','uncertain','interrupted') then raise exception 'step needs reconciliation'; end if;
    raise exception 'step unavailable';
  end if;
  insert into public.run_steps(run_id,owner_id,stage,input_hash,status,attempt,lease_until)
    values(p_run,v_owner,p_stage,p_hash,'running',1,now()+interval '90 seconds') returning id into v_step;
  return v_step.id;
end $$;
revoke all on function public.claim_review_step(uuid,text,text) from public, anon;
grant execute on function public.claim_review_step(uuid,text,text) to authenticated;

create or replace function public.finish_review_step(p_step uuid,p_state text,p_result jsonb,p_request_id text,p_error text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or p_state not in ('succeeded','failed','uncertain') then raise exception 'invalid finish'; end if;
  update public.run_steps set status=p_state, result=p_result, provider_request_id=p_request_id,
    error=p_error, lease_until=null where id=p_step and owner_id=(select auth.uid()) and status='running';
  if not found then raise exception 'step not reserved'; end if;
end $$;
revoke all on function public.finish_review_step(uuid,text,jsonb,text,text) from public, anon;
grant execute on function public.finish_review_step(uuid,text,jsonb,text,text) to authenticated;
