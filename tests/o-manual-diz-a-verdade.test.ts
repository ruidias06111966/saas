import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PRECO_PREMIUM, QUOTAS, ETAPAS_DA_CONVERSA, quantidade } from '../constants';
import { SAFETY_TIPS } from '../services/moderation';
import { MODALIDADE_LABEL, STATUS_PROPOSTA_LABEL } from '../services/mercado';

// ---------------------------------------------------------------------------
// O manual tem de dizer o que o sistema FAZ.
//
// Um manual que mente é pior do que nenhum: quem lê confia, age, e descobre a
// diferença no pior momento. E manual mente sozinho — ninguém precisa errar de
// propósito. Basta alguém mudar o preço em `constants.ts`, ou o limite mínimo
// de um campo, e o `public/manual.html` continua parado dizendo o número
// antigo. Nenhum erro aparece. A build passa. A pessoa lê a mentira.
//
// Foi exactamente assim que os Termos de Uso passaram semanas anunciando
// R$ 29,90 enquanto o aplicativo cobrava R$ 39,90.
//
// Por isso cada número e cada rótulo do manual está amarrado aqui à sua ÚNICA
// fonte de verdade: a constante do código, a restrição da tela, ou o SQL da
// migração. Mudar um sem mudar o outro quebra a build.
//
// O QUE ESTES TESTES NÃO PROVAM
//
// Não provam que o manual está bem escrito nem que é fácil de entender — isso
// só se descobre com alguém lendo. Provam que ele não está DESATUALIZADO.
// ---------------------------------------------------------------------------

const RAIZ = new URL('..', import.meta.url).pathname;
const ler = (p: string) => readFileSync(join(RAIZ, p), 'utf8');

const manual = ler('public/manual.html');
/** Texto visível, sem as etiquetas — para não casar com nome de classe CSS. */
const texto = manual.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('o manual existe e é uma página que abre sozinha', () => {
  it('é HTML completo, com título e descrição', () => {
    expect(manual).toMatch(/^<!doctype html>/i);
    expect(manual).toMatch(/<title>[^<]*Manual[^<]*<\/title>/);
    expect(manual).toMatch(/<meta name="description" content="[^"]{40,}"/);
  });

  it('não depende de nenhum arquivo externo para renderizar', () => {
    // Igual às outras três páginas públicas: têm de abrir mesmo que um CSS
    // externo não carregue, porque o robô da loja de aplicativos as lê assim.
    expect(manual).not.toMatch(/<link[^>]+stylesheet/);
    expect(manual).not.toMatch(/<script/);
  });

  it('funciona em tema claro e escuro', () => {
    expect(manual).toContain('prefers-color-scheme: dark');
    expect(manual).toContain(':root[data-theme="dark"]');
  });

  it('o aplicativo aponta para ele em três lugares', () => {
    // Landing é o que importa mais: é a única documentação que alguém pode ler
    // ANTES de decidir se cria conta.
    expect(ler('constants.ts')).toContain("URL_MANUAL = '/manual.html'");
    expect(ler('screens/Landing.tsx')).toContain('URL_MANUAL');
    expect(ler('screens/Settings.tsx')).toContain('URL_MANUAL');
  });
});

describe('o preço e as cotas do manual são os do código', () => {
  it('o preço do Premium', () => {
    expect(texto).toContain(PRECO_PREMIUM);
  });

  it('as propostas por mês no plano gratuito', () => {
    expect(texto).toContain(`${QUOTAS.free.propostasPorMes} propostas por mês`);
    expect(texto).toContain(`${QUOTAS.free.propostasPorMes} por mês`);
  });

  it('as propostas do Premium são ilimitadas, e a palavra vem do código', () => {
    expect(quantidade(QUOTAS.premium.propostasPorMes)).toBe('Ilimitado');
    expect(texto).toContain('Ilimitado');
  });

  it('as sugestões do Copiloto por dia, nos dois planos', () => {
    expect(texto).toContain(`${QUOTAS.free.dailyAiCalls} sugestões por dia`);
    expect(texto).toMatch(
      new RegExp(`${QUOTAS.free.dailyAiCalls}[^0-9]{1,40}${QUOTAS.premium.dailyAiCalls}`),
    );
  });

  it('os pedidos de conversa por dia, nos dois planos', () => {
    expect(texto).toMatch(
      new RegExp(`${QUOTAS.free.conversasPorDia}[^0-9]{1,40}${QUOTAS.premium.conversasPorDia}`),
    );
  });

  it('diz que publicar é de graça, que é a regra do modelo', () => {
    expect(texto.toLowerCase()).toContain('publicar anúncio é de graça');
  });
});

describe('os limites dos campos são os que as telas cobram', () => {
  const daTela = (arquivo: string, nome: string) =>
    Number(ler(arquivo).match(new RegExp(`const ${nome} = (\\d+)`))![1]);

  it('título do anúncio', () => {
    const min = daTela('screens/PublicarAnuncio.tsx', 'MIN_TITULO');
    const max = daTela('screens/PublicarAnuncio.tsx', 'MAX_TITULO');
    expect(texto).toContain(`De ${min} a ${max} caracteres`);
    expect(texto).toContain(`menos de ${min} caracteres`);
  });

  it('descrição do anúncio', () => {
    const min = daTela('screens/PublicarAnuncio.tsx', 'MIN_DESCRICAO');
    expect(texto).toContain(`No mínimo ${min} caracteres`);
    expect(texto).toContain(`menos de ${min}`);
  });

  it('mensagem da proposta', () => {
    const min = daTela('screens/Anuncio.tsx', 'MIN_MENSAGEM');
    expect(texto).toContain(`No mínimo ${min} caracteres`);
  });

  it('o máximo de áreas', () => {
    const max = daTela('screens/Signup.tsx', 'MAX_AREAS');
    expect(max).toBe(daTela('screens/ProfileEdit.tsx', 'MAX_AREAS'));
    expect(texto).toContain(`cinco áreas`);
    expect(max).toBe(5);
  });

  it('o tamanho máximo da imagem', () => {
    const media = ler('services/media.ts');
    const mb = Number(media.match(/file\.size > (\d+) \* 1024 \* 1024/)![1]);
    expect(texto).toContain(`acima de ${mb} MB`);
  });
});

describe('as etapas do cadastro do manual são as da tela', () => {
  it('as quatro etapas, na ordem', () => {
    const steps = JSON.parse(
      ler('screens/Signup.tsx').match(/const STEPS = (\[[^\]]+\])/)![1].replace(/'/g, '"'),
    ) as string[];
    expect(steps).toHaveLength(4);
    // Cada etapa aparece no manual, e na mesma ordem da tela.
    let antes = -1;
    for (const passo of steps) {
      const onde = texto.indexOf(passo);
      expect(onde, `a etapa "${passo}" não está no manual`).toBeGreaterThan(-1);
      expect(onde, `a etapa "${passo}" está fora de ordem no manual`).toBeGreaterThan(antes);
      antes = onde;
    }
  });
});

describe('os rótulos que a pessoa vê na tela são os que o manual explica', () => {
  it.each(Object.values(STATUS_PROPOSTA_LABEL))('o estado "%s" da proposta', (rotulo) => {
    expect(texto).toContain(rotulo);
  });

  it.each(Object.values(MODALIDADE_LABEL))('a modalidade "%s"', (rotulo) => {
    expect(texto).toContain(rotulo);
  });

  it('os cinco degraus da conversa, na ordem do código', () => {
    let antes = -1;
    for (const etapa of ETAPAS_DA_CONVERSA) {
      const onde = texto.indexOf(etapa.label);
      expect(onde, `o degrau "${etapa.label}" não está no manual`).toBeGreaterThan(-1);
      expect(onde, `o degrau "${etapa.label}" está fora de ordem`).toBeGreaterThan(antes);
      antes = onde;
    }
  });

  it('os três tipos de orçamento', () => {
    const tela = ler('screens/PublicarAnuncio.tsx');
    const bloco = tela.slice(tela.indexOf('const ORCAMENTO_LABEL'));
    for (const rotulo of bloco.slice(0, bloco.indexOf('};')).match(/'([^']+)',?\n/g) ?? []) {
      const limpo = rotulo.replace(/['\n,]/g, '').trim();
      if (limpo) expect(texto, `o orçamento "${limpo}" não está no manual`).toContain(limpo);
    }
  });
});

describe('as dicas de segurança do manual são as do aplicativo', () => {
  it.each(SAFETY_TIPS)('a dica "%s" está no manual, palavra por palavra', (dica) => {
    // Se a dica mudar no app e não aqui, o manual passa a ensinar outra coisa.
    expect(texto).toContain(dica);
  });
});

describe('a promoção de lançamento que o manual anuncia é a que o banco concede', () => {
  const sql = ler('supabase/migrations/005_promocao_de_lancamento.sql');

  it('os dias de cortesia', () => {
    const dias = Number(sql.match(/select interval '(\d+) days'/)![1]);
    expect(texto).toContain(`${dias} dias do plano Premium`);
    expect(texto).toContain(`${dias} dias de Premium`);
  });

  it('a data em que a promoção termina', () => {
    const [, ano, mes, dia] = sql.match(/timestamptz '(\d{4})-(\d{2})-(\d{2})/)!;
    const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
      'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    expect(texto).toContain(`${Number(dia)} de ${meses[Number(mes) - 1]} de ${ano}`);
  });
});

describe('a regra do telefone é dita sem ambiguidade', () => {
  // É a regra que mais gera dúvida e a que mais custa se for mal entendida:
  // quem acha que o telefone aparece no perfil não publica.
  it('diz que só aparece com proposta aceita, e só para as duas partes', () => {
    const t = texto.toLowerCase();
    expect(t).toContain('só quando uma proposta é aceita');
    expect(t).toContain('só para as duas pessoas');
  });

  it('diz que quem decide é o servidor, não a tela', () => {
    expect(texto.toLowerCase()).toContain('quem decide isso é o servidor');
  });
});

describe('o manual conta a pegadinha da foto que já custou um relato real', () => {
  it('diz que a foto só vale depois do Salvar', () => {
    expect(texto).toContain('Salvar');
    expect(texto.toLowerCase()).toMatch(/foto só vale depois de apertar/);
  });
});
