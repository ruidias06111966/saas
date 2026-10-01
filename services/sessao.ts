// ---------------------------------------------------------------------------
// A SESSÃO ACABOU — e dizer isso em vez de deixar a pessoa adivinhar.
//
// O DEFEITO, APANHADO PELO SENTRY
//
// No registro de erros havia `permission denied for view perfis_do_mercado`.
// Não é defeito de permissão: é a permissão a funcionar. Quem não tem sessão
// válida não lê essa view, de propósito. O que aconteceu foi alguém a usar o
// aplicativo com a sessão já vencida.
//
// E o que essa pessoa viu foi `Falha ao carregar dados: permission denied for
// view perfis_do_mercado`. Uma frase que não explica nada a ninguém e não
// sugere o que fazer — quando a resposta era simplesmente "entre de novo".
//
// A SEGUNDA CARA, QUE É A MAIS COMUM
//
// O erro acima acontece com o aplicativo ABERTO. O caso frequente é outro: a
// pessoa fecha o aplicativo, volta no dia seguinte, e a sessão guardada já não
// vale. Aí não há erro nenhum — o aplicativo simplesmente abre na página
// inicial, deslogado, como se ela nunca tivesse entrado. Sem aviso, sem
// explicação, sem um "entre de novo".
//
// COMO SE SABE QUE FOI A SESSÃO, E NÃO OUTRA COISA
//
// NÃO pelo texto do erro. Seria frágil e, pior, perigoso: o código 42501 que a
// sessão vencida devolve é o MESMO que a porta do painel administrativo levanta
// ("Somente administradores."). Adivinhar pelo erro poria para fora quem apenas
// tocou numa tela que não é dele.
//
// Então a pergunta é outra, e tem resposta certa: O APARELHO LEMBRA DE ALGUÉM
// LOGADO E NÃO HÁ SESSÃO? Se lembra e não há, a sessão acabou. Se não lembra de
// ninguém, é visitante novo — e dizer-lhe que "a sessão expirou" seria mentira.
//
// POR QUE NÃO PERGUNTAR AO SERVIDOR
//
// `getUser()` confirmaria contra o servidor, mas confunde dois casos muito
// diferentes: sessão recusada e rede fora do ar. Deslogar alguém porque o
// celular perdeu sinal no elevador seria pior que o defeito. `getSession()` é
// local: devolve nulo quando o próprio cliente já concluiu que não há sessão
// utilizável — nunca por causa de uma falha passageira de rede.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// COMO O APARELHO "LEMBRA" — e por que não é o que parecia.
//
// A primeira versão disto perguntava ao estado guardado do aplicativo
// (`sessionUserId`). Estava errado, e o engano teria passado despercebido: em
// modo online o QICONEXÃO NÃO espelha o banco no navegador, de propósito, para
// as conversas reais não ficarem em claro e não sobreviverem ao logout. Só o
// tema é guardado. Logo o `sessionUserId` lido ao abrir era SEMPRE nulo, e o
// caso comum — voltar no dia seguinte — continuaria mudo.
//
// O que se guarda aqui é um ÚNICO SIM/NÃO, sem nome, sem e-mail, sem id: "este
// navegador já teve alguém entrado". Não é dado pessoal e não contraria a regra
// acima — é o mínimo necessário para distinguir sessão vencida de visitante
// novo, e não serve para mais nada.
//
// O try/catch não é zelo exagerado: em janela anónima e com dados de site
// bloqueados, `localStorage` LEVANTA EXCEÇÃO em vez de devolver nulo. Sem ele,
// o aplicativo não abriria nessas janelas.
// ---------------------------------------------------------------------------

const CHAVE = 'conexao.esteve-logado';

/** Alguém já entrou neste navegador? */
export function esteveLogado(): boolean {
  try {
    return localStorage.getItem(CHAVE) === '1';
  } catch {
    return false;
  }
}

/** Passou a haver alguém entrado. */
export function lembrarQueEntrou(): void {
  try {
    localStorage.setItem(CHAVE, '1');
  } catch {
    /* sem memória, o aviso não aparece — é o pior caso, e é inofensivo */
  }
}

/**
 * Já não há. Chamado ao SAIR por vontade própria e ao avisar que a sessão
 * acabou.
 *
 * Esquecer ao sair é o que impede o pior falso positivo possível: alguém que
 * saiu de propósito reabre o aplicativo e é informado de que "a sessão
 * expirou" — uma mentira, sobre uma coisa que a própria pessoa fez.
 */
export function esquecerQueEntrou(): void {
  try {
    localStorage.removeItem(CHAVE);
  } catch {
    /* idem */
  }
}

/**
 * O aparelho lembra de alguém logado, mas já não há sessão?
 *
 * Esta função é todo o raciocínio, e mora fora de qualquer componente de
 * propósito: regra dentro de componente é regra que deixa de ser testada.
 *
 * @param jaEntrouNesteAparelho o que `esteveLogado()` devolve
 * @param temSessao             se o cliente de autenticação ainda tem sessão
 */
export function aSessaoAcabou(
  jaEntrouNesteAparelho: boolean,
  temSessao: boolean,
): boolean {
  return jaEntrouNesteAparelho && !temSessao;
}

/**
 * O título e o texto que a pessoa lê.
 *
 * Moram aqui, e não na tela, por duas razões: um teste pode cobrá-los, e as
 * duas portas de entrada deste caso (abrir o aplicativo no dia seguinte, e
 * perder a sessão com ele aberto) dizem necessariamente a mesma coisa.
 *
 * A última frase não é enfeite. "Sessão expirada" soa a dado perdido para quem
 * não é técnico, e a primeira reação é o medo de ter perdido as conversas.
 */
export const TITULO_SESSAO_EXPIRADA = 'Sua sessão expirou';

export const TEXTO_SESSAO_EXPIRADA =
  'Por segurança, a entrada vale por um tempo e depois precisa ser refeita. '
  + 'Entre de novo para continuar de onde parou — nada do que você fez foi perdido.';
