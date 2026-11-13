// Daily Boletín Oficial digest: scrape the Primera sección, summarize each notice with Claude,
// write digests/YYYY-MM-DD.md.
//
//   npm run monitor                     today (Buenos Aires time)
//   npm run monitor -- 2026-11-12       a given date
//   npm run monitor -- 2026-11-12 3     only the first 3 notices (cheap trial)
//
// Scraped text and summaries are cached in data/, so re-runs only pay for what's missing.
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import { fetchBody, fetchSection, type Aviso } from './boletin.ts';

const MODEL = 'claude-haiku-5-5'; // ponytail: cents per day; claude-opus-5-5 (~$1–2/day) if summaries fall short
const CONCURRENCY = 4;

const Summary = z.object({
  tema: z.enum([
    'Economía y finanzas',
    'Impuestos',
    'Trabajo y seguridad social',
    'Salud',
    'Educación',
    'Seguridad y defensa',
    'Justicia',
    'Ambiente y energía',
    'Transporte e infraestructura',
    'Agro',
    'Comercio e industria',
    'Organización del Estado',
    'Designaciones y personal',
    'Otros',
  ]),
  tipo: z.enum([
    'Designación o renuncia',
    'Nueva regulación',
    'Modificación de regulación',
    'Derogación',
    'Presupuesto o fondos',
    'Sanción',
    'Licitación o contrato',
    'Trámite administrativo',
    'Otro',
  ]),
  resumen: z.string().describe('1 or 2 sentences in plain Spanish: what changes and from when.'),
  afecta_a: z.string().describe('Who is affected, concretely (e.g. "monotributistas", "importadores de autos", "personal de la ANSES").'),
  relevancia: z.enum(['alta', 'media', 'baja']),
  por_que: z.string().describe('One short sentence justifying the relevance level.'),
});
type Summary = z.infer<typeof Summary>;
type Entry = Aviso & { texto: string; summary?: Summary; error?: string };

const SYSTEM = `You summarize notices from Argentina's Boletín Oficial (Primera sección) for citizens and researchers.
Write in plain Rioplatense Spanish, without legal jargon. Describe what the norm does; never give opinions or political judgments.
Relevance:
- alta: changes rights, obligations, taxes or prices for a broad population; large budget moves; structural policy changes; DNUs.
- media: sectoral regulation that matters to a specific industry, profession or region.
- baja: routine appointments, resignations, internal administrative procedures, minor extensions.
If the text is cut off or unclear, say so in the summary instead of guessing.`;

const client = new Anthropic();

async function summarize(e: Entry): Promise<Summary> {
  const res = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: 'medium', format: betaZodOutputFormat(Summary) },
    system: SYSTEM,
    messages: [{ role: 'user', content: `${e.rubro} · ${e.organismo} · ${e.norma}\n${e.sumario}\n\n${e.texto}` }],
  });
  if (res.stop_reason === 'refusal') throw new Error(`refused (${res.stop_details?.category ?? 'no category'})`);
  if (!res.parsed_output) throw new Error(`no parsed output (stop_reason: ${res.stop_reason})`);
  return res.parsed_output;
}

const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' });
const [date = today(), limitArg] = process.argv.slice(2);
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Date must be YYYY-MM-DD, got "${date}"`);

const cacheFile = `data/${date}.json`;
mkdirSync('data', { recursive: true });
const cached: Entry[] = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : [];
const save = (entries: Entry[]) => writeFileSync(cacheFile, JSON.stringify(entries, null, 1));

// 1. Scrape (once per date).
let entries = cached;
if (!entries.length) {
  const avisos = await fetchSection(date);
  if (!avisos.length) {
    console.log(`No notices for ${date} (weekend, holiday, or not published yet).`);
    process.exit(0);
  }
  console.log(`${avisos.length} notices. Fetching texts…`);
  entries = [];
  for (const a of avisos) {
    entries.push({ ...a, texto: await fetchBody(a) });
    await new Promise((r) => setTimeout(r, 250)); // be polite to the site
  }
  save(entries);
}

// 2. Summarize what's missing.
const limit = limitArg ? Number(limitArg) : entries.length;
const todo = entries.slice(0, limit).filter((e) => !e.summary);
console.log(`Summarizing ${todo.length} notices with ${MODEL}…`);
let next = 0;
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (next < todo.length) {
      const e = todo[next++];
      try {
        e.summary = await summarize(e);
        delete e.error;
      } catch (err) {
        e.error = err instanceof Error ? err.message : String(err);
        console.error(`  ${e.norma}: ${e.error}`);
      }
      save(entries); // keep progress if the run dies halfway
    }
  }),
);

// 3. Digest.
const done = entries.filter((e) => e.summary);
const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const item = (e: Entry) =>
  `### ${e.norma} · ${e.organismo}\n\n${e.summary!.resumen}\n\n**Afecta a:** ${e.summary!.afecta_a}. **Tema:** ${e.summary!.tema} · ${e.summary!.tipo}.\n_${e.summary!.por_que}_ [Ver texto oficial](${e.url})\n`;
const by = (r: Summary['relevancia']) => done.filter((e) => e.summary!.relevancia === r);
const lines = [
  `# Boletín Oficial, ${fmt(date)}`,
  '',
  `${entries.length} normas en la Primera sección; ${done.length} resumidas. Resúmenes generados por IA (${MODEL}): verificá siempre con el texto oficial.`,
  '',
  '## Lo más relevante',
  '',
  ...(by('alta').length ? by('alta').map(item) : [done.length ? 'Nada de relevancia alta hoy.' : 'Todavía no hay resúmenes.', '']),
  '## Relevancia media',
  '',
  ...by('media').map(item),
  '## De rutina',
  '',
  ...by('baja').map((e) => `- **${e.norma}** (${e.organismo}): ${e.summary!.resumen} [Ver](${e.url})`),
  '',
];
const failed = entries.filter((e) => e.error);
if (failed.length) lines.push('## Sin resumir', '', ...failed.map((e) => `- [${e.norma}](${e.url}): ${e.error}`), '');

mkdirSync('digests', { recursive: true });
writeFileSync(`digests/${date}.md`, lines.join('\n'));
// Same digest as JSON for the web viewer (index.html), minus the full texts.
writeFileSync(`digests/${date}.json`, JSON.stringify({ date, model: MODEL, entries: entries.map(({ texto, ...e }) => e) }, null, 1));
const dates = readdirSync('digests').filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 10)).sort().reverse();
writeFileSync('digests/index.json', JSON.stringify(dates));
console.log(`Wrote digests/${date}.md (${done.length}/${entries.length} summarized${failed.length ? `, ${failed.length} failed` : ''}).`);
