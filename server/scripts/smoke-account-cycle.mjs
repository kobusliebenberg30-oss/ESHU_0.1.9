#!/usr/bin/env node
/**
 * smoke-account-cycle.mjs
 *
 * Drive the logout / new-account cycle against a running server. This is
 * the manual flow the user keeps hitting during smoke testing.
 *
 * Steps (single cookie jar = single browser tab):
 *
 *   1. Register user A.
 *   2. Pull /sync, capture profile A.
 *   3. Join default group as A. Verify membership.
 *   4. Mark a couple of onboarding messages as read on /sync PUT.
 *   5. Logout. Confirm subsequent /sync returns 401.
 *   6. Register user B on the same agent.
 *   7. Pull /sync. Confirm:
 *       - A different currentProfileId is returned.
 *       - A is NOT a member of the default group in B's snapshot.
 *       - None of A's readMessageIds_* keys appear in B's values.
 *   8. Join default group as B.
 *   9. Logout B.
 *  10. Login as A again. Confirm A's read-flag set is intact and A is
 *      still a member of the default group.
 *
 * Run: `npm run smoke:account-cycle`
 *
 * Exit code:
 *   0 -> all checks passed
 *   1 -> any check failed
 */
const BASE = process.env.ESHU_API_BASE || 'http://localhost:3100/api';
const VERBOSE = !!process.env.ESHU_VERBOSE;
const ALLOW_DEV_DB = process.env.ESHU_SMOKE_ALLOW_DEV_DB === '1';
const DEFAULT_GROUP_ID = 'group_default';

async function preflightTargetEnv() {
  const healthUrl = `${BASE.replace(/\/api\/?$/, '')}/healthz`;
  let env;
  try {
    const res = await fetch(healthUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    env = body?.env;
  } catch (err) {
    console.error(
      `[smoke] could not reach ${healthUrl}: ${err?.message || err}\n` +
        `Start the test server first with:  npm run dev:test\n`,
    );
    process.exit(1);
  }
  if (env !== 'test' && !ALLOW_DEV_DB) {
    console.error(
      `[smoke] target server reports NODE_ENV="${env}", refusing to run.\n` +
        `Use the test server:  npm run dev:test  (then re-run this script)\n` +
        `Or set ESHU_SMOKE_ALLOW_DEV_DB=1 to override (will pollute the dev DB).\n`,
    );
    process.exit(1);
  }
  console.log(`[smoke] target env: ${env}${env !== 'test' ? ' (override active)' : ''}`);
}

const failures = [];
function check(label, predicate, details = {}) {
  if (predicate) {
    console.log(`  ok  — ${label}`);
  } else {
    console.error(`  FAIL — ${label}`, details);
    failures.push({ label, details });
  }
}

function log(stage, payload) {
  if (!VERBOSE) return;
  console.log(`[verbose] ${stage}:`, JSON.stringify(payload, null, 2));
}

class CookieJar {
  constructor() { this.cookies = new Map(); }
  ingest(setCookieHeader) {
    if (!setCookieHeader) return;
    const values = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
    for (const raw of values) {
      const [pair] = String(raw).split(';');
      const eq = pair.indexOf('=');
      if (eq <= 0) continue;
      this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }
  clear() { this.cookies.clear(); }
  header() {
    if (!this.cookies.size) return '';
    return Array.from(this.cookies.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

async function request(method, path, { jar, body, allowStatus } = {}) {
  const headers = { accept: 'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (jar) {
    const cookie = jar.header();
    if (cookie) headers.cookie = cookie;
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (jar) {
    const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : res.headers.get('set-cookie');
    jar.ingest(setCookie);
  }
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-json */ }
  if (allowStatus && allowStatus.includes(res.status)) return { status: res.status, body: json, raw: text };
  return { status: res.status, body: json, raw: text };
}

function freshCreds(prefix) {
  const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return {
    email: `${prefix}_${stamp}@test.local`,
    username: `${prefix}_${stamp}`,
    password: 'hunter2hunter2',
  };
}

async function main() {
  await preflightTargetEnv();
  console.log(`[smoke] base url: ${BASE}`);
  const jar = new CookieJar();
  const a = freshCreds('cycle_a');
  const b = freshCreds('cycle_b');

  console.log('\n[1] register A');
  const regA = await request('POST', '/auth/register', { jar, body: a });
  check('register A -> 201', regA.status === 201, { status: regA.status, body: regA.body });

  console.log('\n[2] /sync as A');
  const syncA1 = await request('GET', '/sync', { jar });
  const profileIdA = syncA1.body?.values?.currentProfileId ?? null;
  check('A profile present', !!profileIdA, { profileIdA });

  console.log('\n[3] A joins default group');
  const joinA = await request('POST', `/groups/${DEFAULT_GROUP_ID}/join`, { jar });
  check('A join -> 200', joinA.status === 200);
  const syncA2 = await request('GET', '/sync', { jar });
  const aDefault = syncA2.body?.tables?.groups?.find((g) => g.id === DEFAULT_GROUP_ID) ?? null;
  check('A is member of default group', !!aDefault && aDefault.memberProfileIds?.includes(profileIdA));

  console.log('\n[4] A marks onboarding messages as read');
  const aReadKey = `readMessageIds_${profileIdA}`;
  await request('PUT', '/sync', {
    jar,
    body: { values: { currentProfileId: profileIdA, [aReadKey]: ['proto-a-v1', 'onboard-join-group'] } },
  });
  const syncA3 = await request('GET', '/sync', { jar });
  check(
    "A's read flags round-trip",
    Array.isArray(syncA3.body?.values?.[aReadKey]) && syncA3.body.values[aReadKey].includes('proto-a-v1'),
    { keys: Object.keys(syncA3.body?.values || {}).filter((k) => k.startsWith('readMessageIds_')) },
  );

  console.log('\n[5] logout A');
  const logoutA = await request('POST', '/auth/logout', { jar, allowStatus: [204] });
  check('logout A -> 204', logoutA.status === 204);
  jar.clear(); // mirror the browser behavior of dropping the cookie
  const syncDenied = await request('GET', '/sync', { jar, allowStatus: [401] });
  check('post-logout /sync rejected', syncDenied.status === 401);

  console.log('\n[6] register B on same agent');
  const regB = await request('POST', '/auth/register', { jar, body: b });
  check('register B -> 201', regB.status === 201);

  console.log('\n[7] /sync as B — must be clean');
  const syncB1 = await request('GET', '/sync', { jar });
  const profileIdB = syncB1.body?.values?.currentProfileId ?? null;
  check('B has a different profile id from A', !!profileIdB && profileIdB !== profileIdA, {
    profileIdA, profileIdB,
  });
  const bDefault = syncB1.body?.tables?.groups?.find((g) => g.id === DEFAULT_GROUP_ID) ?? null;
  // The system default group MAY appear in B's snapshot (it's a public row
  // visible to authenticated users), but B must NOT be a member yet AND A's
  // profile id must not appear in B's view of the membership list.
  if (bDefault) {
    check('B sees default group but is not a member', !bDefault.memberProfileIds?.includes(profileIdB));
    check(
      "B's view of default group does not reveal A's membership",
      !bDefault.memberProfileIds?.includes(profileIdA),
      { memberProfileIds: bDefault.memberProfileIds },
    );
  }
  const aLeakedKeys = Object.keys(syncB1.body?.values || {}).filter((k) =>
    k === `readMessageIds_${profileIdA}` || k === `earnedMilestones_${profileIdA}`,
  );
  check("none of A's scoped keys appear in B's snapshot", aLeakedKeys.length === 0, { aLeakedKeys });

  console.log('\n[8] B joins default group');
  const joinB = await request('POST', `/groups/${DEFAULT_GROUP_ID}/join`, { jar });
  check('B join -> 200', joinB.status === 200);

  console.log('\n[9] logout B');
  const logoutB = await request('POST', '/auth/logout', { jar, allowStatus: [204] });
  check('logout B -> 204', logoutB.status === 204);
  jar.clear();

  console.log('\n[10] login as A again — read flags and membership intact');
  const loginA = await request('POST', '/auth/login', {
    jar,
    body: { emailOrUsername: a.email, password: a.password },
  });
  check('A login -> 200', loginA.status === 200);
  const syncARelog = await request('GET', '/sync', { jar });
  log('relog A', syncARelog.body);
  const aRereadFlags = syncARelog.body?.values?.[`readMessageIds_${profileIdA}`] ?? [];
  check(
    "A's read flags survived the cycle",
    Array.isArray(aRereadFlags) && aRereadFlags.includes('proto-a-v1'),
    { aRereadFlags },
  );
  const aRedefault = syncARelog.body?.tables?.groups?.find((g) => g.id === DEFAULT_GROUP_ID) ?? null;
  check(
    'A is still a member of default group after the cycle',
    !!aRedefault && aRedefault.memberProfileIds?.includes(profileIdA),
    { memberProfileIds: aRedefault?.memberProfileIds },
  );

  console.log(failures.length === 0 ? '\n[smoke] all checks passed' : `\n[smoke] ${failures.length} failure(s)`);
  if (failures.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error('[smoke] uncaught error:', err);
  process.exit(1);
});
