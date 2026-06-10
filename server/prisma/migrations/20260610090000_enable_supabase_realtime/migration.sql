-- Live cross-device updates use Supabase Realtime BROADCAST, not
-- postgres_changes, so NO database publication is required (see
-- pages/assets/core/realtime-sync.js + server/src/lib/supabase.ts).
--
-- This migration intentionally does NOT add the core tables to the
-- `supabase_realtime` publication. Doing so would stream full row payloads
-- over the Realtime websocket to any authenticated subscriber, and a
-- row-scoped RLS policy to contain that is impossible here: syncSupabaseUser()
-- maps a Supabase user to a local User by EMAIL, and User/Profile ids are
-- Prisma cuids — no column stores auth.uid(), so `ownerProfileId = auth.uid()`
-- can never match. The server-emitted, payload-free Broadcast avoids the leak
-- entirely while still giving sub-second cross-device liveness.
--
-- For safety this migration is also a one-time REMEDIATION: it idempotently
-- REMOVES the core tables from the publication in case an earlier iteration of
-- this file (which added them) was ever applied. It is a no-op otherwise.
--
-- NB: altering `supabase_realtime` requires a privileged role. If
-- `prisma migrate deploy` lacks the privilege, run this block once from the
-- Supabase SQL editor (which executes as the `postgres` owner).

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'Group', 'Game', 'Creation', 'Profile',
    'GroupMember', 'GameMember', 'Comment'
  ];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    RETURN; -- No publication (e.g. non-Supabase CI): nothing to remediate.
  END IF;

  FOREACH t IN ARRAY tables LOOP
    -- Idempotent: only drop tables that are actually in the publication.
    IF EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format(
        'ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', t
      );
    END IF;
  END LOOP;
END
$$;
