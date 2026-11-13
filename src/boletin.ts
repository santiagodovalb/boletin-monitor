// Scraping for boletinoficial.gob.ar (Primera sección: laws, decrees, resolutions).
// ponytail: regex over server-rendered markup, no HTML parser dependency. If the site
// changes its markup, parseSection's test fails first; switch to a DOM parser then.

export const BASE = 'https://www.boletinoficial.gob.ar';

export type Aviso = {
  id: string;
  rubro: string; // e.g. DECRETOS, RESOLUCIONES
  organismo: string;
  norma: string; // e.g. "Decreto 1352/2026"
  sumario: string;
  url: string;
};

const clean = (s: string) => decode(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

export function parseSection(html: string): Aviso[] {
  const avisos: Aviso[] = [];
  let rubro = '';
  const re = /<h5 class="seccion-rubro[^"]*">([\s\S]*?)<\/h5>|<a href="(\/detalleAviso\/primera\/(\d+)\/\d{8})"[^>]*>([\s\S]*?)<\/a>/g;
  for (const m of html.matchAll(re)) {
    if (m[1] !== undefined) {
      rubro = clean(m[1]);
      continue;
    }
    const body = m[4];
    const organismo = clean(body.match(/<p class="item">([\s\S]*?)<\/p>/)?.[1] ?? '');
    const [norma = '', sumario = ''] = [...body.matchAll(/<p class="item-detalle"[^>]*>([\s\S]*?)<\/p>/g)].map((d) => clean(d[1]));
    avisos.push({ id: m[3], rubro, organismo, norma, sumario, url: BASE + m[2] });
  }
  return avisos;
}

/** Plain text of a notice's body (#cuerpoDetalleAviso), paragraphs on separate lines. */
export function parseBody(html: string): string {
  const start = html.indexOf('id="cuerpoDetalleAviso"');
  if (start < 0) return '';
  // The body ends where the publication-date footer row begins.
  const end = html.indexOf('Fecha de publicación', start);
  const chunk = html
    .slice(html.indexOf('>', start) + 1, end < 0 ? undefined : end)
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<\/(p|tr|h\d|li)>|<br\s*\/?>/g, '\n')
    .replace(/<\/td>/g, ' | ');
  return decode(chunk.replace(/<[^>]+>/g, ''))
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decode(s: string): string {
  return s.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (all, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
    return ENTITIES[e.toLowerCase()] ?? all;
  });
}

async function get(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': 'boletin-monitor (civic research)' } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

/** date: YYYY-MM-DD */
export async function fetchSection(date: string): Promise<Aviso[]> {
  return parseSection(await get(`${BASE}/seccion/primera/${date.replaceAll('-', '')}`));
}

export async function fetchBody(aviso: Aviso): Promise<string> {
  return parseBody(await get(aviso.url));
}
