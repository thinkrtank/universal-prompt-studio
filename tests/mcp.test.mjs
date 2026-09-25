import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request } from 'node:http';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createHttpServer } from '../mcp/server.mjs';
import { core } from '../mcp/core.mjs';

const token = 'test-only-token-not-for-deployment-1234567890';
async function exercise(client) {
  const listed = await client.listTools();
  assert.deepEqual(listed.tools.map(t => t.name).sort(), ['build_chain', 'generate_prompt', 'get_builder', 'list_builders', 'list_presets']);
  const builders = await client.callTool({ name: 'list_builders', arguments: {} });
  assert.equal(JSON.parse(builders.content[0].text).length, 13);
  const schema = await client.callTool({ name: 'get_builder', arguments: { type: 'image' } });
  const builder = JSON.parse(schema.content[0].text);
  assert.ok(builder.fields['text.enabled']);
  assert.match(builder.modelProfiles.image.midjourney_v8_2.label, /Midjourney V8\.2/);
  const args = { type: 'llm', data: { user_intent: 'Use my studio', 'role.persona': 'best_fit' } };
  const generated = await client.callTool({ name: 'generate_prompt', arguments: args });
  assert.notEqual(generated.isError, true);
  const value = JSON.parse(generated.content[0].text);
  assert.deepEqual(value.json, JSON.parse(JSON.stringify(core.buildPromptObject('llm', { ...core.defaultFormData('llm'), ...args.data }))));
  assert.equal(value.text, core.promptPlainText(value.json));
  assert.ok(core.validTemplate(value.templateLibrary.templates['Agent generated prompt']));
  const bad = await client.callTool({ name: 'generate_prompt', arguments: { type: 'llm', data: { 'constructor.prototype.bad': true } } });
  assert.equal(bad.isError, true);
  const chain = await client.callTool({ name: 'build_chain', arguments: { steps: [{ id: 1, type: 'standard', task: 'Draft' }] } });
  assert.equal(JSON.parse(chain.content[0].text).chain[0].task, 'Draft');
}

test('real MCP stdio client: initialize, list and call tools', async () => {
  const client = new Client({ name: 'studio-test', version: '1' });
  try {
    await client.connect(new StdioClientTransport({ command: process.execPath,
      args: [fileURLToPath(new URL('../mcp/server.mjs', import.meta.url))], stderr: 'pipe' }));
    await exercise(client);
  } finally { await client.close(); }
});

test('real MCP Streamable HTTP client and request guards', async () => {
  const http = createHttpServer({ token });
  http.listen(0, '127.0.0.1');
  await once(http, 'listening');
  const url = new URL(`http://127.0.0.1:${http.address().port}/mcp`);
  const client = new Client({ name: 'studio-http-test', version: '1' });
  try {
    assert.equal((await fetch(url, { method: 'POST' })).status, 401);
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    assert.equal((await fetch(url, { method: 'POST', headers: { ...headers, Origin: 'https://untrusted.example' } })).status, 403);
    const badHostStatus = await new Promise((resolve, reject) => {
      const req = request(url, { method: 'POST', headers: { ...headers, Host: 'untrusted.example' } }, res => { res.resume(); resolve(res.statusCode); });
      req.on('error', reject); req.end();
    });
    assert.equal(badHostStatus, 403);
    assert.equal((await fetch(url, { method: 'GET', headers })).status, 405);
    assert.equal((await fetch(url, { method: 'POST', headers, body: '{broken' })).status, 400);
    assert.equal((await fetch(url, { method: 'POST', headers, body: 'x'.repeat(1024 * 1024 + 1) })).status, 413);
    await client.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers } }));
    await exercise(client);
  } finally {
    await client.close();
    http.closeAllConnections();
    await new Promise(resolve => http.close(resolve));
  }
});

test('HTTP configuration requires a strong token and explicit interface', () => {
  assert.throws(() => createHttpServer(), /TOKEN/);
  assert.throws(() => createHttpServer({ token: 'short' }), /TOKEN/);
  assert.throws(() => createHttpServer({ token, host: '0.0.0.0' }), /specific local IP/);
});
