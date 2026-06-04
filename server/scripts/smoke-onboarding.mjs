#!/usr/bin/env node
/**
 * smoke-onboarding.mjs
 *
 * End-to-end smoke test against a running server (dev or prod). Exercises
 * the onboarding flow that we have repeatedly debugged:
 *
 *   1. Register a fresh user.
 *   2. Pull /api/sync — confirm currentProfileId is set.
 *   3. POST /api/groups/group_default/join — confirm membership is returned.
 *   4. Pull /api/sync — confirm membership persists and the default game is
 *      materialized with the active profile as a member.
 *   5. Sleep briefly and pull again — confirm a "restart-like" reload still
 *      returns the membership (catches caching / write-after-read bugs).
 *
 * Run: `npm run smoke:onboarding`
 *
 * Env:
 *   ESHU_API_BASE              default http://localhost:3100/api (test server)
 *   ESHU_SMOKE_ALLOW_DEV_DB=1  bypass the env guard (dangerous; only set if
 *                              you really do want to pollute the dev DB)
 *   ESHU_VERBOSE               when set, prints full JSON payloads
 *
 * Exit code:
 *   0 -> all checks passed
 *   1 -> any check failed
 */
const BASE = process.env.ESHU_API_BASE || 'http://localhost:3100/api';
const VERBOSE = !!process.env.ESHU_VERBOSE;
const ALLOW_DEV_DB = process.env.ESHU_SMOKE_ALLOW_DEV_DB === '1';

const DEFAULT_GROUP_ID = 'group_default';
const DEFAULT_GAME_ID = 'game_default';

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
  constructor() {
    this.cookies = new Map();
  }
  ingest(setCookieHeader) {
    if (!setCookieHeader) return;
    const values = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
    for (const raw of values) {
      const [pair] = String(raw).split(';');
      const eq = pair.indexOf('=');
      if (eq <= 0) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      this.cookies.set(name, value);
    }
  }
  header() {
    if (!this.cookies.size) return '';
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }
}

async function request(method, path, { jar, body } = {}) {
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
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON body */
  }
  return { status: res.status, body: json, raw: text };
}

/**
 * Upload a Buffer to POST /api/assets as a multipart/form-data form. Used
 * by smoke checks that exercise the asset upload pipeline end-to-end —
 * the same path the frontend's ESHU_ASSETS.uploadDataUrl helper takes.
 */
async function uploadFile(path, { jar, buffer, filename, mimeType }) {
  const blob = new Blob([buffer], { type: mimeType });
  const form = new FormData();
  form.append('file', blob, filename);
  const headers = { accept: 'application/json' };
  if (jar) {
    const cookie = jar.header();
    if (cookie) headers.cookie = cookie;
  }
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers, body: form });
  if (jar) {
    const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : res.headers.get('set-cookie');
    jar.ingest(setCookie);
  }
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  return { status: res.status, body: json, raw: text };
}

// Smallest possible PNG payload — a 1x1 transparent pixel. We use this
// across smoke checks instead of generating fresh bytes each time so the
// content-addressable storage dedups deterministically.
const PNG_PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAFhAJ/wlseKgAAAABJRU5ErkJggg==',
  'base64',
);

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

async function main() {
  await preflightTargetEnv();
  console.log(`[smoke] base url: ${BASE}`);
  const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const credentials = {
    email: `smoke_${stamp}@test.local`,
    username: `smoke_${stamp}`,
    password: 'hunter2hunter2',
  };
  const jar = new CookieJar();

  console.log('\n[1] register');
  const register = await request('POST', '/auth/register', { jar, body: credentials });
  log('register', register.body);
  check('POST /auth/register -> 201', register.status === 201, { status: register.status });

  console.log('\n[2] initial /sync');
  const sync0 = await request('GET', '/sync', { jar });
  log('sync0', sync0.body);
  const profileId = sync0.body?.values?.currentProfileId ?? null;
  check('GET /sync -> 200', sync0.status === 200, { status: sync0.status });
  check('currentProfileId present', typeof profileId === 'string' && profileId.length > 0, {
    profileId,
  });

  console.log('\n[3] join default group');
  const join = await request('POST', `/groups/${DEFAULT_GROUP_ID}/join`, { jar });
  log('join', join.body);
  check('POST /groups/group_default/join -> 200', join.status === 200, { status: join.status });
  const joinedMembers = Array.isArray(join.body?.group?.memberProfileIds)
    ? join.body.group.memberProfileIds
    : [];
  check(
    'join response includes active profile',
    profileId !== null && joinedMembers.includes(profileId),
    { joinedMembers, profileId },
  );

  console.log('\n[4] /sync reflects membership + default game');
  const sync1 = await request('GET', '/sync', { jar });
  log('sync1', sync1.body);
  const defaultGroup = sync1.body?.tables?.groups?.find((g) => g.id === DEFAULT_GROUP_ID) ?? null;
  const defaultGame = sync1.body?.tables?.games?.find((g) => g.id === DEFAULT_GAME_ID) ?? null;
  check('default group present', !!defaultGroup);
  check(
    'default group includes profile in memberProfileIds',
    !!defaultGroup && defaultGroup.memberProfileIds?.includes(profileId),
    { memberProfileIds: defaultGroup?.memberProfileIds },
  );
  check('default game present', !!defaultGame);
  check('default game has fixed onboarding flags', !!defaultGame && defaultGame.fixedSettings === true && defaultGame.awardsXp === false, {
    fixedSettings: defaultGame?.fixedSettings,
    awardsXp: defaultGame?.awardsXp,
  });
  check(
    'default game includes profile in memberProfileIds',
    !!defaultGame && defaultGame.memberProfileIds?.includes(profileId),
    { memberProfileIds: defaultGame?.memberProfileIds },
  );

  console.log('\n[4b] XP gates reflect onboarding calibration');
  const gates = await request('GET', '/xp/gates', { jar });
  log('gates', gates.body);
  check('GET /xp/gates -> 200', gates.status === 200, { status: gates.status });
  check(
    'joining default group granted game_created XP (>= 2)',
    typeof gates.body?.xpPoints === 'number' && gates.body.xpPoints >= 2,
    { xpPoints: gates.body?.xpPoints },
  );
  check(
    'upload_creations gate is open after default-group join',
    Array.isArray(gates.body?.unlocks) && gates.body.unlocks.includes('upload_creations'),
    { unlocks: gates.body?.unlocks },
  );

  console.log('\n[4c] re-joining default group is XP-idempotent');
  await request('POST', `/groups/${DEFAULT_GROUP_ID}/join`, { jar });
  await request('POST', `/groups/${DEFAULT_GROUP_ID}/join`, { jar });
  const gates2 = await request('GET', '/xp/gates', { jar });
  check(
    'XP did not stack on repeated joins',
    gates2.body?.xpPoints === gates.body?.xpPoints,
    { before: gates.body?.xpPoints, after: gates2.body?.xpPoints },
  );

  console.log('\n[4d] image round-trips through create + partial PATCH + /sync');
  // 1x1 PNGs — small enough not to bloat the smoke run, exercises the legacy
  // base64-data-url path that the frontend currently ships.
  const imgA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const imgB = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const groupCreate = await request('POST', '/groups', {
    jar,
    body: { name: `smoke-img-${stamp}`, image: imgA },
  });
  log('group with image', groupCreate.body);
  check('POST /groups with image -> 201', groupCreate.status === 201, { status: groupCreate.status });
  check('create response includes image', groupCreate.body?.group?.image === imgA);
  const groupId = groupCreate.body?.group?.id;

  // PATCH only the name. The server must NOT clobber the stored image —
  // this is the exact scenario the #6 bug bit on (image disappears on save).
  const groupRename = await request('PATCH', `/groups/${groupId}`, {
    jar,
    body: { name: `smoke-img-${stamp}-v2` },
  });
  check('partial PATCH preserves image', groupRename.body?.group?.image === imgA, {
    image: groupRename.body?.group?.image,
  });

  // Replace image; expect new bytes back.
  const groupReimage = await request('PATCH', `/groups/${groupId}`, { jar, body: { image: imgB } });
  check('explicit image replace persists', groupReimage.body?.group?.image === imgB);

  // Snapshot view (the path the local mirror reads after ESHU_SYNC.refresh).
  const syncImg = await request('GET', '/sync', { jar });
  const snapshotRow = syncImg.body?.tables?.groups?.find((g) => g.id === groupId) ?? null;
  check('snapshot surfaces image at top level', snapshotRow?.image === imgB, {
    image: snapshotRow?.image,
  });

  console.log('\n[4e] asset pipeline: upload -> attach as avatar -> visible cross-user');
  const upload = await uploadFile('/assets', {
    jar,
    buffer: PNG_PIXEL,
    filename: 'avatar.png',
    mimeType: 'image/png',
  });
  check('POST /assets -> 201', upload.status === 201, { status: upload.status });
  const assetId = upload.body?.asset?.id;
  check('upload response includes asset id', typeof assetId === 'string' && assetId.length > 0);

  const attach = await request('PATCH', `/profiles/${profileId}`, {
    jar,
    body: { avatarAssetId: assetId },
  });
  check('PATCH /profiles attach avatarAssetId -> 200', attach.status === 200);
  check('avatarAssetId persisted on profile', attach.body?.profile?.avatarAssetId === assetId);

  // Cross-user read: register a second player, fetch the avatar bytes via
  // /raw. The original failure mode (asset ACL too tight) blocked exactly
  // this scenario for the SU/versus mechanic.
  const otherCreds = {
    email: `smokeB_${stamp}@test.local`,
    username: `smokeB_${stamp}`,
    password: 'hunter2hunter2',
  };
  const otherJar = new CookieJar();
  await request('POST', '/auth/register', { jar: otherJar, body: otherCreds });
  const rawHeaders = { accept: '*/*', cookie: otherJar.header() };
  const rawRes = await fetch(`${BASE}/assets/${assetId}/raw`, { headers: rawHeaders });
  check('cross-user GET /assets/:id/raw -> 200', rawRes.status === 200, { status: rawRes.status });
  check('content-type is image/png', rawRes.headers.get('content-type') === 'image/png');

  console.log('\n[4f] server-side comments: post -> list -> cross-user visible -> like toggle');
  const comment = await request('POST', '/comments', {
    jar,
    body: { targetKind: 'group', targetId: DEFAULT_GROUP_ID, text: 'smoke test comment' },
  });
  check('POST /comments -> 201', comment.status === 201, { status: comment.status });
  const commentId = comment.body?.comment?.id;
  check('comment authored by active profile', comment.body?.comment?.authorProfileId === profileId);

  // Other user sees the comment without authoring it.
  const otherList = await request('GET', `/comments?targetKind=group&targetId=${DEFAULT_GROUP_ID}`, { jar: otherJar });
  check('cross-user GET /comments -> 200', otherList.status === 200);
  const visible = (otherList.body?.comments || []).some((c) => c.id === commentId);
  check('cross-user sees comment in list', visible);

  // Other user toggles like — server reconciles likedBy authoritatively.
  const otherProfileId = (await request('GET', '/profiles', { jar: otherJar })).body?.currentProfileId;
  const liked = await request('POST', `/comments/${commentId}/like`, { jar: otherJar });
  check('POST /comments/:id/like -> 200', liked.status === 200);
  check(
    'likedBy includes other user',
    Array.isArray(liked.body?.comment?.likedBy) && liked.body.comment.likedBy.includes(otherProfileId),
    { likedBy: liked.body?.comment?.likedBy, otherProfileId },
  );

  console.log('\n[5] simulated reload — pull /sync again');
  await new Promise((r) => setTimeout(r, 250));
  const sync2 = await request('GET', '/sync', { jar });
  const stillJoined = sync2.body?.tables?.groups?.find((g) => g.id === DEFAULT_GROUP_ID) ?? null;
  check(
    'membership persists across reload',
    !!stillJoined && stillJoined.memberProfileIds?.includes(profileId),
    { memberProfileIds: stillJoined?.memberProfileIds },
  );

  console.log(failures.length === 0 ? '\n[smoke] all checks passed' : `\n[smoke] ${failures.length} failure(s)`);
  if (failures.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[smoke] uncaught error:', err);
  process.exit(1);
});
