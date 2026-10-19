set -eu
finance_container=hours-finance-db-test
env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH docker --host=unix:///var/run/docker.sock run -d --rm --name "$finance_container" --network none --tmpfs /var/lib/postgresql/data -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17-alpine >/dev/null
trap 'docker --host=unix:///var/run/docker.sock stop "$finance_container" >/dev/null' EXIT
for attempt in $(seq 1 30); do
 if docker --host=unix:///var/run/docker.sock exec "$finance_container" pg_isready -U postgres >/dev/null 2>&1; then break; fi
 sleep 1
done
docker --host=unix:///var/run/docker.sock exec -i "$finance_container" psql -v ON_ERROR_STOP=1 -U postgres <<'SQL'
create schema auth;
create role authenticated;
create role anon;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to authenticated,anon;
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name,'/'))[1:cardinality(string_to_array(name,'/'))-1] $$;
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated,anon;
grant select,insert,update,delete on storage.objects to authenticated,anon;
create policy other_app_broad_policy on storage.objects for all to public using(true) with check(true);
SQL
docker --host=unix:///var/run/docker.sock exec -i "$finance_container" psql -v ON_ERROR_STOP=1 -U postgres < sql/personal-finances.sql
docker --host=unix:///var/run/docker.sock exec -i "$finance_container" psql -v ON_ERROR_STOP=1 -U postgres < tests/finance-rls.sql

docker --host=unix:///var/run/docker.sock exec -i "$finance_container" psql -v ON_ERROR_STOP=1 -U postgres < sql/finance-documents.sql
docker --host=unix:///var/run/docker.sock exec -i "$finance_container" psql -v ON_ERROR_STOP=1 -U postgres < tests/document-rls.sql
docker --host=unix:///var/run/docker.sock exec -i "$finance_container" psql -v ON_ERROR_STOP=1 -U postgres < sql/weekly-tips.sql
docker --host=unix:///var/run/docker.sock exec -i "$finance_container" psql -v ON_ERROR_STOP=1 -U postgres < tests/weekly-tips-rls.sql
