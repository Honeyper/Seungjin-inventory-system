import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { loadFunctions } from './helpers/frontend-runtime.mjs';

const gateway = stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/seungjin-dev-gateway/index.ts', import.meta.url), 'utf8'));

function createDatabaseRequest(responses) {
  const calls = [];
  const delays = [];
  const app = loadFunctions(gateway, ['databaseRequest'], {
    JSON,
    SUPABASE_URL: 'https://fixture.test',
    SUPABASE_SECRET_KEY: 'fixture',
    console: { warn() {} },
    setTimeout: (resolve, delay) => { delays.push(delay); resolve(); },
    fetch: async (url, options) => {
      calls.push({ url, options });
      const response = responses.shift();
      assert.ok(response, 'unexpected extra request');
      if (response instanceof Error) throw response;
      return response;
    }
  });
  return { app, calls, delays };
}

const routingError = () => new Response('Project not specified.\n', { status: 400 });

test('DB 연결이 읽기 단계에서 일시적으로 거절돼도 박스를 불러온다', async () => {
  const { app, calls, delays } = createDatabaseRequest([routingError(), routingError(), Response.json([{ box_id: 'B1' }])]);

  assert.deepEqual(await app.databaseRequest('dev_inventory_boxes?management_id=eq.M1'), [{ box_id: 'B1' }]);
  assert.deepEqual(delays, [250, 750]);
  assert.equal(calls.length, 3);
});

test('저장 경로가 거절됐을 때 동일한 출고 변경 및 예상 버전을 사용한다', async () => {
  const { app, calls, delays } = createDatabaseRequest([routingError(), Response.json({ version: 13, outboxId: 1 })]);
  const init = { method: 'POST', body: JSON.stringify({ p_action: 'updateShippingStatus', p_expected_version: 12 }) };

  assert.deepEqual(await app.databaseRequest('rpc/commit_dev_state_mutation', init), { version: 13, outboxId: 1 });
  assert.deepEqual(delays, [250]);
  assert.deepEqual(calls[0], calls[1]);
});

test('연결 거절이 계속되면 정해진 횟수만 요청한다', async () => {
  const { app, calls, delays } = createDatabaseRequest(Array.from({ length: 4 }, routingError));

  await assert.rejects(app.databaseRequest('dev_state'), { status: 400, responseText: 'Project not specified.\n' });
  assert.deepEqual(delays, [250, 750, 1750]);
  assert.equal(calls.length, 4);
});

for (const [label, response] of [
  ['일반 유효성 오류', Response.json({ message: 'Project not specified.' }, { status: 400 })],
  ['저장 충돌', Response.json({ message: 'DEV_STATE_VERSION_CONFLICT' }, { status: 409 })],
  ['저장 결과 알 수 없음', new Response('Bad Gateway', { status: 502 })],
  ['응답 유실', new TypeError('fetch failed')]
]) {
  test(`${label} 응답은 자동으로 다시 보내지 않는다`, async () => {
    const { app, calls, delays } = createDatabaseRequest([response]);

    await assert.rejects(app.databaseRequest('rpc/commit_dev_state_mutation', { method: 'POST', body: '{}' }));
    assert.equal(calls.length, 1);
    assert.deepEqual(delays, []);
  });
}
