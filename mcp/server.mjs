import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { core } from './core.mjs';

const type = z.enum(Object.keys(core.SCHEMAS));
const result = value => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });
const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

export function createMcpServer() {
  const server = new McpServer({ name: 'universal-prompt-studio', version: '11.1.0' });
  const tool = (name, description, inputSchema, handler) => server.registerTool(name,
    { description, inputSchema, annotations }, async args => {
      try { return result(handler(args)); }
      catch (error) { return { ...result({ error: error.message }), isError: true }; }
    });
  tool('list_builders', 'List prompt builders. Tools compose instructions; they do not run models or publish content.', {},
    () => Object.entries(core.TYPE_META).map(([id, meta]) => ({ id, title: meta.title, description: meta.desc })));
  tool('get_builder', 'Read schema, defaults, sections and sentinels before composing. Data uses flat dot-path keys.', { type },
    ({ type }) => ({ type, fields: core.SCHEMAS[type], sections: core.SECTION_INFO[type],
      defaults: core.defaultFormData(type), sentinels: core.SELECT_SENTINELS }));
  tool('list_presets', 'Read built-in presets for a builder.', { type }, ({ type }) => core.PRESETS[type] || {});
  tool('generate_prompt', 'Generate JSON and text using the browser core, optionally from a preset. Returns an importable template library. No persistence.',
    { type, data: z.record(z.string(), z.unknown()).default({}), preset: z.string().optional(), useDefaults: z.boolean().default(true) },
    ({ type, data, preset, useDefaults }) => {
      const presets = core.PRESETS[type] || {};
      if (preset !== undefined && !core.hasOwn(presets, preset)) throw new Error('Unknown preset');
      const fields = core.validateFormData(type, { ...(useDefaults ? core.defaultFormData(type) : {}),
        ...(preset === undefined ? {} : presets[preset]), ...data });
      const json = core.buildPromptObject(type, fields);
      return { type, json, text: core.promptPlainText(json), templateLibrary: {
        _type: 'promptStudioTemplates', templates: { 'Agent generated prompt': { type, data: fields } }
      } };
    });
  tool('build_chain', 'Compose sequential instructions, without execution. Use unique IDs/output labels; inputSource must be manual or an earlier step ID.',
    { steps: z.array(z.object({ id: z.number().int().positive(), name: z.string().optional(),
      type: z.enum(['standard', 'translate']), role: z.string().optional(), task: z.string().optional(),
      inputSource: z.union([z.number().int().positive(), z.string()]).optional(), inputData: z.string().optional(),
      outputLabel: z.string().optional(), targets: z.array(z.string()).optional(), customTarget: z.string().optional() })).min(1).max(100) },
    ({ steps }) => core.buildChainObject(steps));
  return server;
}

export function createHttpServer({ host = '127.0.0.1', port = 3033, token, allowedHosts = [] } = {}) {
  if (!token || token.length < 32) throw new Error('PROMPT_STUDIO_TOKEN must contain at least 32 characters');
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid port');
  if (['0.0.0.0', '::'].includes(host)) throw new Error('Bind to a specific local IP, not all interfaces');
  const hosts = new Set([host.toLowerCase(), ...allowedHosts.map(value => value.toLowerCase())]);
  if (host === '127.0.0.1') hosts.add('localhost');
  const expected = Buffer.from(`Bearer ${token}`);
  const http = createServer(async (req, res) => {
    const reply = (status, message) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: message })); };
    let hostname;
    try { hostname = new URL(`http://${req.headers.host}`).hostname; } catch { return reply(403, 'Invalid Host'); }
    if (!hosts.has(hostname.toLowerCase())) return reply(403, 'Host not allowed');
    // Native agent clients need no browser Origin or CORS access.
    if (req.headers.origin !== undefined) return reply(403, 'Browser origins are not allowed');
    const supplied = Buffer.from(req.headers.authorization || '');
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return reply(401, 'Unauthorized');
    if (req.url !== '/mcp') return reply(404, 'Not found');
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return reply(405, 'Use POST'); }
    if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') return reply(415, 'Expected application/json');
    let size = 0;
    const chunks = [];
    try {
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 1024 * 1024) { reply(413, 'Request exceeds 1 MiB'); return; }
        chunks.push(chunk);
      }
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { return reply(400, 'Invalid JSON'); }
      const server = createMcpServer();
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on('close', () => { void server.close().catch(() => {}); });
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch {
      if (!res.headersSent) reply(500, 'Request failed');
      else res.end();
    }
  });
  http.requestTimeout = 15000;
  http.headersTimeout = 10000;
  return http;
}

async function main() {
  if (process.argv.includes('--http')) {
    const host = process.env.PROMPT_STUDIO_HOST || '127.0.0.1';
    const port = Number(process.env.PROMPT_STUDIO_PORT || 3033);
    const http = createHttpServer({ host, port, token: process.env.PROMPT_STUDIO_TOKEN,
      allowedHosts: (process.env.PROMPT_STUDIO_ALLOWED_HOSTS || '').split(',').map(s => s.trim()).filter(Boolean) });
    http.on('error', error => { console.error(error.message); process.exitCode = 1; });
    http.listen(port, host, () => console.error(`Prompt Studio MCP listening at http://${host}:${port}/mcp`));
    const stop = () => { http.close(); http.closeAllConnections(); };
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
  } else {
    await createMcpServer().connect(new StdioServerTransport());
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
