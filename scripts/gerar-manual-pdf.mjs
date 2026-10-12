// ---------------------------------------------------------------------------
// GERA public/manual.pdf A PARTIR DE public/manual.html
//
// POR QUE UM SCRIPT, E NÃO UM DOCUMENTO ESCRITO À MÃO
//
// Um PDF escrito à parte é uma SEGUNDA cópia do manual, e duas cópias
// divergem. Em outubro de 2026 o manual já afirmou "o lado não muda" durante
// dias depois de o lado ter passado a mudar — uma cópia só, e já mentiu. Duas
// mentiriam em dobro, e a que a pessoa baixou é a que fica no telefone dela
// para sempre.
//
// Então o PDF é a MESMA página, impressa por um navegador com a folha
// `media="print"` que vive dentro do manual.html. Mudou o manual? O PDF muda
// junto, assim que este script correr.
//
// E SE NINGUÉM CORRER O SCRIPT?
//
// É a pergunta que importa, e a resposta não é confiança: é
// `scripts/manual.pdf.sha256`, que guarda a impressão digital do manual.html no
// momento em que o PDF foi gerado. O teste `tests/o-manual-em-pdf.test.ts`
// recalcula essa impressão e CAI se elas não baterem. Como `npm run build`
// corre os testes antes de construir, um manual alterado sem o PDF refeito não
// chega a ser publicado.
//
// POR QUE O PLAYWRIGHT NÃO É DEPENDÊNCIA DO PROJETO
//
// Ele traz um navegador inteiro (centenas de megabytes). Pôr isso no
// `package.json` tornaria mais lenta e mais frágil toda instalação e toda
// construção do sistema, para uma tarefa que corre quando o manual muda — umas
// poucas vezes por ano. Então o script pede o Playwright só quando é chamado, e
// explica como instalá-lo se não o achar.
//
// COMO CORRER
//
//   node scripts/gerar-manual-pdf.mjs
//
// Se faltar o navegador:  npx playwright install chromium
// ---------------------------------------------------------------------------
import { createHash } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

const RAIZ = resolve(import.meta.dirname, '..');
const PUBLICO = join(RAIZ, 'public');
const HTML = join(PUBLICO, 'manual.html');
const PDF = join(PUBLICO, 'manual.pdf');
// O selo fica FORA de `public/`: `public/` é publicado tal e qual, e o selo é
// papelada de construção — ninguém que use o site tem o que fazer com ele.
const SELO = join(import.meta.dirname, 'manual.pdf.sha256');

/**
 * O manual é servido por um servidor de verdade, e não aberto como `file://`.
 * Motivo: ele referencia `/icones/favicon.ico` e links que começam por `/`.
 * Em `file://` esses caminhos apontam para a raiz do disco, e o navegador
 * passa segundos a tentar buscá-los antes de desistir.
 */
function servir(pasta) {
  const tipos = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
    '.ico': 'image/x-icon', '.png': 'image/png', '.svg': 'image/svg+xml',
    '.webmanifest': 'application/manifest+json', '.pdf': 'application/pdf',
  };
  const servidor = createServer(async (pedido, resposta) => {
    const caminho = decodeURIComponent(new URL(pedido.url, 'http://x').pathname);
    try {
      const conteudo = await readFile(join(pasta, caminho === '/' ? 'index.html' : caminho));
      resposta.writeHead(200, { 'content-type': tipos[extname(caminho)] ?? 'application/octet-stream' });
      resposta.end(conteudo);
    } catch {
      resposta.writeHead(404).end('nao encontrado');
    }
  });
  return new Promise((ok) => servidor.listen(0, '127.0.0.1', () => ok(servidor)));
}

async function abrirNavegador() {
  try {
    return (await import('playwright')).chromium;
  } catch {
    console.error(
      'Falta o Playwright, que é quem imprime a página.\n' +
      '  npm i -D playwright && npx playwright install chromium\n' +
      'Ele NÃO é dependência do projeto de propósito: traz um navegador inteiro.\n' +
      'Já tem um Chromium no disco? Aponte para ele:\n' +
      '  CAMINHO_DO_CHROMIUM=/caminho/para/chrome node scripts/gerar-manual-pdf.mjs',
    );
    process.exit(1);
  }
}

/**
 * Onde está o navegador.
 *
 * O normal é o Playwright achá-lo sozinho, e então não devolvemos nada. Mas a
 * versão instalada do Playwright e a versão do navegador no disco podem não
 * casar — numa máquina onde o navegador vem de fora (uma imagem de CI, um
 * contentor), o Playwright procura a build que ELE espera e não a que existe:
 *
 *   Executable doesn't exist at …/chromium_headless_shell-1243/…
 *
 * Em vez de mandar "npx playwright install" baixar outro navegador inteiro,
 * aproveitamos o que já está lá. `CAMINHO_DO_CHROMIUM` manda em tudo; depois,
 * procuramos qualquer `chromium-*` dentro de PLAYWRIGHT_BROWSERS_PATH.
 */
function acharNavegador() {
  const pedido = process.env.CAMINHO_DO_CHROMIUM;
  if (pedido) return pedido;

  const pasta = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!pasta || !existsSync(pasta)) return undefined;

  for (const nome of readdirSync(pasta).filter((n) => n.startsWith('chromium-')).sort().reverse()) {
    for (const dentro of ['chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
      const tentativa = join(pasta, nome, dentro);
      if (existsSync(tentativa)) return tentativa;
    }
  }
  return undefined;
}

const chromium = await abrirNavegador();
const servidor = await servir(PUBLICO);
const { port } = servidor.address();

const executablePath = acharNavegador();
if (executablePath) console.log(`navegador: ${executablePath}`);
const navegador = await chromium.launch(executablePath ? { executablePath } : {});
try {
  const pagina = await navegador.newPage();
  // Tema claro à força: quem gerar o PDF num sistema em tema escuro produziria
  // um documento de fundo preto. A folha de impressão também o fixa, mas pedir
  // o esquema claro ao navegador evita um piscar e qualquer regra que escape.
  await pagina.emulateMedia({ colorScheme: 'light', media: 'print' });
  await pagina.goto(`http://127.0.0.1:${port}/manual.html`, { waitUntil: 'load' });

  const titulo = await pagina.title();
  await pagina.pdf({
    path: PDF,
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate:
      '<div style="width:100%;font:8pt ui-sans-serif,system-ui,Arial;color:#78716c;' +
      'padding:0 14mm;display:flex;justify-content:space-between">' +
      '<span>QICONEXÃO · Manual de Utilização</span>' +
      '<span>página <span class="pageNumber"></span> de <span class="totalPages"></span></span>' +
      '</div>',
    margin: { top: '16mm', bottom: '18mm', left: '14mm', right: '14mm' },
  });
  console.log(`gerado: public/manual.pdf  (de "${titulo}")`);
} finally {
  await navegador.close();
  servidor.close();
}

// O selo: a impressão digital do manual no momento em que este PDF nasceu.
const fonte = await readFile(HTML);
const digital = createHash('sha256').update(fonte).digest('hex');
await writeFile(
  SELO,
  `${digital}  manual.html\n`
  + '\n'
  + '# Impressão digital do manual.html no momento em que o manual.pdf foi gerado.\n'
  + '# Se o manual mudar e o PDF não for refeito, tests/o-manual-em-pdf.test.ts cai\n'
  + '# e `npm run build` para — que é o ponto.\n'
  + '#\n'
  + '# Para refazer:  node scripts/gerar-manual-pdf.mjs\n',
);
console.log(`selo: ${digital.slice(0, 16)}…`);
