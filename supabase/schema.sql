-- =============================================================================
-- MATRICULA.IA - esquema do banco (Supabase / Postgres)
-- =============================================================================

-- Perfil do usuario (1:1 com auth.users do Supabase Auth)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  nome_completo text,
  stripe_customer_id text unique,
  criado_em timestamptz not null default now()
);

-- Catalogo de planos (dados fixos, nao mudam por usuario)
create table public.plans (
  id text primary key,               -- 'basico' | 'pro' | 'expert'
  nome text not null,
  preco_centavos integer not null,   -- em centavos de R$, ex: 5000 = R$50,00
  limite_analises integer not null,
  stripe_price_id text,              -- preenchido depois de criar o produto no Stripe
  ativo boolean not null default true
);

insert into public.plans (id, nome, preco_centavos, limite_analises) values
  ('basico', 'Plano Basico', 5000, 50),
  ('pro', 'Plano Pro', 10000, 100),
  ('expert', 'Plano Expert', 25000, 250);

-- Assinatura ativa (ou historica) de cada usuario
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id text not null references public.plans(id),
  stripe_subscription_id text unique,
  status text not null default 'incomplete',
  -- valores possiveis: incomplete | trialing | active | past_due | canceled | unpaid
  periodo_inicio timestamptz,
  periodo_fim timestamptz,
  cancelar_ao_fim_periodo boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index idx_subscriptions_user on public.subscriptions(user_id);
create index idx_subscriptions_status on public.subscriptions(status);

-- Registro de cada analise feita (auditoria + base para calcular consumo do periodo)
create table public.analysis_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id),
  matricula_numero text,
  sucesso boolean not null default true,
  criado_em timestamptz not null default now()
);
create index idx_usage_user_data on public.analysis_usage(user_id, criado_em);

-- Limite de requisicoes por IP (protecao basica contra bots/abuso, independente de login)
create table public.rate_limits (
  chave text primary key,          -- ex: 'ip:191.23.45.10' ou 'user:<uuid>'
  janela_inicio timestamptz not null default now(),
  contagem integer not null default 1
);

-- =============================================================================
-- RLS (Row Level Security) - cada usuario so ve os proprios dados
-- =============================================================================
alter table public.profiles enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.analysis_usage enable row level security;
alter table public.rate_limits enable row level security;

-- profiles: usuario le/edita so o proprio
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

-- plans: leitura publica (qualquer um ve os precos, sem precisar estar logado)
create policy "plans_select_all" on public.plans for select using (true);

-- subscriptions: usuario le so a propria; escrita so pelo backend (service_role, ignora RLS)
create policy "subscriptions_select_own" on public.subscriptions for select using (auth.uid() = user_id);

-- analysis_usage: usuario le so o proprio historico; escrita so pelo backend
create policy "usage_select_own" on public.analysis_usage for select using (auth.uid() = user_id);

-- rate_limits: tabela interna, ninguem alem do backend (service_role) acessa
-- (nenhuma policy = bloqueado por padrao para usuarios comuns)

-- =============================================================================
-- Trigger: cria a linha em profiles automaticamente quando alguem se cadastra
-- =============================================================================
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, nome_completo)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
