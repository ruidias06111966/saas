import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  RECADO_NAO_CONSEGUI, conferirSenha, recadoDaSenhaVazada, recortarResumo,
  resumoDaSenha, vezesNaLista,
} from '../services/senhaVazada';

// ---------------------------------------------------------------------------
// O QUE ESTES TESTES GUARDAM
//
// A proteção contra senha vazada estava num interruptor do Supabase que o plano
// gratuito não liga. O serviço por trás dele é público, então a verificação
// passou a ser nossa — e com ela passou a existir, no cadastro, uma chamada a um
// serviço de fora. Daí a promessa que estes testes existem para cobrar:
//
//   A SENHA NÃO ATRAVESSA A REDE. Saem 5 caracteres de um resumo matemático; a
//   comparação final acontece dentro do navegador.
//
// Essa promessa está escrita na Política de Privacidade. Um `fetch` descuidado a
// transformaria em mentira sem quebrar nada visível — o cadastro continuaria
// funcionando igual. É o pior tipo de defeito, e é este arquivo que o apanha.
//
// SOBRE A FORMA DOS TESTES DE TEXTO
//
// Nove vezes nesta base um teste passou por acidente, sempre pela mesma causa: a
// busca achava, FORA do lugar pretendido, o que devia achar dentro dele — um
// import, um botão vizinho, um comentário que menciona o defeito de propósito.
// Por isso o código é lido SEM COMENTÁRIOS e os recortes são delimitados.
// ---------------------------------------------------------------------------

const ler = (caminho: string): string => readFileSync(caminho, 'utf8');
const semComentarios = (codigo: string): string =>
  codigo.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

// O resumo de "password", conferido contra o serviço de verdade em 01/10/2026.
const RESUMO_DE_PASSWORD = '5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8';
const SUFIXO_DE_PASSWORD = '1E4C9B93F3F0682250B6CF8331B7EE68FD8';

// Pedaço fiel de uma resposta real, com CRLF e com uma linha de ENCHIMENTO
// (contagem 0) no meio — foi assim que o serviço respondeu com `Add-Padding`.
const RESPOSTA_REAL = [
  '003CD215739D7C1B2218670D26F81408237:2',
  '0049A2F1A6D0DF9B65F67E47F34F3A2BF46:1',
  `${SUFIXO_DE_PASSWORD}:52372427`,
  '1E4C9B93F3F0682250B6CF8331B7EE68FD9:0',
  'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:0',
].join('\r\n');

describe('a leitura da lista devolvida pelo serviço', () => {
  it('encontra uma senha conhecida e devolve quantas vezes ela vazou', () => {
    expect(vezesNaLista(RESPOSTA_REAL, SUFIXO_DE_PASSWORD)).toBe(52372427);
  });

  it('devolve zero para uma senha que não está na lista', () => {
    expect(vezesNaLista(RESPOSTA_REAL, 'A'.repeat(35))).toBe(0);
  });

  // A ARMADILHA MAIS SÉRIA: com `Add-Padding` o serviço mistura entradas falsas
  // na resposta, para o tamanho dela não denunciar o prefixo consultado. Elas
  // vêm com contagem ZERO. Contar uma delas recusaria uma senha que nunca vazou,
  // e a pessoa trocaria de senha achando que a dela estava exposta.
  it('ignora as entradas de enchimento, que vêm com contagem zero', () => {
    expect(vezesNaLista(RESPOSTA_REAL, '1E4C9B93F3F0682250B6CF8331B7EE68FD9')).toBe(0);
    expect(vezesNaLista(RESPOSTA_REAL, 'F'.repeat(35))).toBe(0);
  });

  // A regressão: alguém troca a igualdade por `startsWith` e qualquer sufixo que
  // comece igual passa a casar.
  it('compara o sufixo inteiro, nunca só o começo', () => {
    expect(vezesNaLista(RESPOSTA_REAL, SUFIXO_DE_PASSWORD.slice(0, 20))).toBe(0);
  });

  it('não se perde com maiúsculas e minúsculas', () => {
    expect(vezesNaLista(RESPOSTA_REAL, SUFIXO_DE_PASSWORD.toLowerCase())).toBe(52372427);
    expect(vezesNaLista(RESPOSTA_REAL.toLowerCase(), SUFIXO_DE_PASSWORD)).toBe(52372427);
  });

  it('lê a resposta com fim de linha CRLF, que é como ela chega', () => {
    expect(RESPOSTA_REAL).toContain('\r\n');
    expect(vezesNaLista(RESPOSTA_REAL, '003CD215739D7C1B2218670D26F81408237')).toBe(2);
  });

  it('não quebra com resposta vazia nem com sufixo vazio', () => {
    expect(vezesNaLista('', SUFIXO_DE_PASSWORD)).toBe(0);
    expect(vezesNaLista(RESPOSTA_REAL, '')).toBe(0);
    expect(vezesNaLista(RESPOSTA_REAL, '   ')).toBe(0);
  });
});

describe('o resumo da senha e o corte entre o que viaja e o que fica', () => {
  it('o resumo é o SHA-1 em maiúsculas que o serviço usa', async () => {
    expect(await resumoDaSenha('password')).toBe(RESUMO_DE_PASSWORD);
  });

  it('viajam 5 caracteres; os outros 35 ficam', () => {
    const { prefixo, sufixo } = recortarResumo(RESUMO_DE_PASSWORD);
    expect(prefixo).toBe('5BAA6');
    expect(prefixo).toHaveLength(5);
    expect(sufixo).toBe(SUFIXO_DE_PASSWORD);
    expect(prefixo + sufixo).toBe(RESUMO_DE_PASSWORD);
  });
});

describe('A PROMESSA DO ARQUIVO: a senha não sai do aparelho', () => {
  /** Guarda tudo o que foi pedido à rede, para o teste poder vistoriar. */
  function espiao(corpo: string, ok = true) {
    const chamadas: { url: string; init?: RequestInit }[] = [];
    const buscar = async (url: string, init?: RequestInit) => {
      chamadas.push({ url, init });
      return { ok, text: async () => corpo } as Response;
    };
    return { chamadas, buscar };
  }

  const ENDERECO_DO_SERVICO = 'https://api.pwnedpasswords.com/range/';

  /**
   * Tudo o que foi pedido à rede, MENOS o endereço fixo do serviço.
   *
   * Tirar o endereço não é conveniência: o domínio `pwnedpasswords.com` CONTÉM a
   * palavra "password", e a primeira versão deste teste falhou por causa disso —
   * acusava de vazamento o que era só o nome do domínio. Sem o recorte, o teste
   * ou grita sem motivo ou (pior) é "consertado" afrouxando a asserção, e aí
   * deixa de guardar a promessa.
   */
  function pedidoSemOEndereco(c: { url: string; init?: RequestInit }): string {
    return JSON.stringify({
      caminho: c.url.replace(ENDERECO_DO_SERVICO, ''),
      init: { ...c.init, signal: undefined },
    });
  }

  it('a URL chamada contém o prefixo e NÃO contém a senha nem o sufixo', async () => {
    const { chamadas, buscar } = espiao(RESPOSTA_REAL);
    await conferirSenha('password', buscar);

    expect(chamadas).toHaveLength(1);
    const url = chamadas[0].url;
    expect(url).toBe(`${ENDERECO_DO_SERVICO}5BAA6`);

    const caminho = url.replace(ENDERECO_DO_SERVICO, '');
    expect(caminho).toBe('5BAA6');
    expect(caminho, 'a senha foi para a rede').not.toContain('password');
    expect(caminho, 'o sufixo do resumo foi para a rede').not.toContain(SUFIXO_DE_PASSWORD);
    expect(caminho, 'o resumo inteiro foi para a rede').not.toContain(RESUMO_DE_PASSWORD);
  });

  it('nada além da URL carrega a senha: nem corpo, nem cabeçalho', async () => {
    const { chamadas, buscar } = espiao(RESPOSTA_REAL);
    await conferirSenha('password', buscar);

    const tudo = pedidoSemOEndereco(chamadas[0]);
    expect(tudo).not.toContain('password');
    expect(tudo).not.toContain(SUFIXO_DE_PASSWORD);
    // E nada de corpo: é um GET, a senha não tem por onde ir.
    expect(chamadas[0].init?.body).toBeUndefined();
    expect(chamadas[0].init?.method ?? 'GET').toBe('GET');
  });

  // Sem `Add-Padding` o TAMANHO da resposta diferencia um prefixo do outro para
  // quem observa a conexão — e o k-anonimato perde parte da graça.
  it('pede o enchimento, para o tamanho da resposta não denunciar o prefixo', async () => {
    const { chamadas, buscar } = espiao(RESPOSTA_REAL);
    await conferirSenha('password', buscar);
    expect(chamadas[0].init?.headers).toMatchObject({ 'Add-Padding': 'true' });
  });

  it('a comparação final acontece aqui: a senha conhecida é recusada', async () => {
    const { buscar } = espiao(RESPOSTA_REAL);
    expect(await conferirSenha('password', buscar)).toEqual({ tipo: 'vazada', vezes: 52372427 });
  });

  // ESTE TESTE NASCEU DE UMA REGRESSÃO QUE NÃO DERRUBOU NADA.
  //
  // Forçando o defeito "decidir por PRESENÇA da linha em vez de pela contagem",
  // a suíte inteira continuou verde — havia teste para o enchimento na leitura da
  // lista, mas nenhum no caminho completo. E é no caminho completo que o defeito
  // mora: uma linha de enchimento ESTÁ presente, só vem com contagem zero. Quem
  // decide por presença recusa uma senha que nunca vazou.
  it('linha de enchimento com a cara da senha NÃO é tratada como vazamento', async () => {
    const soEnchimento = [
      '003CD215739D7C1B2218670D26F81408237:5',
      `${SUFIXO_DE_PASSWORD}:0`,
    ].join('\r\n');
    const { buscar } = espiao(soEnchimento);
    expect(await conferirSenha('password', buscar)).toEqual({ tipo: 'livre' });
  });

  it('e a senha que não está na lista passa', async () => {
    // Mesma resposta, senha outra: o sufixo dela não casa com nenhuma linha.
    const { buscar } = espiao(RESPOSTA_REAL);
    expect(await conferirSenha('Jacaranda-Seco-41-Ferrovia', buscar)).toEqual({ tipo: 'livre' });
  });
});

describe('quando o serviço de fora falha, o cadastro não para', () => {
  // A DECISÃO MAIS IMPORTANTE DO ARQUIVO. Barrar alguém de criar conta porque um
  // serviço de terceiro caiu troca um risco pequeno por uma perda certa — e a
  // pessoa não teria como entender o que aconteceu.
  it('rede caída devolve "nao-consegui", não "vazada"', async () => {
    const explode = async () => { throw new Error('getaddrinfo ENOTFOUND'); };
    expect(await conferirSenha('password', explode)).toEqual({ tipo: 'nao-consegui' });
  });

  it('resposta de erro do serviço devolve "nao-consegui"', async () => {
    const quinhentos = async () => ({ ok: false, text: async () => '' }) as Response;
    expect(await conferirSenha('password', quinhentos)).toEqual({ tipo: 'nao-consegui' });
  });

  it('senha vazia não vira consulta', async () => {
    let chamou = false;
    const buscar = async () => { chamou = true; return { ok: true, text: async () => '' } as Response; };
    expect(await conferirSenha('', buscar)).toEqual({ tipo: 'nao-consegui' });
    expect(chamou).toBe(false);
  });

  // `nao-consegui` existir como estado próprio é o que permite à tela dizer "não
  // deu para conferir" em vez de deixar a pessoa achar que a senha foi aprovada.
  it('"nao-consegui" é um estado distinto de "livre"', async () => {
    const explode = async () => { throw new Error('qualquer'); };
    const r = await conferirSenha('password', explode);
    expect(r.tipo).not.toBe('livre');
    expect(r.tipo).not.toBe('vazada');
  });
});

describe('o recado que a pessoa lê', () => {
  // Sem esta frase, "sua senha apareceu em vazamentos" se lê como "o QICONEXÃO
  // foi invadido". Não foi, e dizer isso importa mais que o número.
  it('deixa claro que não foi o QICONEXÃO que vazou', () => {
    const recado = recadoDaSenhaVazada(52372427);
    expect(recado).toContain('Não foi o QICONEXÃO que vazou');
    expect(recado).toContain('Escolha outra');
  });

  it('escreve o número de um jeito legível', () => {
    expect(recadoDaSenhaVazada(52372427)).toContain('52.372.427 vezes');
    expect(recadoDaSenhaVazada(1234)).toContain('1.234 vezes');
  });

  it('não escreve "1 vezes"', () => {
    expect(recadoDaSenhaVazada(1)).toContain('uma vez');
    expect(recadoDaSenhaVazada(1)).not.toContain('1 vezes');
  });

  it('o recado de falha não acusa a senha de nada', () => {
    expect(RECADO_NAO_CONSEGUI).not.toMatch(/vazou|vazada|insegura/);
    expect(RECADO_NAO_CONSEGUI).toContain('Não conseguimos conferir');
  });
});

describe('as três telas que escolhem senha conferem; a de entrar não', () => {
  const TELAS = {
    'screens/Signup.tsx': 'o cadastro',
    'screens/RedefinirSenha.tsx': 'o "esqueci minha senha"',
    'screens/Settings.tsx': 'a troca de senha em Configurações',
  };

  for (const [arquivo, descricao] of Object.entries(TELAS)) {
    it(`${descricao} confere a senha antes de gravar`, () => {
      expect(semComentarios(ler(arquivo)), `${arquivo} não confere`)
        .toContain('conferirSenha(');
    });
  }

  // A REGRESSÃO QUE TRANCARIA GENTE FORA DA PRÓPRIA CONTA: alguém "reforça" a
  // segurança conferindo a senha também no login. Quem já tem conta já tem
  // senha; recusar a entrada dela seria perda de acesso sem aviso.
  it('a tela de entrar NÃO confere — isso trancaria gente fora da conta', () => {
    expect(semComentarios(ler('screens/Login.tsx'))).not.toContain('conferirSenha');
  });

  // A promessa está escrita na Política de Privacidade, e o documento é parte do
  // sistema: se a verificação existe, ele tem de dizer que existe.
  it('a Política de Privacidade declara a verificação e o que sai do aparelho', () => {
    const politica = ler('public/privacidade.html');
    expect(politica).toContain('Have I Been Pwned');
    expect(politica).toContain('5 primeiros caracteres');
    expect(politica, 'o documento tem de negar que a senha viaja')
      .toContain('A sua senha nunca sai do seu aparelho');
  });
});
