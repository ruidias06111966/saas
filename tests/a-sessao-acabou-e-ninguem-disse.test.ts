import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  TEXTO_SESSAO_EXPIRADA, TITULO_SESSAO_EXPIRADA, aSessaoAcabou,
  esquecerQueEntrou, esteveLogado, lembrarQueEntrou,
} from '../services/sessao';

// ---------------------------------------------------------------------------
// O DEFEITO QUE ESTES TESTES GUARDAM
//
// A sessão acabava e ninguém dizia nada. Em dois caminhos diferentes:
//
//   1. com o aplicativo ABERTO: a carga falhava e a pessoa lia
//      `Falha ao carregar dados: permission denied for view perfis_do_mercado`.
//      Foi assim que este caso apareceu — no Sentry, com uma ocorrência real;
//   2. ao VOLTAR no dia seguinte (o caso comum): não havia erro nenhum. O
//      aplicativo abria na página inicial, deslogado, sem uma palavra.
//
// A ARMADILHA QUE ESTES TESTES EXISTEM PARA FECHAR
//
// É tentador decidir pelo texto do erro. Seria frágil e, pior, PERIGOSO: o
// código 42501 que a sessão vencida devolve é o MESMO que a porta do painel
// administrativo levanta ("Somente administradores."). Quem adivinhasse pelo
// erro poria para fora quem apenas tocou numa tela que não é dele.
//
// A pergunta certa não olha para o erro: o aparelho lembra de alguém logado e
// não há sessão?
// ---------------------------------------------------------------------------

const ler = (caminho: string): string => readFileSync(caminho, 'utf8');
const semComentarios = (codigo: string): string =>
  codigo.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

const SESSAO = semComentarios(ler('services/sessao.ts'));
const CONTEXTO = semComentarios(ler('state/AppContext.tsx'));
const ENTRAR = semComentarios(ler('screens/Login.tsx'));

/**
 * Recorte delimitado — nunca por contagem de caracteres.
 *
 * ESTA FUNÇÃO JÁ FALHOU, E A LIÇÃO FICA ESCRITA AQUI.
 *
 * A primeira versão destes testes fechava os recortes em `\n  };`. Essas
 * funções terminam em `}, [dep]);` — o fecho NÃO EXISTIA nelas, e o recorte
 * seguia até a próxima ocorrência lá adiante, varrendo metade do arquivo. O
 * teste "sem o return, a sessão vencida também é relatada" passava por achar um
 * `return;` de outra função, e a regressão forçada não o derrubou.
 *
 * Por isso o fecho agora é conferido: se não estiver onde se espera, o teste
 * falha em vez de recortar de mais.
 */
function trecho(fonte: string, abre: string, fecha: string): string {
  const i = fonte.indexOf(abre);
  expect(i, `não achei "${abre}"`).toBeGreaterThan(-1);
  const f = fonte.indexOf(fecha, i + abre.length);
  expect(f, `não achei o fim "${fecha}" de "${abre}"`).toBeGreaterThan(i);
  const corte = fonte.slice(i, f);
  // Um recorte que passou do fim engole outras funções. 1200 caracteres é
  // folgado para qualquer uma destas e apertado para o engano.
  expect(corte.length, `o recorte de "${abre}" ficou largo demais`).toBeLessThan(1200);
  return corte;
}

// O ambiente de teste é Node, que não tem `localStorage`. Este é o mínimo que
// serve, e serve também para provar o try/catch: ver o teste da janela anónima.
function memoriaDeMentira(): void {
  const dados = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => dados.get(k) ?? null,
    setItem: (k: string, v: string) => { dados.set(k, v); },
    removeItem: (k: string) => { dados.delete(k); },
  };
}

describe('saber que a sessão acabou — sem adivinhar pelo erro', () => {
  it('já entrou neste aparelho e não há sessão: acabou', () => {
    expect(aSessaoAcabou(true, false)).toBe(true);
  });

  it('já entrou e a sessão vale: não acabou', () => {
    expect(aSessaoAcabou(true, true)).toBe(false);
  });

  // O FALSO POSITIVO QUE ESTRAGARIA TUDO: dizer a quem nunca entrou que a
  // sessão dele expirou. É mentira, e confunde justamente quem chega.
  it('visitante novo NUNCA é avisado de sessão expirada', () => {
    expect(aSessaoAcabou(false, false)).toBe(false);
    expect(aSessaoAcabou(false, true)).toBe(false);
  });

  // A REGRESSÃO MAIS IMPORTANTE DESTE ARQUIVO.
  it('a decisão não olha para o texto nem para o código do erro', () => {
    for (const pista of ['42501', 'PGRST', 'permission denied', 'JWT', 'message', 'error']) {
      expect(SESSAO, `a decisão passou a adivinhar por "${pista}"`)
        .not.toMatch(new RegExp(pista, 'i'));
    }
  });
});

describe('a memória do navegador — mínima, e apagada quando deve', () => {
  // ESTE BLOCO NASCEU DE UM DEFEITO MEU, APANHADO ANTES DE PUBLICAR.
  //
  // A primeira versão perguntava ao estado guardado do aplicativo
  // (`sessionUserId`). Em modo ONLINE esse estado não é guardado — de
  // propósito, para as conversas reais não ficarem em claro no navegador. Só o
  // tema é. Logo a resposta era sempre "ninguém", e o caso comum (voltar no dia
  // seguinte) continuaria mudo, com todos os testes verdes.
  it('começa sem memória nenhuma', () => {
    memoriaDeMentira();
    expect(esteveLogado()).toBe(false);
  });

  it('lembra depois de alguém entrar, e esquece quando mandado', () => {
    memoriaDeMentira();
    lembrarQueEntrou();
    expect(esteveLogado()).toBe(true);
    esquecerQueEntrou();
    expect(esteveLogado()).toBe(false);
  });

  // Em janela anónima e com dados de site bloqueados, `localStorage` LEVANTA
  // EXCEÇÃO em vez de devolver nulo. Sem o try/catch o aplicativo não abriria.
  it('janela que proíbe guardar não derruba o aplicativo', () => {
    (globalThis as Record<string, unknown>).localStorage = {
      getItem: () => { throw new Error('acesso negado'); },
      setItem: () => { throw new Error('acesso negado'); },
      removeItem: () => { throw new Error('acesso negado'); },
    };
    expect(() => lembrarQueEntrou()).not.toThrow();
    expect(() => esquecerQueEntrou()).not.toThrow();
    expect(esteveLogado()).toBe(false);
  });

  it('guarda um sim/não, e nada de pessoal', () => {
    for (const pessoal of ['email', 'nome', 'userId', 'sessionUserId', 'token']) {
      expect(SESSAO, `a memória passou a guardar ${pessoal}`)
        .not.toMatch(new RegExp(pessoal, 'i'));
    }
  });

  // O OUTRO FALSO POSITIVO, e o mais ofensivo: quem saiu por vontade própria
  // reabre o aplicativo e é informado de que "a sessão expirou" — uma mentira
  // sobre uma coisa que a própria pessoa fez.
  it('sair de propósito apaga a memória', () => {
    expect(trecho(CONTEXTO, 'const logout = useCallback', '}, []);'))
      .toContain('esquecerQueEntrou()');
  });

  it('excluir a conta também', () => {
    expect(trecho(CONTEXTO, 'const deleteAccount = useCallback', '}, [me]);'))
      .toContain('esquecerQueEntrou()');
  });

  it('entrar passa a lembrar', () => {
    expect(trecho(CONTEXTO, 'const hydrate = useCallback', 'const refresh'))
      .toContain('lembrarQueEntrou()');
  });
});

describe('o que a pessoa lê', () => {
  it('diz o que aconteceu, sem jargão', () => {
    expect(TITULO_SESSAO_EXPIRADA).toBe('Sua sessão expirou');
  });

  // "Sessão expirada" soa a dado perdido para quem não é técnico, e a primeira
  // reação é o medo de ter perdido as conversas.
  it('tranquiliza: nada foi perdido', () => {
    expect(TEXTO_SESSAO_EXPIRADA).toContain('nada do que você fez foi perdido');
  });

  it('diz o que fazer a seguir', () => {
    expect(TEXTO_SESSAO_EXPIRADA).toContain('Entre de novo');
  });

  it('o texto mora no serviço, para as duas portas dizerem o mesmo', () => {
    expect(ENTRAR).toContain('TITULO_SESSAO_EXPIRADA');
    expect(ENTRAR).toContain('TEXTO_SESSAO_EXPIRADA');
    expect(ENTRAR, 'a tela voltou a escrever o texto à mão')
      .not.toContain('Sua sessão expirou');
  });
});

describe('os dois caminhos levam ao mesmo aviso', () => {
  it('ao abrir sem sessão, com o aparelho lembrando de alguém', () => {
    const corpo = trecho(CONTEXTO, 'currentSession()\n      .then(', '.catch(');
    expect(corpo).toContain('aSessaoAcabou(esteveLogado(), false)');
    expect(corpo).toContain('marcarSessaoExpirada()');
  });

  it('e quando a carga falha com o aplicativo aberto', () => {
    const corpo = trecho(CONTEXTO, 'const tratarFalhaDeCarga', '}, [marcarSessaoExpirada]);');
    expect(corpo).toContain('aSessaoAcabou(esteveLogado()');
    expect(corpo).toContain('marcarSessaoExpirada()');
  });

  // Sessão que vence é funcionamento normal, não defeito. Mandá-la para o
  // registro de erros enche o Sentry de ruído e esconde o que importa — foi
  // assim que este caso só apareceu depois de alguém abrir o painel.
  it('sessão vencida NÃO vai para o registro de erros', () => {
    const corpo = trecho(CONTEXTO, 'const tratarFalhaDeCarga', '}, [marcarSessaoExpirada]);');
    const avisa = corpo.indexOf('marcarSessaoExpirada()');
    const reporta = corpo.indexOf('reportarErro');
    expect(avisa).toBeGreaterThan(-1);
    expect(reporta, 'o relato de erro sumiu — defeito de verdade tem de ser relatado')
      .toBeGreaterThan(-1);
    expect(avisa, 'o relato passou a vir antes do desvio').toBeLessThan(reporta);
    expect(corpo, 'sem o return, a sessão vencida também é relatada como defeito')
      .toContain('return;');
  });

  it('defeito de verdade continua a ser relatado', () => {
    expect(trecho(CONTEXTO, 'const tratarFalhaDeCarga', '}, [marcarSessaoExpirada]);'))
      .toContain('reportarErro(err, onde)');
  });
});

describe('o aviso aparece, e sai quando cumpre o papel', () => {
  it('a tela de entrar mostra o aviso', () => {
    expect(ENTRAR).toContain('sessaoExpirada &&');
    expect(ENTRAR, 'um toque de aviso desapareceria antes de a pessoa o ler')
      .toContain('<Banner');
  });

  it('entrar de novo apaga o aviso', () => {
    expect(CONTEXTO).toContain('setSessaoExpirada(false)');
  });

  // Sem zerar o `lembradoNoAparelho`, um segundo tropeço repetiria o aviso a
  // alguém que já foi avisado e já está na tela de entrar.
  it('o aviso não se repete', () => {
    expect(trecho(CONTEXTO, 'const marcarSessaoExpirada', '}, []);'))
      .toContain('esquecerQueEntrou()');
  });

  it('a sessão perdida é de facto encerrada, não só escondida', () => {
    const corpo = trecho(CONTEXTO, 'const marcarSessaoExpirada', '}, []);');
    expect(corpo).toContain("dispatch({ type: 'LOGOUT' })");
    expect(corpo).toContain('signOut()');
    expect(corpo).toContain("setRoute({ name: 'login' })");
  });
});
