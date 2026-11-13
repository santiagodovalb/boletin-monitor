# Boletín Oficial monitor

Daily digest of the Primera sección of Argentina's [Boletín Oficial](https://www.boletinoficial.gob.ar): every law, decree and resolution, summarized in plain Spanish and sorted by relevance with Claude.

```bash
npm install
export ANTHROPIC_API_KEY=...          # from console.anthropic.com
npm run monitor -- 2026-11-12 3       # trial: only the first 3 notices
npm run monitor                       # today, everything
npm test                              # scraper parsing check
```

Output: `digests/YYYY-MM-DD.md`. Scraped texts and summaries are cached in `data/` (gitignored), so re-running a date only pays for notices that are still missing.

## How it works

1. `src/boletin.ts` scrapes the day's section page and each notice's full text.
2. `src/monitor.ts` sends each notice to Claude with a fixed schema: topic, type of measure, summary, who is affected, relevance (alta / media / baja) and why.
3. Notices are grouped by relevance into a Markdown digest that links each one to the official text.

## Cost

A typical day is around 40 notices and roughly 80–100k input tokens. With `claude-haiku-5-5` (the default) that's a few cents per day. For better summaries, change `MODEL` in `src/monitor.ts` to `claude-opus-5-5`, about $1–2 per day; with Opus, add server-side fallbacks (`betas: ['server-side-fallback-2026-07-01']`, `fallbacks: 'default'`) so refused requests are retried on another model.

You need an API key from the Claude Console, billed separately from any Claude.ai subscription.

## Limits

- Summaries are AI-generated. The digest says so and links every item to the official text.
- Only the Primera sección (not companies, contracts or judicial notices).
- The "relevance" criteria are in the system prompt in `src/monitor.ts`. They are a political judgment in themselves, so make them yours.
