-- Technician "on my way" and "arrived" check-ins with optional location.
alter table public.jobs add column if not exists en_route_at timestamptz;
alter table public.jobs add column if not exists en_route_lat double precision;
alter table public.jobs add column if not exists en_route_lng double precision;
alter table public.jobs add column if not exists arrived_at timestamptz;
alter table public.jobs add column if not exists arrived_lat double precision;
alter table public.jobs add column if not exists arrived_lng double precision;
