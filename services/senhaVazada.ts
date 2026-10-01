// ---------------------------------------------------------------------------
// A SENHA QUE JÁ VAZOU EM OUTRO LUGAR
//
// O PROBLEMA, QUE NÃO É O DE SEMPRE
//
// A senha mais perigosa não é a curta — é a CONHECIDA. Há centenas de milhões
// de senhas publicadas em vazamentos de outros sites, e quem invade contas não
// adivinha: pega essa lista e testa. `Brasil@2024` tem 11 caracteres, maiúscula,
// símbolo e dígito, passa em qualquer regra de "senha forte" — e aparece na lista
// 9.040 vezes (medido contra o serviço em 01/10/2026). Exigir 8 caracteres não
// encosta nesse risco.
//
// POR QUE A VERIFICAÇÃO MORA AQUI, E NÃO NO SUPABASE
//
// O Supabase tem exatamente esta proteção pronta, num interruptor. Está atrás do
// plano Pro: a documentação diz "Leaked password protection is available on the
// Pro Plan and above", e esta conta está no plano gratuito. O serviço que ele
// usa por trás, porém, é público e de graça — o Pwned Passwords, do
// haveibeenpwned.com. Então a proteção é a mesma; muda só quem faz a chamada.
//
// COMO A SENHA NÃO SAI DAQUI
//
// Isto é o ponto delicado de todo o arquivo: mandar a senha para um serviço de
// fora para perguntar se ela vazou seria absurdo. Não é o que acontece.
//
//   1. a senha vira um resumo matemático (SHA-1), aqui no aparelho;
//   2. desse resumo, saem pela rede os 5 PRIMEIROS caracteres — e nada mais;
//   3. o serviço devolve os ~800 resumos que começam com esses 5 caracteres;
//   4. a comparação final acontece AQUI, dentro do navegador.
//
// Chama-se k-anonimato. O serviço do outro lado recebe um prefixo que casa com
// centenas de milhares de senhas diferentes e não tem como saber qual delas foi
// consultada — nem se alguma foi. A senha em si nunca atravessa a rede, nem
// inteira nem cifrada, e não é gravada em lugar nenhum.
//
// `Add-Padding` fecha a última fresta: sem ele, o TAMANHO da resposta diferencia
// um prefixo do outro para quem observa a conexão. Com ele, o serviço enche a
// lista de entradas falsas — que vêm com contagem ZERO, e é por isso que a
// leitura mais abaixo precisa descartá-las.
//
// QUANDO A REDE FALHA, O CADASTRO PASSA
//
// Decisão deliberada, e a mais importante deste arquivo. Se o serviço estiver
// fora do ar, lento ou bloqueado por uma rede corporativa, a resposta é
// `nao-consegui` e o cadastro SEGUE. Barrar alguém de criar conta porque um
// serviço de terceiro caiu seria trocar um risco pequeno por uma perda certa —
// e a pessoa não teria como entender o que aconteceu. O mínimo de 8 caracteres
// continua valendo de qualquer forma.
//
// O QUE ESTA VERIFICAÇÃO NÃO FAZ
//
// Não é consultada no LOGIN. Quem já tem conta já tem senha, e recusar a entrada
// de alguém porque a senha dele apareceu numa lista seria trancá-lo fora da
// própria conta sem aviso. A hora de exigir senha nova é quando ela está sendo
// ESCOLHIDA — cadastro, "esqueci minha senha" e troca em Configurações.
// ---------------------------------------------------------------------------

/**
 * O que soubemos sobre a senha.
 *
 * `nao-consegui` é um terceiro estado de propósito, e não um `livre` disfarçado:
 * quem chama precisa poder dizer "não deu para conferir" em vez de deixar a
 * pessoa achar que a senha foi aprovada.
 */
export type VereditoDaSenha =
  | { tipo: 'livre' }
  | { tipo: 'vazada'; vezes: number }
  | { tipo: 'nao-consegui' };

/**
 * Só o prefixo entra nesta URL. Ver o cabeçalho do arquivo.
 *
 * ARMADILHA FUTURA, ANOTADA AQUI DE PROPÓSITO: no dia em que o site ganhar um
 * cabeçalho `Content-Security-Policy`, este domínio tem de estar no `connect-src`.
 * Sem isso o navegador bloqueia a chamada, a conferência cai no `nao-consegui` —
 * e, por ser à prova de falha, ela deixa de proteger sem quebrar nada visível. É
 * um defeito que não aparece em teste nenhum e não dá erro na tela.
 *
 *   connect-src 'self' https://api.pwnedpasswords.com <os demais>
 */
const SERVICO = 'https://api.pwnedpasswords.com/range/';

/**
 * Quanto esperamos antes de desistir.
 *
 * Alto demais e o botão "Continuar" fica parado sem explicação; baixo demais e
 * uma rede de celular lenta desliga a proteção sem necessidade.
 */
const PACIENCIA_MS = 5000;

/** Quantos caracteres do resumo saem para a rede. O resto fica. */
const TAMANHO_DO_PREFIXO = 5;

type Buscador = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * O resumo SHA-1 da senha, em maiúsculas — o formato que o serviço usa.
 *
 * Devolve `null` quando não há `crypto.subtle`, o que acontece fora de contexto
 * seguro (HTTP puro num domínio que não seja localhost). Sem resumo não há
 * consulta, e sem consulta a resposta é `nao-consegui` — nunca uma senha que
 * "passou".
 *
 * SHA-1 aqui não é escolha de segurança nossa e não guarda nada: é o formato
 * que o serviço publica. A senha continua guardada pelo Supabase com bcrypt.
 */
export async function resumoDaSenha(senha: string): Promise<string | null> {
  if (typeof crypto === 'undefined' || !crypto.subtle) return null;
  const bytes = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(senha));
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

/**
 * Onde o resumo é cortado: o que viaja e o que fica.
 *
 * Existe como função separada para poder ser TESTADO que o sufixo nunca entra
 * na URL. É a promessa central do arquivo, e promessa sem teste é só comentário.
 */
export function recortarResumo(resumo: string): { prefixo: string; sufixo: string } {
  const limpo = resumo.trim().toUpperCase();
  return {
    prefixo: limpo.slice(0, TAMANHO_DO_PREFIXO),
    sufixo: limpo.slice(TAMANHO_DO_PREFIXO),
  };
}

/**
 * Quantas vezes este sufixo aparece na lista devolvida pelo serviço.
 *
 * A resposta vem em texto, uma linha por senha, no formato `SUFIXO:CONTAGEM`, e
 * termina as linhas com CRLF — daí o `\r?\n`.
 *
 * TRÊS ARMADILHAS, todas verificadas contra o serviço de verdade:
 *
 *   • CONTAGEM ZERO É ENCHIMENTO. Com `Add-Padding` o serviço mistura entradas
 *     falsas na lista para que o tamanho da resposta não denuncie o prefixo
 *     consultado. Na medição feita aqui vieram 154 delas num prefixo de 1977
 *     linhas. Tratar uma dessas como ocorrência recusaria uma senha que nunca
 *     vazou — e a pessoa trocaria de senha achando que a dela estava exposta.
 *
 *   • A COMPARAÇÃO É INTEIRA, não por começo. Um `startsWith` casaria um sufixo
 *     com qualquer outro que comece igual.
 *
 *   • O SERVIÇO RESPONDE EM MAIÚSCULAS, mas comparar sem normalizar os dois
 *     lados é o tipo de detalhe que falha calado: nenhum erro, nenhuma
 *     ocorrência encontrada, proteção desligada.
 */
export function vezesNaLista(corpo: string, sufixo: string): number {
  const procurado = sufixo.trim().toUpperCase();
  if (!procurado) return 0;

  for (const linha of corpo.split(/\r?\n/)) {
    const [achado, contagem] = linha.trim().split(':');
    if (!achado || achado.toUpperCase() !== procurado) continue;
    const vezes = Number.parseInt(contagem ?? '', 10);
    return Number.isFinite(vezes) && vezes > 0 ? vezes : 0;
  }
  return 0;
}

/**
 * A senha já apareceu em vazamento conhecido?
 *
 * `buscar` é injetável só para os testes poderem rodar sem rede. Em produção é
 * o `fetch` do navegador.
 */
export async function conferirSenha(
  senha: string,
  buscar: Buscador = (url, init) => fetch(url, init),
): Promise<VereditoDaSenha> {
  if (!senha) return { tipo: 'nao-consegui' };

  const resumo = await resumoDaSenha(senha);
  if (!resumo) return { tipo: 'nao-consegui' };

  const { prefixo, sufixo } = recortarResumo(resumo);
  const relogio = new AbortController();
  const desistir = setTimeout(() => relogio.abort(), PACIENCIA_MS);

  try {
    const resposta = await buscar(`${SERVICO}${prefixo}`, {
      headers: { 'Add-Padding': 'true' },
      signal: relogio.signal,
    });
    if (!resposta.ok) return { tipo: 'nao-consegui' };

    const vezes = vezesNaLista(await resposta.text(), sufixo);
    return vezes > 0 ? { tipo: 'vazada', vezes } : { tipo: 'livre' };
  } catch {
    // O erro é engolido de propósito: ele pode trazer a URL, e a URL traz o
    // prefixo. Nada disso tem de aparecer em registro de erro nenhum.
    return { tipo: 'nao-consegui' };
  } finally {
    clearTimeout(desistir);
  }
}

/** 52372427 → "52.372.427". Sem depender de ICU, que falta em alguns runtimes. */
function comPontos(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * O recado que a pessoa lê — e a frase do meio é a razão de a função existir.
 *
 * Sem ela, "sua senha apareceu em vazamentos" se lê como "o QICONEXÃO foi
 * invadido". Não foi, e dizer isso é mais importante que o número. Mora aqui, e
 * não nas telas, para as três dizerem a mesma coisa e um teste poder cobrar.
 */
export function recadoDaSenhaVazada(vezes: number): string {
  const quantas = vezes === 1 ? 'uma vez' : `${comPontos(vezes)} vezes`;
  return (
    `Essa senha já apareceu ${quantas} em vazamentos de outros sites. ` +
    'Não foi o QICONEXÃO que vazou — é a senha que já é conhecida, e quem invade ' +
    'contas testa justamente essas primeiro. Escolha outra.'
  );
}

/** O que a tela diz quando a conferência não rodou. Discreto, e honesto. */
export const RECADO_NAO_CONSEGUI =
  'Não conseguimos conferir se esta senha já apareceu em vazamentos. Seguimos em frente.';
