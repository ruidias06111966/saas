import { readFileSync, readdirSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// NADA EXPORTADO FICA SEM QUEM O CHAME
//
// POR QUE ESTE TESTE EXISTE
//
// Em 17/10/2026 descobriu-se que `contatoDoNegocio` — a única porta do
// navegador até o telefone do outro lado, que é a promessa central do produto
// e um item VENDIDO no plano pago — existia, estava correcta, e NINGUÉM a
// chamava. O sistema prometia o telefone em quatro telas e não o mostrava em
// nenhuma.
//
// Não houve erro. O compilador não reclama de uma função exportada que ninguém
// usa: exportar é justamente dizer "alguém de fora pode precisar disto". E
// nenhum teste reclamava, porque não havia o que falhasse.
//
// Encontrou-se a contar: `contatoDoNegocio` aparecia UMA vez em todo o
// projecto, na linha onde é declarada. Este teste faz essa contagem sempre.
//
// A REGRA, E POR QUE ELA É ESTA
//
// Toda coisa exportada tem de ser usada FORA do ficheiro que a declara. Se só
// é usada por dentro, não devia estar exportada — e aí a saída é tirar o
// `export`, não acrescentar uma excepção. As duas metades importam:
//
//   · exportado e sem ninguém a usar  → ou está por ligar (o defeito acima),
//                                       ou é código morto a pedir remoção;
//   · exportado e usado só por dentro → a porta está aberta sem necessidade,
//                                       e esconde a primeira metade no meio.
//
// O QUE ELE NÃO OLHA, E PORQUÊ
//
// `type` e `interface` ficam de fora. Um tipo exportado é muitas vezes usado
// só na declaração de outro tipo do mesmo ficheiro, e cobrá-lo daria barulho
// sem defeito por baixo. O que custou caro foram funções e constantes.
// ---------------------------------------------------------------------------

/**
 * Onde se DECLARA — e, logo abaixo, onde se PROCURA quem usa. São conjuntos
 * diferentes de propósito, e a diferença já me enganou uma vez.
 *
 * A primeira versão deste teste procurava só nestas pastas, e acusou treze
 * coisas que estavam perfeitamente ligadas: umas são chamadas pelo `index.tsx`
 * — o arranque do app, que eu tinha esquecido — e outras só por testes.
 *
 * É a mesma armadilha de sempre nesta base: a procura acerta no sítio errado.
 * A correcção é olhar para TUDO ao procurar quem usa, `index.tsx` e `tests/`
 * incluídos. Exportar algo só para um teste lhe chegar é legítimo; o que não é
 * legítimo é não haver ninguém, nem teste.
 */
const PASTAS = ['services', 'screens', 'components', 'state', 'data'];
const SOLTOS = ['App.tsx', 'constants.ts', 'types.ts', 'index.tsx'];

/**
 * Excepções, nomeadas uma a uma e justificadas.
 *
 * A lista está vazia, e isso é de propósito: a saída normal para um aviso
 * deste teste é LIGAR o que ficou por ligar, APAGAR o que morreu, ou tirar o
 * `export`. Acrescentar um nome aqui é a terceira escolha, e precisa de uma
 * razão escrita ao lado.
 */
const PERDOADOS: string[] = [];

// Esteve aqui `services/geminiService.ts:moderateWithAI` — a camada 2 da
// moderação, que o ficheiro da moderação dizia existir e ninguém chamava. Este
// teste encontrou-a em 17/10/2026; o dono mandou ligá-la, e foi ligada. A
// lista voltou a ficar vazia, que é onde ela deve estar.

/** Uma coisa exportada que SÓ um teste usa continua legítima — ver acima. */

function arquivos(dir: string): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(dir)) {
    const caminho = `${dir}/${nome}`;
    if (statSync(caminho).isDirectory()) saida.push(...arquivos(caminho));
    else if (/\.tsx?$/.test(caminho) && !/\.d\.ts$/.test(caminho)) saida.push(caminho);
  }
  return saida;
}

/** Onde se declara. */
const TODOS = [...PASTAS.flatMap(arquivos), ...SOLTOS];
/** Onde se procura quem usa: tudo o que está acima, MAIS os testes. */
const ONDE_PROCURAR = [...TODOS, ...arquivos('tests')];

const FONTE = new Map(TODOS.map((f) => [f, readFileSync(f, 'utf8')]));
const BUSCA = new Map(ONDE_PROCURAR.map((f) => [f, readFileSync(f, 'utf8')]));

/** `export const X`, `export function X`, `export async function X`, `export class X`. */
const DECLARA = /^export\s+(?:const|function|async function|class)\s+([A-Za-z_]\w*)/gm;

function exportadosDe(fonte: string): string[] {
  return [...fonte.matchAll(DECLARA)].map((m) => m[1]);
}

/**
 * Tira comentários. Sem isto o teste engana-se de uma maneira que eu só vi
 * medindo: `contatoDoNegocio` — a função que ESTE ficheiro cita no cabeçalho
 * como exemplo do defeito — contava como usada, porque falar dela é escrevê-la.
 * O guarda contra código morto mantinha vivo, sozinho, aquilo que procurava.
 */
const semComentarios = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

const BUSCA_LIMPA = new Map([...BUSCA].map(([f, t]) => [f, semComentarios(t)]));

/** Vezes que `nome` aparece em código, em todo o lado menos onde é declarado. */
function usosFora(nome: string, dono: string): number {
  const re = new RegExp(`\\b${nome}\\b`, 'g');
  let n = 0;
  for (const [caminho, fonte] of BUSCA_LIMPA) {
    if (caminho === dono) continue;
    n += (fonte.match(re) ?? []).length;
  }
  return n;
}

describe('nada exportado fica sem quem o chame', () => {
  // A FERRAMENTA PRIMEIRO. Um varredor que não acha nada dá verde sobre tudo —
  // e verde sobre tudo foi exactamente o que o projecto teve enquanto o
  // telefone não aparecia.
  it('o varredor acha os ficheiros e lê as exportações', () => {
    expect(TODOS.length, 'não encontrou ficheiros de código').toBeGreaterThan(40);
    expect(FONTE.get('services/mercado.ts'), 'não leu um ficheiro conhecido').toBeTruthy();
    // As duas omissões que fizeram a primeira versão acusar inocentes.
    expect(TODOS, 'o arranque do app ficou de fora da varredura').toContain('index.tsx');
    expect(ONDE_PROCURAR.some((f) => f.startsWith('tests/')),
      'os testes ficaram de fora de onde se procura quem usa').toBe(true);

    const amostra = exportadosDe(
      'export const a = 1;\nexport function b() {}\nexport async function c() {}\n'
      + 'const d = 2;\nexport type E = string;\nexport interface F { x: number }',
    );
    expect(amostra, 'não leu as exportações certas, ou leu tipos a mais')
      .toEqual(['a', 'b', 'c']);
  });

  it('e o contador distingue quem é usado fora de quem não é', () => {
    // `publicarAnuncio` é chamado por telas; `COLUNAS_ANUNCIO` não existe fora.
    expect(usosFora('publicarAnuncio', 'services/mercado.ts'), 'não viu um uso real')
      .toBeGreaterThan(0);
    // E comentário não é uso: foi assim que este teste se enganou a si próprio,
    // duas vezes. A segunda foi esta asserção, que citava o nome REAL da função
    // e, por citá-lo em código (e não em comentário), o mantinha vivo sozinha.
    // Por isso o exemplo aqui é um nome inventado, que não existe em lado
    // nenhum do projecto.
    expect(semComentarios('// usa umaFuncaoDeExemplo\nconst a = 1;'), 'não tirou o comentário de linha')
      .not.toContain('umaFuncaoDeExemplo');
    expect(semComentarios('/* umaFuncaoDeExemplo */ const b = 2;'), 'não tirou o comentário de bloco')
      .not.toContain('umaFuncaoDeExemplo');
    expect(semComentarios('umaFuncaoDeExemplo();'), 'tirou código a sério')
      .toContain('umaFuncaoDeExemplo');
    // O nome é MONTADO aqui, e não escrito: agora que os testes também são
    // lidos, um nome escrito por extenso passaria a existir — no próprio
    // teste — e a prova dir-se-ia falsa sozinha. Aconteceu duas vezes: a
    // segunda porque o nome que eu tinha escolhido já estava escrito NOUTRO
    // teste meu, do mesmo dia. Com a hora lá dentro, não colide com nada.
    const inexistente = ['zzz', 'Simbolo', 'Improvavel', String(Date.now())].join('');
    expect(usosFora(inexistente, 'services/mercado.ts'), 'viu o que não há').toBe(0);
  });

  it('toda coisa exportada é usada fora do ficheiro que a declara', () => {
    const sozinhas: string[] = [];
    for (const [caminho, fonte] of FONTE) {
      for (const nome of exportadosDe(fonte)) {
        if (PERDOADOS.includes(`${caminho}:${nome}`)) continue;
        if (usosFora(nome, caminho) === 0) sozinhas.push(`${caminho} → ${nome}`);
      }
    }
    expect(
      sozinhas,
      'exportado e ninguém chama. Ou falta ligar à tela (foi o caso do telefone), '
      + 'ou é código morto, ou o `export` está a mais e deve sair',
    ).toEqual([]);
  });
});
