import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { QUOTAS, ETAPAS_DA_CONVERSA } from '../constants';
import { SAFETY_TIPS } from '../services/moderation';
import { MODALIDADE_LABEL, STATUS_PROPOSTA_LABEL } from '../services/mercado';
import { TITULO_SESSAO_EXPIRADA } from '../services/sessao';

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

  it('o endereço do manual mora num lugar só', () => {
    expect(ler('constants.ts')).toContain("URL_MANUAL = '/manual.html'");
  });

  /**
   * O arquivo SEM as linhas de `import`.
   *
   * Sem isto o teste passa por acidente: apagar o link e deixar o import órfão
   * ainda casa com "contém URL_MANUAL". Aconteceu — forcei a remoção do link
   * da barra lateral e os 41 testes passaram. Só conta o USO.
   */
  const semImports = (arquivo: string) =>
    ler(arquivo).split('\n').filter((l) => !/^\s*import\b/.test(l)).join('\n');

  it.each([
    ['screens/Landing.tsx', 'a entrada, para quem ainda não tem conta'],
    ['components/layout/AppShell.tsx', 'a barra lateral, dentro do aplicativo'],
    ['screens/Profile.tsx', 'o perfil, que é o caminho do celular'],
    ['screens/Settings.tsx', 'as configurações'],
  ])('%s USA o manual, e não só o importa (%s)', (arquivo) => {
    expect(semImports(arquivo)).toContain('URL_MANUAL');
  });

  it('NA ENTRADA ELE NÃO PODE FICAR SÓ NO RODAPÉ', () => {
    // Foi este o defeito relatado: o manual existia, estava publicado, e o dono
    // do sistema não o encontrou — porque o único link estava no rodapé, que é
    // onde ninguém olha. "Publicado" não é "encontrável".
    const landing = ler('screens/Landing.tsx');
    const rodape = landing.indexOf('<footer');
    expect(rodape, 'não achei o rodapé da entrada').toBeGreaterThan(-1);
    const acimaDoRodape = landing
      .slice(0, rodape)
      .split('\n').filter((l) => !/^\s*import\b/.test(l)).join('\n')
      .split('URL_MANUAL').length - 1;
    expect(
      acimaDoRodape,
      'o manual voltou a aparecer só no rodapé da entrada',
    ).toBeGreaterThanOrEqual(2);
  });

  it('o convite da entrada diz para que serve, não só o nome', () => {
    // "Manual" sozinho não convence ninguém a clicar. A frase tem de dizer o
    // que a pessoa ganha e que não precisa de conta.
    const landing = ler('screens/Landing.tsx');
    expect(landing).toContain('Primeira vez aqui?');
    expect(landing).toContain('sem precisar de conta');
  });
});

describe('o preço e as cotas do manual são os do código', () => {
  it('o manual NÃO repete o preço — diz onde ele está', () => {
    // Este teste já exigia que o manual citasse a constante PRECO_PREMIUM.
    // Desde a migração 025 o preço mora na tabela `planos` e muda pelo painel;
    // um número fixo no manual seria combinar para ele envelhecer.
    const valores = [...texto.matchAll(/R\$\s?\d+,\d{2}/g)].map((m) => m[0]);
    expect(valores, `o manual repete preço: ${valores.join(', ')}`).toEqual([]);
    expect(texto).toContain('Onde ver quanto custa');
  });

  it('o manual explica que há dois planos, mensal e anual', () => {
    expect(texto).toContain('Mensal ou anual');
    expect(texto).toMatch(/uma vez por ano/);
    expect(texto).toContain('quem já assinou continua pagando o que contratou');
  });

  it('o manual diz a REGRA, não uma cota que não existe mais', () => {
    // A migração 022 trocou "3 por mês" por "tem plano ou não tem".
    expect(QUOTAS.free.podeResponder).toBe(false);
    expect(QUOTAS.premium.podeResponder).toBe(true);
    expect(texto).toContain('Responder ao anúncio de outra pessoa');
    expect(texto).not.toMatch(/\b3 propostas por m[êe]s\b/);
  });

  it('e diz a exceção, que é o que faz a regra funcionar', () => {
    // Sem isto, quem publicou acharia que precisa pagar para responder a quem
    // o procurou — e o profissional que pagou receberia silêncio.
    expect(texto.toLowerCase()).toContain('paga quem bate na porta dos outros');
    expect(texto).toContain('não custa nada');
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
    // A frase mudou de "publicar anúncio" para "publicar", porque agora são
    // dois tipos de anúncio. O que não pode mudar é a promessa.
    expect(texto.toLowerCase()).toMatch(/publicar (an[úu]ncio )?é de graça/);
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
    // Duas menções no manual, as duas com o mesmo número.
    const mencoes = texto.match(new RegExp(`${dias} dias d[eo] `, 'g')) ?? [];
    expect(mencoes.length, 'o manual devia citar os dias de cortesia').toBeGreaterThanOrEqual(2);
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

// ---------------------------------------------------------------------------
// E O MANUAL TEM DE ACOMPANHAR O QUE O SISTEMA PASSOU A FAZER.
//
// 02/10/2026: quatro coisas entraram no sistema em dois dias — a conferência de
// senha vazada, o aviso de sessão expirada, o olho no campo de senha e a edição
// de anúncio. O manual não disse nenhuma. Só o NÚMERO DA VERSÃO tinha subido,
// mecanicamente, junto com os outros documentos.
//
// Ninguém errou de propósito, e nenhum teste reclamou: os testes acima amarram
// NÚMEROS e RÓTULOS que já estavam no manual. Não havia nada a amarrar um
// recurso NOVO, porque o manual não falava dele. Foi o dono quem reparou.
//
// Daí este bloco: cada recurso que o sistema ganhou fica amarrado, pelo CÓDIGO
// que o implementa, à frase do manual que o explica. Tirar o recurso sem tirar
// a frase — ou pôr o recurso sem pôr a frase — quebra a build.
//
// O QUE ISTO AINDA NÃO RESOLVE, E É HONESTO DIZER
//
// O recurso número cinco, o de amanhã, continuará sem guarda até alguém
// escrever o seu. Não há como um teste exigir uma frase sobre uma coisa que
// ainda não existe. O que este bloco faz é tornar a omissão VISÍVEL depois —
// e deixar o hábito escrito onde a próxima pessoa vai procurar.
// ---------------------------------------------------------------------------

const servico = (caminho: string) => ler(caminho);

describe('o manual acompanha o que o sistema passou a fazer', () => {
  it('se o sistema confere senha vazada, o manual explica — e tranquiliza', () => {
    expect(servico('services/senhaVazada.ts'), 'o sistema deixou de conferir?')
      .toContain('export async function conferirSenha');

    const t = texto.toLowerCase();
    expect(t, 'o manual não fala da conferência de senha vazada')
      .toContain('vazamentos públicos de outros sites');
    // A frase que mais importa: sem ela, "sua senha vazou" lê-se como "o
    // QICONEXÃO foi invadido".
    expect(t, 'falta dizer que não foi o QICONEXÃO que vazou')
      .toContain('não significa que o qiconexão foi invadido');
    // E a promessa técnica que a Política de Privacidade também faz.
    expect(t).toContain('não sai do seu aparelho');
  });

  it('o aviso de sessão expirada do manual é o MESMO que a tela mostra', () => {
    // Amarrado à constante, e não a um texto copiado: duas frases parecidas,
    // escritas em dois arquivos, divergem.
    expect(texto).toContain(TITULO_SESSAO_EXPIRADA);
    expect(texto.toLowerCase()).toContain('nada do que você fez foi perdido');
  });

  it('se os campos de senha têm o olho, o manual diz onde ele está', () => {
    expect(servico('components/ui/index.tsx'), 'o olho sumiu do componente?')
      .toContain('export function CampoDeSenha');
    expect(texto.toLowerCase()).toContain('olho do lado direito');
  });

  it('se o sistema deixa editar anúncio, o manual explica as regras', () => {
    expect(servico('services/mercado.ts'), 'a edição saiu do sistema?')
      .toContain('export async function atualizarAnuncio');

    const t = texto.toLowerCase();
    expect(t, 'o manual não diz que dá para corrigir um anúncio')
      .toContain('corrigir um anúncio já publicado');
    // As três regras que a pessoa descobriria do pior jeito.
    expect(t, 'falta dizer que só dá enquanto aberto').toContain('só enquanto o anúncio está aberto');
    expect(t, 'falta dizer que o prazo não reinicia').toContain('não reinicia');

    // O MANUAL JÁ MENTIU AQUI. Dizia "o lado não muda" porque a edição recusava
    // trocá-lo. A edição passou a permitir, e o manual tem de acompanhar — senão
    // a pessoa lê que não dá, não tenta, e deixa o anúncio do lado errado.
    expect(t, 'o manual voltou a dizer que o lado não muda').not.toContain('o lado não muda');
    expect(t, 'falta dizer que dá para virar o lado').toContain('o lado muda, sim');
    expect(t, 'falta dizer onde se vira o lado').toContain('este anúncio é');
  });

  // O ENGANO QUE CUSTOU DIAS DE ANÚNCIO INVISÍVEL: quem oferece é encontrado na
  // área "Procurar serviço". O manual tem de dizer isto com as duas áreas pelo
  // nome, porque o nome da aba sugere o contrário.
  it('o manual diz em que área o anúncio da pessoa aparece para os outros', () => {
    expect(servico('screens/Anuncios.tsx'), 'a inversão saiu da tela?')
      .toContain('OUTRA_PONTA[area]');

    const t = texto.toLowerCase();
    expect(t, 'o manual não responde onde o anúncio aparece')
      .toContain('onde é que o meu anúncio aparece para os outros?');
    expect(t, 'falta dizer que é a área contrária').toContain('na área contrária');
    expect(t, 'falta mandar quem oferece olhar em Procurar serviço')
      .toContain('ofereceu um serviço, ele aparece em procurar serviço');
    expect(t, 'falta mandar quem procura olhar em Oferecer serviço')
      .toContain('aparece em oferecer serviço');
    expect(t, 'falta dizer onde a pessoa vê os seus próprios anúncios')
      .toContain('para ver os seus anúncios num lugar só');
  });

  it('se a conversa aceita arquivo, o manual diz quais e qual o limite', () => {
    expect(servico('services/media.ts'), 'o envio de arquivo saiu do sistema?')
      .toContain('export async function uploadChatFile');

    const t = texto.toLowerCase();
    expect(t, 'o manual não explica os dois botões da conversa')
      .toContain('mandar foto e arquivo');
    expect(t).toContain('pdf, word ou excel');
    expect(t, 'falta o limite de tamanho').toContain('8 mb');
    // A parte que é decisão, e não detalhe: o que NÃO é aceito, e por quê.
    expect(t, 'falta dizer que programa não passa').toContain('programas e scripts');
  });

  it('e a Política de Privacidade declara que o arquivo fica guardado', () => {
    const privacidade = ler('public/privacidade.html').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    expect(privacidade).toContain('imagens e arquivos');
    expect(privacidade, 'falta dizer quem alcança o arquivo')
      .toContain('você e à pessoa com quem a conversa está aberta');
    expect(privacidade, 'falta dizer que o endereço expira').toContain('assinado e expira');
  });

  it('a seção de problemas cobre os três enganos novos', () => {
    const t = texto.toLowerCase();
    expect(t).toContain('a senha que escolhi foi recusada');
    expect(t).toContain('fui parar na tela de entrar sozinho');
    expect(t).toContain('errei algo no anúncio que já publiquei');
    expect(t).toContain('não consigo anexar um arquivo na conversa');
  });
});
