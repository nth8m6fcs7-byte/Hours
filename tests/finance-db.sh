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
SQL
docker --host=unix:///var/run/docker.sock exec -i "$finance_container" psql -v ON_ERROR_STOP=1 -U postgres < sql/personal-finances.sql
docker --host=unix:///var/run/docker.sock exec -i "$finance_container" psql -v ON_ERROR_STOP=1 -U postgres < tests/finance-rls.sql
