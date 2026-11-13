// Run: npm test. Markup trimmed from the real site (Primera sección, 12/11/2026).
import assert from 'node:assert/strict';
import { parseBody, parseSection } from './boletin.ts';

const section = `
<h5 class="seccion-rubro text-white bg-first-section">DECRETOS   </h5>
<a href="/detalleAviso/primera/350229/20261112" onclick="sendDetalleEvent('Visto');">
  <div class="linea-aviso">
    <p class="item">MINISTERIO DE SEGURIDAD NACIONAL </p>
    <p class="item-detalle"><small>Decreto 1352/2026</small></p>
    <p class="item-detalle" ><small>DECTO-2026-1352-APN-PTE - Des&iacute;gnase Subsecretario.</small></p>
  </div>
</a>
<h5 class="seccion-rubro text-white bg-first-section">RESOLUCIONES</h5>
<a href="/detalleAviso/primera/350240/20261112"><div class="linea-aviso">
  <p class="item">ENTE NACIONAL REGULADOR DEL GAS</p>
  <p class="item-detalle"><small>Resolución 88/2026</small></p>
  <p class="item-detalle"><small>RESOL-2026-88 &amp; anexo</small></p>
</div></a>`;

const avisos = parseSection(section);
assert.equal(avisos.length, 2);
assert.deepEqual(avisos[0], {
  id: '350229',
  rubro: 'DECRETOS',
  organismo: 'MINISTERIO DE SEGURIDAD NACIONAL',
  norma: 'Decreto 1352/2026',
  sumario: 'DECTO-2026-1352-APN-PTE - Des&iacute;gnase Subsecretario.', // named accents aren't decoded: the site sends UTF-8
  url: 'https://www.boletinoficial.gob.ar/detalleAviso/primera/350229/20261112',
});
assert.equal(avisos[1].rubro, 'RESOLUCIONES');
assert.equal(avisos[1].sumario, 'RESOL-2026-88 & anexo');

const detail = `<div id="cuerpoDetalleAviso" class="detalle-cuerpo"><p><style>td {border: 1px}</style><p>Ciudad de Buenos Aires, 11/11/2026</p>
<p>ARTÍCULO 1°.-&nbsp;Desígnase al doctor X.</p><table><tr><td>Cargo</td><td>Nivel A</td></tr></table></p></div>
<p class="text-muted"><small>Fecha de publicación 12/11/2026</small></p>`;
assert.equal(parseBody(detail), 'Ciudad de Buenos Aires, 11/11/2026\nARTÍCULO 1°.- Desígnase al doctor X.\nCargo | Nivel A |');
assert.equal(parseBody('<html>no body</html>'), '');

console.log('boletin ok');
