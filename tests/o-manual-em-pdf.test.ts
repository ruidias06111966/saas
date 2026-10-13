import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// O PDF NÃO PODE CONTAR OUTRA HISTÓRIA
//
// O dono pediu o manual em PDF, para as pessoas baixarem. O pedido é bom; o
// perigo é conhecido: um PDF escrito à parte seria uma SEGUNDA cópia do
// manual, e duas cópias divergem.
//
// NÃO É HIPÓTESE. Em outubro de 2026 o manual afirmou "o lado não muda"
// durante dias depois de o lado ter passado a mudar — com UMA cópia só. Com
// duas, a que fica errada é a pior das duas: a que a pessoa baixou está no
// telefone dela para sempre, e nenhuma publicação do site a corrige.
//
// POR ISSO O PDF NÃO É ESCRITO: É IMPRESSO.
//
// `scripts/gerar-manual-pdf.mjs` abre a própria `public/manual.html` num
// navegador e manda imprimir, usando a folha `media="print"` que vive dentro
// do manual. O conteúdo é o mesmo porque é o MESMO ficheiro.
//
// E QUEM GARANTE QUE ALGUÉM CORREU O SCRIPT?
//
// Estes testes. `scripts/manual.pdf.sha256` guarda a impressão digital do
// manual no momento em que o PDF nasceu; aqui ela é recalculada. Mudou o
// manual e não se refez o PDF — o teste cai, e como `npm run build` corre os
// testes ANTES de construir, não chega a ser publicado.
//
// Para refazer:  node scripts/gerar-manual-pdf.mjs
// ---------------------------------------------------------------------------

const MANUAL = 'public/manual.html';
const PDF = 'public/manual.pdf';
const SELO = 'scripts/manual.pdf.sha256';

const ler = (caminho: string): string => readFileSync(caminho, 'utf8');

describe('o manual em PDF', () => {
  it('existe, é um PDF de verdade, e não está vazio', () => {
    const bytes = readFileSync(PDF);
    expect(bytes.subarray(0, 5).toString('latin1'), 'não começa por %PDF — não é um PDF')
      .toBe('%PDF-');
    // Um manual de 35 seções não cabe em 20 KB. Se encolheu assim, alguma coisa
    // falhou na geração e ninguém reparou.
    expect(bytes.length, 'o PDF ficou pequeno demais para ser o manual inteiro')
      .toBeGreaterThan(40_000);
    // E não pode inchar sem ninguém ver: 5 MB num telefone com dados móveis é
    // um download que a pessoa cancela.
    expect(bytes.length, 'o PDF passou de 5 MB — pesado demais para baixar no celular')
      .toBeLessThan(5_000_000);
  });

  // O TESTE QUE IMPORTA, e a razão de este ficheiro existir.
  it('foi gerado a partir do manual que está no código AGORA', () => {
    const selo = ler(SELO);
    const guardada = selo.trim().split(/\s+/)[0];
    expect(guardada, 'o selo não tem uma impressão digital').toMatch(/^[0-9a-f]{64}$/);

    const agora = createHash('sha256').update(readFileSync(MANUAL)).digest('hex');
    expect(
      agora,
      'O MANUAL MUDOU E O PDF NÃO FOI REFEITO.\n'
      + 'Quem baixar o PDF vai ler a versão antiga.\n'
      + 'Corra:  node scripts/gerar-manual-pdf.mjs',
    ).toBe(guardada);
  });

  // AQUI HAVIA UM TERCEIRO TESTE, E FOI REMOVIDO. VALE SABER PORQUÊ.
  //
  // Ele comparava as DATAS dos ficheiros: o manual.pdf não podia ser mais
  // antigo que o manual.html. A ideia era apanhar quem editasse o selo à mão
  // para calar o teste de cima.
  //
  // Deu falso alarme no primeiro dia. Correr as regressões forçadas reescreve
  // ficheiros com o MESMO conteúdo, e isso basta para a data do manual passar
  // à frente da do PDF — e o teste acusava uma divergência que não existia. O
  // mesmo acontece num `git checkout`, ao trocar de ramo, ou ao gravar um
  // ficheiro sem lhe mudar nada.
  //
  // E, olhando com cuidado, ele também não guardava o que prometia: quem
  // soubesse forjar o selo (calcular o sha256 certo do manual) desfazia a
  // data com um `touch`. Protegia contra um descuido que a impressão digital
  // já apanha, e contra má-fé não protegia nada.
  //
  // O que fica é a impressão digital, e ela basta: se ela bate, o PDF foi
  // impresso de um manual com exactamente este conteúdo. Um teste que grita
  // quando não há problema ensina a ignorar os testes.
});

describe('a folha de impressão, que é quem decide como o PDF sai', () => {
  const manual = ler(MANUAL);

  it('existe, e é ela que o gerador usa', () => {
    expect(manual, 'a folha de impressão sumiu — o PDF sairia com a aparência da tela')
      .toContain('<style media="print">');
    expect(ler('scripts/gerar-manual-pdf.mjs'), 'o gerador deixou de imprimir pela folha de impressão')
      .toContain("media: 'print'");
  });

  // A REGRESSÃO QUE SÓ APARECERIA NO PDF DE QUEM USA TEMA ESCURO: sem cor
  // fixa, quem gerasse o PDF com o sistema no escuro produziria um documento
  // de fundo preto — ilegível impresso, e um gasto de tinta.
  it('força o tema claro, inclusive por cima do tema escuro', () => {
    const i = manual.indexOf('<style media="print">');
    const folha = manual.slice(i, manual.indexOf('</style>', i));
    expect(folha.length, 'recorte da folha de impressão largo demais').toBeLessThan(4000);
    expect(folha.length, 'recorte da folha de impressão curto demais').toBeGreaterThan(300);

    expect(folha, 'a folha de impressão deixou de vencer o tema escuro')
      .toContain(':root[data-theme="dark"]');
    expect(folha).toContain(':root:not([data-theme="light"])');
    expect(folha, 'o fundo do papel deixou de ser branco').toContain('background:#fff');
    expect(ler('scripts/gerar-manual-pdf.mjs'), 'o gerador deixou de pedir o esquema claro')
      .toContain("colorScheme: 'light'");
  });

  it('não parte cartões, tabelas nem passos ao meio entre duas páginas', () => {
    const i = manual.indexOf('<style media="print">');
    const folha = manual.slice(i, manual.indexOf('</style>', i));
    expect(folha).toContain('break-inside:avoid');
    for (const peca of ['.cartao', '.nota', '.perigo', '.chave', 'ol.passos>li', 'table']) {
      expect(folha, `${peca} pode voltar a ser cortado ao meio`).toContain(peca);
    }
  });

  it('esconde o botão de baixar — num papel ele não serve para nada', () => {
    const i = manual.indexOf('<style media="print">');
    const folha = manual.slice(i, manual.indexOf('</style>', i));
    expect(folha).toContain('.baixar{display:none}');
  });
});

describe('o caminho até o PDF', () => {
  it('o manual oferece o download, com nome de arquivo decente', () => {
    const manual = ler(MANUAL);
    expect(manual, 'o botão de baixar sumiu do manual').toContain('class="baixar"');
    expect(manual).toContain('href="/manual.pdf"');
    // Sem isto o arquivo chega ao telefone chamado "manual.pdf", entre outros
    // vinte "manual.pdf" que a pessoa já baixou na vida.
    expect(manual, 'o arquivo baixado ficaria com um nome genérico')
      .toContain('download="QICONEXAO-manual-de-utilizacao.pdf"');
  });

  it('o endereço do PDF está nas constantes, e não espalhado pelas telas', () => {
    expect(ler('constants.ts')).toContain("URL_MANUAL_PDF = '/manual.pdf'");
  });
});
