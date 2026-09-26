import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { POLICY_VERSION, PRECO_PREMIUM, QUOTAS } from '../constants';

// ---------------------------------------------------------------------------
// O pivô tem de chegar na casca, não só nas telas.
//
// O app virou mercado de serviços. As telas foram reescritas — a landing fala
// de contador, engenheiro e alvará. Mas TRÊS coisas ficaram para trás por
// semanas, e nenhuma delas aparece para quem abre o app:
//
//   • o `<title>`, a descrição e as tags Open Graph — o que o Google indexa e
//     o que aparece quando o link é colado no WhatsApp;
//   • o manifest — o nome que fica embaixo do ícone depois de instalar;
//   • a política do Storage — que ainda entregava a foto BORRADA de todo
//     profissional, porque o Véu do app de relacionamentos continuava valendo
//     no banco enquanto o cliente já pedia o original.
//
// A terceira passou despercebida por meses porque existia uma conta só no
// sistema: ninguém nunca tinha olhado o perfil de outra pessoa. E porque
// `resolveImage` desce nível a nível até algo passar — transformando "negado"
// em "achei uma versão pior", sem erro nenhum.
//
// Estes testes guardam a casca. Não substituem olhar o site: guardam contra a
// REGRESSÃO, que é o que ninguém percebe.
// ---------------------------------------------------------------------------

const RAIZ = new URL('..', import.meta.url).pathname;
const ler = (p: string) => readFileSync(join(RAIZ, p), 'utf8');

/** Vocabulário que denuncia o app de relacionamentos. */
const DE_NAMORO = [
  'conheça alguém',
  'escolher alguém',
  'antes da aparência',
  'a foto não abre a porta',
  'interesses, personalidade',
  'aplicativo de relacionamentos',
];

describe('a casca do site fala do produto que existe hoje', () => {
  const html = ler('index.html');
  const manifest = JSON.parse(ler('public/manifest.webmanifest'));

  it.each(DE_NAMORO)('o index.html não diz mais %s', (frase) => {
    expect(html.toLowerCase()).not.toContain(frase.toLowerCase());
  });

  it('o título e o og:title falam de trabalho', () => {
    const titulo = html.match(/<title>([^<]+)<\/title>/)?.[1] ?? '';
    const ogTitulo = html.match(/property="og:title" content="([^"]+)"/)?.[1] ?? '';
    expect(titulo).toMatch(/sabe fazer|trabalho|serviç|profissional/i);
    // As duas têm de contar a mesma história: quem vê no Google e quem vê no
    // WhatsApp não podem receber produtos diferentes.
    expect(ogTitulo).toBe(titulo);
  });

  it('a descrição e a og:description falam de trabalho', () => {
    for (const re of [
      /<meta name="description" content="([^"]+)"/,
      /property="og:description" content="([^"]+)"/,
    ]) {
      const texto = html.match(re)?.[1] ?? '';
      expect(texto.length, `descrição vazia em ${re}`).toBeGreaterThan(30);
      expect(texto).toMatch(/proposta|serviç|profissional|sabe fazer/i);
      for (const frase of DE_NAMORO) {
        expect(texto.toLowerCase()).not.toContain(frase.toLowerCase());
      }
    }
  });

  it('o nome no celular não é o do app de namoro', () => {
    for (const frase of DE_NAMORO) {
      expect(String(manifest.name).toLowerCase()).not.toContain(frase.toLowerCase());
      expect(String(manifest.description).toLowerCase()).not.toContain(frase.toLowerCase());
    }
    expect(manifest.categories).not.toContain('lifestyle');
  });

  it('o aviso de golpe do chat não cita app de relacionamento', () => {
    // É texto que a pessoa LÊ, num toast, ao tentar mandar mensagem de risco.
    const mod = ler('services/moderation.ts');
    expect(mod).not.toMatch(/apps? de relacionamento/i);
  });
});

describe('o véu saiu do banco, não só do cliente', () => {
  const migracoes = readdirSync(join(RAIZ, 'supabase/migrations'))
    .filter((f) => f.endsWith('.sql')).sort()
    .map((f) => ({ f, sql: readFileSync(join(RAIZ, 'supabase/migrations', f), 'utf8') }));

  it('existe a migração que troca a política da foto', () => {
    const m = migracoes.find((x) => /create policy "foto de perfil segue o crachá"/.test(x.sql));
    expect(m, 'nenhuma migração cria a política nova da foto').toBeDefined();
    expect(m!.sql).toMatch(/drop policy if exists "foto de perfil respeita o véu"/);
  });

  it('a foto usa a MESMA função do crachá, não uma parecida', () => {
    // Duas regras parecidas é como elas divergem — foi exatamente assim que a
    // foto e o crachá passaram a discordar.
    const m = migracoes.find((x) => /create policy "foto de perfil segue o crachá"/.test(x.sql))!;
    const politica = m.sql.slice(m.sql.indexOf('create policy "foto de perfil segue o crachá"'));
    expect(politica.slice(0, politica.indexOf(');'))).toContain('private.perfil_visivel');
  });

  it('nenhuma migração deixa o nível do véu decidindo alguma coisa', () => {
    const ultima = migracoes[migracoes.length - 1].sql + '\n';
    const todas = migracoes.map((m) => m.sql).join('\n');
    // Se alguém recriar as funções depois da 019, este teste cai.
    const recria = /create (or replace )?function private\.nivel_(permitido|do_arquivo)/.exec(
      todas.slice(todas.indexOf('drop function if exists private.nivel_permitido')),
    );
    expect(recria, 'as funções do véu foram recriadas depois de removidas').toBeNull();
    expect(ultima.length).toBeGreaterThan(0);
  });

  it('o cliente não volta a pedir um nível velado de terceiro', () => {
    const media = ler('services/media.ts');
    // `resolveImage` pode descer como rede de segurança, mas tem de COMEÇAR no
    // original. Começar por baixo entregaria a foto borrada de novo.
    const trecho = media.slice(media.indexOf('export async function resolveImage'));
    expect(trecho).toMatch(/for \(let nivel = NIVEL_ORIGINAL; nivel >= 0; nivel--\)/);
  });
});

describe('os limites de texto são os mesmos na tela e no banco', () => {
  // Se a tela deixar passar o que o banco recusa, a pessoa perde o que
  // escreveu e recebe jargão do Postgres — o cliente só traduz 23505 e P0100.
  const sql = readdirSync(join(RAIZ, 'supabase/migrations'))
    .filter((f) => f.endsWith('.sql')).sort()
    .map((f) => readFileSync(join(RAIZ, 'supabase/migrations', f), 'utf8'))
    .join('\n');

  const doBanco = (campo: string): [number, number] => {
    const m = sql.match(new RegExp(`length\\(btrim\\(${campo}\\)\\) between (\\d+) and (\\d+)`));
    expect(m, `não achei a restrição de \`${campo}\` no SQL`).not.toBeNull();
    return [Number(m![1]), Number(m![2])];
  };

  it('título e descrição do anúncio', () => {
    const tela = ler('screens/PublicarAnuncio.tsx');
    const daTela = (nome: string) => Number(tela.match(new RegExp(`const ${nome} = (\\d+)`))![1]);

    expect([daTela('MIN_TITULO'), daTela('MAX_TITULO')]).toEqual(doBanco('titulo'));
    expect([daTela('MIN_DESCRICAO'), daTela('MAX_DESCRICAO')]).toEqual(doBanco('descricao'));
  });

  it('mensagem da proposta', () => {
    const tela = ler('screens/Anuncio.tsx');
    const min = Number(tela.match(/const MIN_MENSAGEM = (\d+)/)![1]);
    expect(min).toBe(doBanco('mensagem')[0]);
  });
});

describe('os documentos públicos descrevem o serviço que existe', () => {
  // O cadastro OBRIGA a aceitar os três. Enquanto eles descreviam um
  // aplicativo de relacionamentos, quem entrava consentia com os termos de
  // outro produto — questão de LGPD, e do que o Google Play lê para aprovar a
  // ficha da loja.
  const DOCS = ['privacidade', 'termos', 'diretrizes'] as const;

  /** O texto do documento, SEM os blocos que explicam a mudança de versão. */
  function semAsNotasDeMudanca(html: string): string {
    // As notas de mudança citam o app antigo de propósito — é assim que se
    // explica o que mudou, e esconder isso seria pior do que dizer.
    //
    // Só essas são ignoradas, e não qualquer `.nota`: senão o bloco vira
    // esconderijo, e uma descrição desatualizada passaria por baixo do teste
    // bastando alguém colocá-la numa caixa amarela.
    return html.replace(/<div class="nota">[\s\S]*?<\/div>/g, (bloco) =>
      /Mudan[çc]a de vers[ãa]o|Mudou nesta vers[ãa]o/.test(bloco) ? '' : bloco);
  }

  it.each(DOCS)('%s.html não descreve mais um app de relacionamentos', (doc) => {
    const corpo = semAsNotasDeMudanca(ler(`public/${doc}.html`)).toLowerCase();
    for (const frase of ['aplicativo de relacionamentos', 'app de relacionamento', 'persistência romântica']) {
      expect(corpo).not.toContain(frase);
    }
  });

  it.each(DOCS)('%s.html fala de trabalho, serviço ou proposta', (doc) => {
    const corpo = ler(`public/${doc}.html`).toLowerCase();
    expect(corpo).toMatch(/serviços? profissiona|proposta|quem sabe fazer|contratar/);
  });

  it.each(DOCS)('%s.html está na versão vigente', (doc) => {
    // Documento com versão antiga é documento que alguém esqueceu de publicar.
    const html = ler(`public/${doc}.html`);
    expect(html).toContain(`Versão ${POLICY_VERSION}`);
  });

  it('o preço nos Termos é o preço que o app cobra', () => {
    // O contrato dizia R$ 29,90 enquanto o app cobrava R$ 39,90. Dois números
    // para a mesma coisa é como eles divergem — e aqui a divergência está num
    // documento que responde pelo dono perante o consumidor.
    const termos = ler('public/termos.html');
    const numero = PRECO_PREMIUM.replace(/[^\d,]/g, '');
    expect(termos, `os Termos não citam ${PRECO_PREMIUM}`).toContain(numero);

    const outros = [...termos.matchAll(/R\$\s?(\d{1,3},\d{2})\s?\/\s?mês/g)].map((m) => m[1]);
    expect(new Set(outros), 'há mais de um preço mensal nos Termos').toEqual(new Set([numero]));
  });

  it('a cota de propostas nos Termos é a mesma do banco e da tela', () => {
    const termos = ler('public/termos.html');
    expect(termos).toContain(`${QUOTAS.free.propostasPorMes} por mês`);
  });

  it('os Termos dizem que publicar anúncio não custa nada', () => {
    // É a regra central do modelo: cobra-se de quem executa, nunca de quem
    // publica. Se algum dia isso sair do contrato, foi mudança de negócio e
    // tem de ser deliberada.
    expect(ler('public/termos.html')).toMatch(/[Pp]ublicar (um )?anúncio.{0,60}(de graça|sem limite|não tem limite)/);
  });
});
