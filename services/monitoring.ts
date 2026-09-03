import * as Sentry from '@sentry/react';

// ---------------------------------------------------------------------------
// CONEXÃO — registro de erros.
//
// O PROBLEMA QUE ISTO RESOLVE
// Sem isto, um erro de renderização é tela branca: a pessoa fecha a aba e
// ninguém fica sabendo. Não há reclamação, não há alerta, não há rastro. Com um
// sistema dá para viver assim; com vários é cegueira.
//
// OPCIONAL POR CONSTRUÇÃO
// Sem `VITE_SENTRY_DSN` o app não muda em nada — mesma decisão do Supabase, e
// o motivo é o mesmo: clonar o repositório tem que funcionar sem configurar
// serviço nenhum. O DSN é público por natureza (vai no pacote do navegador);
// quem protege o projeto no Sentry é a lista de domínios permitidos, lá.
//
// O QUE NÃO SAI DAQUI, E POR QUÊ
// Este é um aplicativo de relacionamentos. As conversas são o produto, e são
// exatamente o tipo de dado que a LGPD trata com mais rigor. Mandar conteúdo de
// mensagem, foto ou e-mail para um serviço de terceiro nos Estados Unidos
// contrariaria tanto a lei quanto a promessa que a tela faz para quem se
// cadastra. Então:
//
//  • `sendDefaultPii: false` — nem e-mail, nem IP, nem cabeçalho de requisição.
//  • Session Replay fica DESLIGADO. Ele grava a tela, e nesta tela há conversa
//    de gente real. Não é integração padrão do SDK: só entra se alguém a
//    acrescentar aqui. Não acrescente.
//  • A URL é limpa antes de sair. Este é o ponto mais fácil de errar e está
//    explicado em `limparUrl` abaixo.
//  • Da pessoa, sai só o id — nunca nome ou e-mail. É o bastante para saber se
//    um erro atingiu três pessoas ou uma pessoa trezentas vezes, que é a
//    pergunta que o registro precisa responder.
// ---------------------------------------------------------------------------

const dsn = import.meta.env.VITE_SENTRY_DSN?.trim();

export const monitoramentoLigado = Boolean(dsn);

/**
 * Parâmetros de URL que carregam credencial.
 *
 * ISTO NÃO É PRECAUÇÃO GENÉRICA. Depois de confirmar o e-mail, o Supabase traz
 * a pessoa de volta com a sessão na PRÓPRIA URL — `#access_token=…` no fluxo
 * implícito, `?code=…` no PKCE. O `detectSessionInUrl` do nosso cliente lê e
 * limpa isso, mas existe uma janela em que a URL contém um token válido. Como o
 * Sentry anexa a URL corrente a todo evento, um erro qualquer nessa janela
 * mandaria a credencial da pessoa para fora — e quem tivesse acesso ao painel
 * poderia entrar na conta dela.
 */
const SEGREDOS_NA_URL = [
  'access_token',
  'refresh_token',
  'provider_token',
  'provider_refresh_token',
  'token_hash',
  'code',
];

/**
 * Substitui os valores sensíveis, na busca e no fragmento, preservando o resto.
 *
 * Exportada para ter teste: é a função deste arquivo cujo defeito seria pior e
 * mais silencioso — nada quebraria, o token só passaria a sair junto.
 */
export function limparUrl(bruta: string): string {
  try {
    const u = new URL(bruta);
    let mexeu = false;

    for (const chave of SEGREDOS_NA_URL) {
      if (u.searchParams.has(chave)) {
        u.searchParams.set(chave, 'REMOVIDO');
        mexeu = true;
      }
    }

    // O fragmento também é `chave=valor&…`, mas o `URL` não o interpreta.
    if (u.hash.length > 1) {
      const frag = new URLSearchParams(u.hash.slice(1));
      let mexeuNoFragmento = false;
      for (const chave of SEGREDOS_NA_URL) {
        if (frag.has(chave)) {
          frag.set(chave, 'REMOVIDO');
          mexeuNoFragmento = true;
        }
      }
      if (mexeuNoFragmento) {
        u.hash = `#${frag.toString()}`;
        mexeu = true;
      }
    }

    return mexeu ? u.toString() : bruta;
  } catch {
    // URL que não parseia: devolver como veio seria arriscar vazar justamente o
    // caso estranho. Melhor perder a informação.
    return '(url ilegível)';
  }
}

/** Ruído que consome cota sem nunca virar conserto. */
const IGNORAR = [
  // Aviso de layout que o Chrome emite e nenhum navegador considera erro.
  'ResizeObserver loop',
  // Extensões do navegador da pessoa, que não são código nosso.
  /^chrome-extension:\/\//,
  /^moz-extension:\/\//,
  // Rede caindo no meio de uma requisição. Acontece, e não há o que consertar.
  'Failed to fetch',
  'NetworkError when attempting to fetch resource',
  'Load failed',
];

export function iniciarMonitoramento(): void {
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    sendDefaultPii: false,
    // Sem amostragem de desempenho: consome a cota do plano gratuito e a
    // pergunta aqui é "quebrou?", não "está lento?".
    tracesSampleRate: 0,
    ignoreErrors: IGNORAR,

    beforeSend(evento) {
      if (evento.request?.url) evento.request.url = limparUrl(evento.request.url);
      // O SDK também guarda a URL de origem em `culprit` e nas migalhas, que a
      // função abaixo trata.
      return evento;
    },

    beforeBreadcrumb(migalha) {
      // Migalhas de navegação e de requisição carregam URL. As mesmas
      // credenciais poderiam aparecer aqui.
      if (migalha.data?.url && typeof migalha.data.url === 'string') {
        migalha.data.url = limparUrl(migalha.data.url);
      }
      if (migalha.data?.from && typeof migalha.data.from === 'string') {
        migalha.data.from = limparUrl(migalha.data.from);
      }
      if (migalha.data?.to && typeof migalha.data.to === 'string') {
        migalha.data.to = limparUrl(migalha.data.to);
      }
      // Migalhas de console podem carregar qualquer coisa que o app tenha
      // logado, inclusive trecho de conversa. Não vale o risco.
      if (migalha.category === 'console') return null;
      return migalha;
    },
  });
}

/**
 * Amarra os erros seguintes a uma conta, só pelo id.
 *
 * Chamar com `null` ao sair, senão o próximo erro na mesma aba seria atribuído
 * a quem saiu.
 */
export function identificarUsuario(id: string | null): void {
  if (!dsn) return;
  Sentry.setUser(id ? { id } : null);
}

/**
 * Reporta um erro que o app já tratou.
 *
 * Serve para os pontos onde a falha é absorvida para não quebrar a tela — ali o
 * `catch` protege a pessoa, e esta função garante que a proteção não vire
 * silêncio para nós.
 */
export function reportarErro(erro: unknown, onde: string): void {
  if (!dsn) {
    console.error(`[CONEXÃO] ${onde}`, erro);
    return;
  }
  Sentry.captureException(erro, { tags: { onde } });
}
