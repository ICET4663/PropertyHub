// Applies every migration in supabase/migrations to a throwaway in-memory Postgres (PGlite), with
// small stand-ins for what Supabase provides (auth.uid(), roles, storage, pg_net, pg_cron), then
// runs each test file in scripts/db-tests. No Supabase project or keys needed.
// Run: npm run db:test            (all tests)
//      npm run db:test payments   (test files whose name contains "payments")
//
// The stand-ins are not Supabase: storage, Realtime, pg_net and pg_cron are stubs. Use the
// verify-*.mjs scripts against the real project once migrations are applied there.
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrations = join(root, 'supabase', 'migrations');
const testsDir = join(root, 'scripts', 'db-tests');
const only = process.argv[2] ?? '';

const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
  create schema auth; create schema storage; create schema extensions; create schema net; create schema cron;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, phone text, raw_user_meta_data jsonb default '{}');
  -- Same as Supabase's: the signed-in user is the "sub" claim of the request's JWT.
  create function auth.uid() returns uuid language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon, authenticated, service_role;
  grant all on storage.objects to anon, authenticated, service_role;
  create function storage.foldername(name text) returns text[] language sql immutable as
    $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  create publication supabase_realtime;
  create table net._http_response (id bigint, status_code int, content text, created timestamptz);
  create function net.http_post(url text, body jsonb, headers jsonb) returns bigint language sql as $$ select 1::bigint $$;
  create function cron.schedule(a text, b text, c text) returns bigint language sql as $$ select 1::bigint $$;
`);

for (const f of readdirSync(migrations).filter((f) => f.endsWith('.sql')).sort()) {
  // Extensions are provided by the stand-ins above (or built in, like gen_random_uuid).
  const sql = readFileSync(join(migrations, f), 'utf8').replace(/^create extension.*$/gm, '');
  try {
    await db.exec(sql);
    console.log(`applied ${f}`);
  } catch (e) {
    console.log(`FAILED to apply ${f}: ${e.message}`);
    process.exit(1);
  }
}

let failures = 0;
const ctx = {
  db,
  /** Runs as the database owner with no signed-in user (like the seed script): RLS and guards don't apply. */
  q: async (sql, params) => {
    await db.query(`select set_config('request.jwt.claims', '', false)`);
    return db.query(sql, params);
  },
  /** Runs one statement as a signed-in user (uid) under a Supabase role, so RLS and grants apply. */
  as: async (uid, role, sql, params) => {
    await db.query(`select set_config('request.jwt.claims', $1, false)`, [uid ? JSON.stringify({ sub: uid }) : '']);
    await db.exec(`set role ${role}`);
    try { return await db.query(sql, params); } finally { await db.exec('reset role'); }
  },
  test: async (name, fn) => {
    try { await fn(); console.log(`PASS ${name}`); } catch (e) { failures++; console.log(`FAIL ${name}: ${e.message}`); }
  },
  /** Passes when the promise fails with a message matching `pattern`. */
  expectError: async (promise, pattern) => {
    try { await promise; } catch (e) {
      if (!pattern.test(e.message)) throw new Error(`wrong error: ${e.message}`);
      return;
    }
    throw new Error('expected an error');
  },
};

for (const f of readdirSync(testsDir).filter((f) => f.endsWith('.mjs') && f.includes(only)).sort()) {
  console.log(`\n${f}`);
  await (await import(pathToFileURL(join(testsDir, f)).href)).default(ctx);
}
console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
