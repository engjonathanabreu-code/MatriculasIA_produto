-- Incremento exclusivo do suporte; não altera registros existentes.
create table public.support_ticket_messages (
 id uuid primary key default gen_random_uuid(),
 ticket_id uuid not null references public.support_tickets(id),
 autor text not null check (autor in ('cliente','suporte')),
 conteudo_texto text not null check (length(conteudo_texto) between 1 and 20000),
 criado_em timestamptz not null default now()
);
create index support_ticket_messages_ticket_date on public.support_ticket_messages(ticket_id, criado_em, id);
alter table public.support_ticket_messages enable row level security;
revoke all on public.support_ticket_messages from anon, authenticated;
grant select, insert on public.support_ticket_messages to service_role;
