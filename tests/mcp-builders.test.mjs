// End-to-end: every builder and every preset through a real MCP client, compared with the browser core.
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createHttpServer } from '../mcp/server.mjs';
import { core } from '../mcp/core.mjs';

const plain = value => JSON.parse(JSON.stringify(value));
const token = 'test-only-token-not-for-deployment-1234567890';
const call = async (client, name, args) => {
  const res = await client.callTool({ name, arguments: args });
  return { error: res.isError === true, value: JSON.parse(res.content[0].text) };
};
// Builders whose schema has a target-model field, and the profile family it uses.
const PROFILED = { image: 'image', video: 'video', llm: 'llm', audio: 'audio', motion: 'video' };

async function exerciseAllBuilders(client) {
  const types = Object.keys(core.SCHEMAS);

  // Tool schemas advertise every builder.
  const { tools } = await client.listTools();
  for (const name of ['get_builder', 'list_presets', 'generate_prompt']) {
    const schema = tools.find(t => t.name === name).inputSchema;
    assert.deepEqual([...schema.properties.type.enum].sort(), [...types].sort(), `${name} type enum`);
    for (const t of tools) assert.equal(t.annotations.readOnlyHint, true, `${t.name} is read-only`);
  }

  const listed = (await call(client, 'list_builders', {})).value;
  assert.deepEqual(listed.map(b => b.id).sort(), [...types].sort());
  for (const b of listed) assert.ok(b.title && b.description, `${b.id} has title and description`);

  let presetRuns = 0;
  for (const type of types) {
    // get_builder mirrors the core schema.
    const builder = (await call(client, 'get_builder', { type })).value;
    assert.deepEqual(Object.keys(builder.fields).sort(), Object.keys(core.SCHEMAS[type]).sort(), `${type} fields`);
    assert.deepEqual(Object.keys(builder.sections), Object.keys(core.SECTION_INFO[type]), `${type} sections`);
    assert.deepEqual(builder.defaults, plain(core.defaultFormData(type)), `${type} defaults`);
    if (PROFILED[type]) {
      const family = PROFILED[type];
      assert.deepEqual(Object.keys(builder.modelProfiles[family]), Object.keys(core.MODEL_PROFILES[family]), `${type} profiles`);
    } else {
      assert.deepEqual(builder.modelProfiles, {}, `${type} has no profiles`);
    }

    // list_presets mirrors the core presets.
    const presets = (await call(client, 'list_presets', { type })).value;
    assert.deepEqual(presets, plain(core.PRESETS[type] || {}), `${type} presets`);

    // Defaults alone, then every preset, must match the browser output exactly.
    const runs = [[undefined, {}], ...Object.keys(presets).map(name => [name, presets[name]])];
    for (const [preset, presetData] of runs) {
      const args = { type, ...(preset ? { preset } : {}) };
      const { error, value } = await call(client, 'generate_prompt', args);
      assert.equal(error, false, `${type} / ${preset || 'defaults'}: ${JSON.stringify(value)}`);
      const expected = plain(core.buildPromptObject(type, { ...core.defaultFormData(type), ...presetData }));
      assert.deepEqual(value.json, expected, `${type} / ${preset || 'defaults'} json`);
      assert.equal(value.text, core.promptPlainText(value.json), `${type} / ${preset || 'defaults'} text`);
      assert.ok(core.validTemplate(value.templateLibrary.templates['Agent generated prompt']), `${type} template importable`);
      assert.deepEqual(plain(core.importPromptData(type, value.json)), plain(core.importPromptData(type, expected)), `${type} round-trips`);
      if (preset) presetRuns += 1;
    }
  }
  assert.equal(presetRuns, Object.values(core.PRESETS).reduce((n, set) => n + Object.keys(set).length, 0));
  return presetRuns;
}

async function exerciseGuidanceAndErrors(client) {
  // Model guidance reaches agents: native syntax, warnings, API ids.
  const mj = (await call(client, 'generate_prompt', { type: 'image', useDefaults: false,
    data: { 'meta.target_model': 'midjourney_v8_2', 'meta.aspect_ratio': '4:5', 'meta.quality': 'raw', 'model_params.stylize': 150 } })).value;
  assert.equal(mj.json.model_guidance.native_parameters, '--ar 4:5 --raw --s 150');
  assert.match(mj.text, /model guidance › native parameters: --ar 4:5 --raw --s 150/);
  const veo = (await call(client, 'generate_prompt', { type: 'video', data: { 'meta.target_model': 'veo_3_1', 'meta.duration': '10s' } })).value;
  assert.match(veo.json.model_guidance.compatibility_warnings.join(' '), /4, 6, 8 s/);
  const motion = (await call(client, 'generate_prompt', { type: 'motion', data: { 'target.tool': 'ai_video_model', 'target.ai_video_model': 'kling_3_0_omni' } })).value;
  assert.match(motion.json.model_guidance.target_model, /Kling 3\.0 Omni/);
  const llm = (await call(client, 'generate_prompt', { type: 'llm', data: { 'meta.target_model': 'claude_opus_5_5' } })).value;
  assert.equal(llm.json.model_guidance.api_model_id, 'claude-opus-5-5');
  const suno = (await call(client, 'generate_prompt', { type: 'audio', preset: 'Suno v6 Pop Song' })).value;
  assert.match(suno.json.model_guidance.target_model, /Suno v6/);

  // New builders accept their own fields and presets merge with caller data (caller wins).
  const android = (await call(client, 'generate_prompt', { type: 'android', preset: 'Offline Habit Tracker (first app)', data: { 'stack.target_sdk': '37' } })).value;
  assert.equal(android.json.stack.target_sdk, '37');
  assert.equal(android.json.arch.navigation, 'navigation_3');
  const ios = (await call(client, 'generate_prompt', { type: 'ios', data: { 'stack.min_ios': '27', 'form.targets': ['iphone', 'iphone_duo_foldable'] } })).value;
  assert.deepEqual(ios.json.form.targets, ['iphone', 'iphone_duo_foldable']);
  const bare = (await call(client, 'generate_prompt', { type: 'aftereffects', useDefaults: false, data: { user_intent: 'Wiggle helper' } })).value;
  assert.deepEqual(bare.json, { user_intent: 'Wiggle helper' });

  // Errors come back as tool errors, never crashes.
  const expectError = async (args, pattern) => {
    const { error, value } = await call(client, 'generate_prompt', args);
    assert.equal(error, true, JSON.stringify(args));
    assert.match(value.error || '', pattern);
  };
  await expectError({ type: 'ios', preset: 'No such preset' }, /Unknown preset/);
  await expectError({ type: 'android', data: { 'not.a.field': 'x' } }, /Unknown field/);
  await expectError({ type: 'android', data: { 'form.widgets': 'yes' } }, /Invalid value type/);
  await expectError({ type: 'ios', data: { 'form.targets': 'iphone' } }, /Invalid value type/);
  await expectError({ type: 'image', data: { '__proto__.x': 1 } }, /Unsafe/);
  const badType = await client.callTool({ name: 'generate_prompt', arguments: { type: 'windows_phone' } }).catch(e => ({ isError: true, thrown: e }));
  assert.equal(badType.isError, true, 'unknown builder type is rejected');
  const badChain = await client.callTool({ name: 'build_chain', arguments: { steps: [{ id: 1, type: 'standard', inputSource: 2 }] } });
  assert.equal(badChain.isError, true, 'chain inputs must reference earlier steps');
}

test('MCP stdio: every builder, every preset, guidance and errors', async () => {
  const client = new Client({ name: 'studio-builders-test', version: '1' });
  try {
    await client.connect(new StdioClientTransport({ command: process.execPath,
      args: [fileURLToPath(new URL('../mcp/server.mjs', import.meta.url))], stderr: 'pipe' }));
    const runs = await exerciseAllBuilders(client);
    assert.ok(runs >= 80);
    await exerciseGuidanceAndErrors(client);
  } finally { await client.close(); }
});

test('MCP Streamable HTTP: every builder, every preset, guidance and errors', async () => {
  const http = createHttpServer({ token });
  http.listen(0, '127.0.0.1');
  await once(http, 'listening');
  const url = new URL(`http://127.0.0.1:${http.address().port}/mcp`);
  const client = new Client({ name: 'studio-builders-http-test', version: '1' });
  try {
    await client.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
    await exerciseAllBuilders(client);
    await exerciseGuidanceAndErrors(client);
  } finally {
    await client.close();
    http.closeAllConnections();
    await new Promise(resolve => http.close(resolve));
  }
});
