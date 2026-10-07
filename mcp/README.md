# Agent access from a PC or Raspberry Pi

The optional MCP service exposes the existing prompt builders to agents. It composes prompts and chain instructions; it does not invoke AI models, execute code, connect to target platforms, or read your browser's localStorage.

The HTML file remains usable on its own. Only the MCP service and automated tests need Node.js 22+ and npm. The service loads the pure `prompt-studio-core` block from the HTML at startup, so schemas and generation behavior have one source of truth. Restart the service after editing the HTML.

## Install and test

From the project directory:

```powershell
npm ci --ignore-scripts
npm test
```

The tests cover all builder defaults/presets, malformed imports, unsafe keys, conditional fields, sentinel round trips, chain dependencies, and real SDK clients over both transports. Installation is also supported on Linux/ARM64 with Node.js 22+.

## Agents on this PC: stdio

Configure your agent's MCP client to launch `node` with the absolute server path. For clients using the common JSON configuration format:

```json
{
  "mcpServers": {
    "prompt-studio": {
      "command": "node",
      "args": ["F:/Ai/projects/universal-prompt-studio-v11/mcp/server.mjs"]
    }
  }
}
```

Use the full path to `node.exe` if your client does not inherit PATH. No HTTP port or token is needed for stdio. Output on stdout is reserved for MCP protocol messages.

## Agents on the Pi: Streamable HTTP

Run the service on the PC, binding to that PC's specific private IPv4 address. Replace the example address with yours. Generate a token once; store it in your password manager or client secret settings and reuse it when restarting the service.

```powershell
# Creates a 256-bit random token in this shell; does not print it.
$env:PROMPT_STUDIO_TOKEN = node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
$env:PROMPT_STUDIO_HOST = '192.168.1.50'
$env:PROMPT_STUDIO_PORT = '3033'
npm run mcp:http
```

Configure the Pi agent's Streamable HTTP transport with:

- URL: `http://192.168.1.50:3033/mcp`
- Request header: `Authorization: Bearer <the same token>`

Client configuration syntax varies. Supply the header through the client's secret/environment facility where available. A client that only supports stdio can instead run a local copy of this repository on the Pi with `node /absolute/path/mcp/server.mjs`.

The service defaults to `127.0.0.1` if HOST is omitted, requires a token of at least 32 characters for HTTP, rejects wildcard bind addresses, validates Host, rejects browser Origin headers, and limits request bodies to 1 MiB. If using a hostname instead of the bind IP, set `PROMPT_STUDIO_ALLOWED_HOSTS` to a comma-separated list of exact hostnames (without scheme or port). It serves only `/mcp`, not the browser UI or repository files.

Direct HTTP is unencrypted: use it only on your trusted private network. Use an SSH tunnel or TLS proxy if the network is shared/untrusted. Do not port-forward this endpoint to the internet. If Windows Firewall blocks the Pi, scope an inbound rule to this port, the Private profile, and the Pi's IP. No firewall rules, autostart services, or agent configurations are installed automatically.

Stop with Ctrl+C. A token is a shared local-service credential, not an OAuth implementation. Browser-origin clients and clients requiring OAuth discovery are not supported by this version.

## Tools

| Tool | Purpose |
| --- | --- |
| `list_builders` | List the sixteen schema-driven builders; chain generation is a separate tool. |
| `get_builder` | Read a builder's fields, defaults, sections, and sentinel values. |
| `list_presets` | Read the builder's built-in presets. |
| `generate_prompt` | Generate nested JSON, matching plain text, and an importable template-library payload. |
| `build_chain` | Validate and generate sequential chain instructions. |

Example arguments for `generate_prompt`:

```json
{
  "type": "llm",
  "preset": "Code Review",
  "data": {
    "task.instruction": "Review my pull request for correctness and maintainability.",
    "role.tone": "professional"
  }
}
```

Precedence is defaults, then preset, then `data`. Set `useDefaults: false` to omit defaults. Data uses flat dot-path keys, as shown above; nested JSON can be imported through the browser UI. Unknown builders/fields, wrong value types, and prototype-related paths are rejected. Legacy `user_intent` and internal `_industries_selected` fields remain accepted. String option values are preserved for compatibility with older templates; this is not a model-specific API validator. When a target-model field is set (for example `meta.target_model: 'midjourney_v8_2'`), the result gains a `model_guidance` object with prompting notes, compatibility warnings and native syntax; `get_builder` returns the available profiles under `modelProfiles`. Hidden conditional fields are omitted. Empty strings skip fields, `none` remains explicit, and `ask_me`/`best_fit` become readable instructions.

To bring an agent-generated prompt into the browser, save the returned `templateLibrary` object as a JSON file, then choose **Import templates** on the home screen. Alternatively, paste the returned `json` into **Import JSON** in the matching builder. Existing browser templates are not automatically synchronized with agents or other browser origins.

Chains use positive integer IDs and unique output labels. An input references `manual` or an earlier step's ID. They describe a workflow for an agent to follow; no step is executed by this service. A chain is limited to 100 steps.

## Design references

The implementation uses the official [MCP SDK server transports](https://ts.sdk.modelcontextprotocol.io/server) and [transport specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports). SDK and Zod versions are pinned in `package.json` and the lockfile.
