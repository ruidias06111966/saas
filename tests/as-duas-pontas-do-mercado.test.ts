import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { OUTRA_PONTA, type TipoAnuncio } from '../services/mercado';

// ---------------------------------------------------------------------------
// O mercado tem duas pontas, e elas não podem se misturar.
//
// Até a migração 021 `anuncios` só sabia guardar um lado: alguém que PRECISA
// de um serviço. Quem OFERECE existia apenas como perfil — invisível no
// quadro, inbuscável por categoria, incapaz de receber resposta. Metade do
// mercado não tinha onde se anunciar.
//
// O QUE ESTES TESTES GUARDAM
//
// Duas coisas que quebram em silêncio:
//
//   1. O CLIENTE E O BANCO DISCORDANDO. Se `tipo_anuncio` sair da lista de
//      colunas, `anuncio.tipo` chega `undefined`, a etiqueta some, o filtro
//      compara com nada — e não há erro nenhum. É a armadilha da 019 outra vez.
//
//   2. OS DOIS QUADROS MOSTRANDO A MESMA COISA. Em cada área a pessoa publica
//      o SEU lado e vê o lado OPOSTO. Inverter isso, ou esquecer o filtro,
//      mostra a ela exatamente o que ela não veio ver — e parece funcionar.
//
// O QUE ESTES TESTES NÃO PROVAM
//
// Não publicam anúncio nenhum. A regra que VALE é a do banco (restrição
// `prazo_so_em_procura`, migração 021), e essa eu ensaiei contra a produção
// antes de aplicar. Verificar o código não é verificar o app.
// ---------------------------------------------------------------------------

const RAIZ = new URL('..', import.meta.url).pathname;
const ler = (p: string) => readFileSync(join(RAIZ, p), 'utf8');

describe('as duas pontas são opostas, e isso é código, não convenção', () => {
  it.each([
    ['procurando', 'oferecendo'],
    ['oferecendo', 'procurando'],
  ] as [TipoAnuncio, TipoAnuncio][])('quem está em %s vê %s', (area, vendo) => {
    expect(OUTRA_PONTA[area]).toBe(vendo);
  });

  it('a oposição é simétrica — aplicar duas vezes volta ao começo', () => {
    for (const t of ['procurando', 'oferecendo'] as TipoAnuncio[]) {
      expect(OUTRA_PONTA[OUTRA_PONTA[t]]).toBe(t);
    }
  });
});

describe('o tipo viaja do banco até a tela', () => {
  const mercado = ler('services/mercado.ts');

  it('a coluna é pedida ao banco', () => {
    // Sem isto `anuncio.tipo` chega `undefined` e NADA acusa o erro.
    const colunas = mercado.slice(mercado.indexOf('const COLUNAS_ANUNCIO'));
    expect(colunas.slice(0, colunas.indexOf('`;'))).toContain('tipo_anuncio');
  });

  it('a linha do banco é traduzida para o objeto do cliente', () => {
    const corpo = mercado.slice(
      mercado.indexOf('function paraAnuncio'),
      mercado.indexOf('\n}', mercado.indexOf('function paraAnuncio')),
    );
    expect(corpo).toMatch(/tipo:\s*r\.tipo_anuncio/);
  });

  it('a busca filtra por tipo', () => {
    const corpo = mercado.slice(
      mercado.indexOf('export async function buscarAnuncios'),
      mercado.indexOf('\n}', mercado.indexOf('export async function buscarAnuncios')),
    );
    expect(corpo).toMatch(/f\.tipo.*eq\('tipo_anuncio', f\.tipo\)/);
  });

  it('publicar envia o tipo', () => {
    const corpo = mercado.slice(
      mercado.indexOf('export async function publicarAnuncio'),
      mercado.indexOf('\n}', mercado.indexOf('export async function publicarAnuncio')),
    );
    expect(corpo).toMatch(/tipo_anuncio:\s*r\.tipo/);
  });

  it('uma OFERTA nunca manda prazo — o banco a recusaria', () => {
    const corpo = mercado.slice(
      mercado.indexOf('export async function publicarAnuncio'),
      mercado.indexOf('\n}', mercado.indexOf('export async function publicarAnuncio')),
    );
    expect(corpo).toMatch(/r\.tipo === 'oferecendo' \? null/);
  });
});

describe('cada área mostra o lado OPOSTO, nunca o próprio', () => {
  const tela = ler('screens/Anuncios.tsx');

  it('a lista pede o lado oposto ao da área', () => {
    expect(tela).toMatch(/const vendo = OUTRA_PONTA\[area\]/);
    expect(tela).toMatch(/useState<FiltroBusca>\(\{ tipo: vendo \}\)/);
  });

  it('o botão de publicar publica o lado DA ÁREA, não o oposto', () => {
    // Inverter aqui faria "Procurar serviço" publicar uma oferta.
    expect(tela).toMatch(/navigate\(\{ name: 'publicar', tipo: area \}\)/);
  });

  it('trocar de área pelo menu troca a lista', () => {
    // Sem este efeito a pessoa clica em "Oferecer" e continua vendo ofertas.
    expect(tela).toMatch(/setFiltro\(\(f\) => \(\{ \.\.\.f, tipo: vendo, pagina: 0 \}\)\)/);
  });

  it('NENHUM caminho de limpar filtros pode apagar o tipo', () => {
    // Apagá-lo misturaria os dois quadros numa lista só — e pareceria normal.
    //
    // A primeira versão deste teste olhava 200 caracteres antes da PRIMEIRA
    // ocorrência de "Limpar filtros". Havia DUAS, e ele encontrou o bug no
    // botão que eu tinha esquecido. Recortar por número de caracteres erra
    // assim; procurar a forma errada em todo o arquivo, não.
    expect(tela).not.toMatch(/setFiltro\(\{\s*\}\)/);

    // E todo reinício de filtro carrega o tipo.
    const reinicios = tela.match(/setFiltro\(\{[^}]*\}\)/g) ?? [];
    expect(reinicios.length, 'não achei nenhum reinício de filtro').toBeGreaterThan(0);
    for (const r of reinicios) expect(r).toContain('tipo: vendo');
  });
});

describe('a etiqueta do cartão responde "isto é o quê?" de longe', () => {
  it('há uma etiqueta para cada tipo, e uma fonte só', () => {
    const tela = ler('screens/Anuncios.tsx');
    expect(tela).toMatch(/export const ETIQUETA/);
    expect(tela).toContain("procurando: { texto: 'PROCURANDO'");
    expect(tela).toContain("oferecendo: { texto: 'OFERECENDO'");
  });

  it('"Meus anúncios" usa a MESMA etiqueta, não uma cópia', () => {
    // Dois rótulos parecidos, escritos em dois arquivos, divergem — foi assim
    // que a foto e o crachá passaram a discordar (019).
    const meus = ler('screens/MeusAnuncios.tsx');
    expect(meus).toContain("import { ETIQUETA } from './Anuncios'");
    expect(meus).toContain('ETIQUETA[a.tipo]');
  });
});

describe('as duas pontas aparecem onde a pessoa decide', () => {
  it('o menu tem os dois lados, lado a lado', () => {
    const shell = ler('components/layout/AppShell.tsx');
    expect(shell).toMatch(/route: 'procurar'/);
    expect(shell).toMatch(/route: 'oferecer'/);
  });

  it('a entrada oferece os dois caminhos', () => {
    const landing = ler('screens/Landing.tsx');
    expect(landing).toContain('Encontre quem precisa.');
    expect(landing).toContain('Encontre quem oferece.');
    expect(landing).toContain('Procurar um serviço');
    expect(landing).toContain('Oferecer um serviço');
  });

  it('"Meus anúncios" separa o que procuro do que ofereço', () => {
    const meus = ler('screens/MeusAnuncios.tsx');
    expect(meus).toContain('Serviços que procuro');
    expect(meus).toContain('Serviços que ofereço');
    expect(meus).toMatch(/anuncios\.filter\(\(a\) => a\.tipo === lado\)/);
  });

  it('responder a uma oferta não se chama "enviar proposta"', () => {
    // Quem responde a uma oferta é cliente: quer CONTRATAR, não propor.
    const tela = ler('screens/Anuncio.tsx');
    expect(tela).toContain("botao: 'Quero contratar'");
    expect(tela).toContain("botao: 'Enviar proposta'");
  });
});

describe('a migração 021 fez o que diz', () => {
  const sql = readdirSync(join(RAIZ, 'supabase/migrations'))
    .filter((f) => f.startsWith('021')).map((f) => readFileSync(join(RAIZ, 'supabase/migrations', f), 'utf8'))
    .join('\n');

  it('existe, e cria o tipo com os dois valores', () => {
    expect(sql).toContain("create type public.tipo_anuncio as enum ('procurando', 'oferecendo')");
  });

  it('os anúncios que já existiam viram PROCURA, não somem', () => {
    // O §29 do pedido: não perder nenhum anúncio existente.
    expect(sql).toMatch(/add column if not exists tipo_anuncio public\.tipo_anuncio not null default 'procurando'/);
  });

  it('o banco recusa prazo numa oferta', () => {
    expect(sql).toMatch(/check \(tipo_anuncio = 'procurando' or prazo_dias is null\)/);
  });

  it('a migração se verifica em vez de supor', () => {
    expect(sql).toContain('raise exception');
    expect(sql).toMatch(/ficaram % anuncios sem tipo|ficaram % anúncios sem tipo/);
  });
});
