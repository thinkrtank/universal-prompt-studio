import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// Reuse only the project's pure, owned script. Never evaluate imported prompts.
// This boundary is not a sandbox for untrusted source code.
const html = readFileSync(new URL('../universal-prompt-studio-v11.html', import.meta.url), 'utf8');
const source = html.match(/<script id="prompt-studio-core">([\s\S]*?)<\/script>/)?.[1];
if (!source) throw new Error('Prompt Studio core script is missing');
export const core = runInNewContext(`${source}\nPromptStudioCore;`, {}, { timeout: 5000 });
