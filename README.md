# Universal Prompt Studio

A browser-based prompt engineering tool for building structured prompts for AI image generators, video generators, and LLMs.

**Zero dependencies. No build step. Just open the HTML file.**

![HTML5](https://img.shields.io/badge/HTML5-Single_File-orange) ![React](https://img.shields.io/badge/React-18-blue) ![Tailwind](https://img.shields.io/badge/Tailwind_CSS-3-38bdf8) ![License](https://img.shields.io/badge/License-MIT-green)

## What It Does

Universal Prompt Studio provides a guided, form-based interface for constructing detailed prompts across three modes:

- **Image Prompt Builder** — For Gemini, Flux, Midjourney, DALL-E, Stable Diffusion. Covers subject, scene, camera settings, lighting, composition, style, text rendering, and advanced parameters like samplers and ControlNet hints.
- **Video Prompt Builder** — For Veo 3, Sora, Runway, Kling, Hailuo. Extends image prompts with motion, audio, duration, and transition controls.
- **LLM Prompt Builder** — For ChatGPT, Claude, Gemini, Llama. Covers role/persona, task definition, context, output format, behavior frameworks (ROSES, CO-STAR, PTCF, etc.), memory, citation, iteration, and safety guardrails. Includes an industry skills picker with 25+ domains.
- **Chain Builder** — Build multi-step prompt pipelines where each step's output feeds the next. Add translate steps to push to 23+ platform targets (Canva, Figma, GitHub, Vercel, n8n, etc.).

## Quick Start

1. Download or clone this repo
2. Open `universal-prompt-studio-v11.html` in any modern browser
3. Pick a mode and start building

That's it. Everything runs client-side in your browser.

## Features

| Feature | Description |
|---------|-------------|
| Schema-driven forms | All UI generated dynamically from schema definitions |
| Presets | One-click presets (Cinematic Portrait, Cyberpunk Scene, Code Review, etc.) |
| Templates | Save, load, and manage custom templates via localStorage |
| Import / Export | JSON import/export for sharing prompts |
| Output modes | Generate JSON or plain text output |
| Chain Builder | Multi-step sequential pipelines with output chaining |
| Medium aesthetics | 10 artistic mediums with curated aesthetic keyword sets |
| Industry skills | 25+ industry domains with top-10 skill arrays for LLM personas |

## Tech Stack

- **React 18** (CDN)
- **Tailwind CSS 3** (CDN)
- **Babel Standalone** (in-browser JSX compilation)
- **localStorage** for persistence

No npm, no webpack, no node_modules. The entire app is a single self-contained HTML file.

## Browser Support

Any modern browser — Chrome, Edge, Firefox, Safari (desktop and mobile).

## License

MIT
