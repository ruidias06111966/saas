/*
 * Service worker do QICONEXÃO.
 *
 * Existe por dois motivos, nesta ordem:
 *
 *   1. Sem ele o Android não oferece instalar o aplicativo, e sem instalação
 *      não há caminho para a Play Store. É requisito, não enfeite.
 *   2. Com ele o app abre com a tela já pronta mesmo em rede ruim — que no
 *      celular é a regra, não a exceção.
 *
 * E existe com medo, porque service worker mal escrito é a única coisa neste
 * projeto capaz de servir uma versão velha para sempre, sem erro em lugar
 * nenhum. Três regras seguram isso:
 *
 *   - NAVEGAÇÃO É SEMPRE REDE PRIMEIRO. O index.html nunca sai do cache
 *     estando online. É ele que aponta para os arquivos da versão nova.
 *   - Só entra em cache o que tem hash no nome (`assets/`), e esse nunca muda
 *     de conteúdo. Cache-primeiro nele é seguro por construção.
 *   - NADA de outra origem passa por aqui. Supabase, Stripe, Sentry e as
 *     fontes do Google vão direto para a rede, sempre. Guardar resposta de
 *     API num app com conversa de gente real seria vazamento esperando data.
 */

const CACHE = 'conexao-v1';

// Uma chave só para a casca. A volta do e-mail de confirmação traz `?code=…`
// na URL; guardar por URL encheria o cache de entradas de uso único que nunca
// mais servem para nada.
const CASCA = new URL(self.registration.scope).pathname;

self.addEventListener('install', (evento) => {
  evento.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // `reload` para não pegar do cache HTTP do navegador uma casca já velha.
    await cache.add(new Request(CASCA, { cache: 'reload' }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil((async () => {
    const nomes = await caches.keys();
    await Promise.all(nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;
  if (pedido.method !== 'GET') return;

  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin) return;

  if (pedido.mode === 'navigate') {
    evento.respondWith(redePrimeiro(pedido));
  } else if (url.pathname.includes('/assets/')) {
    evento.respondWith(cachePrimeiro(pedido));
  } else {
    evento.respondWith(cacheERevalida(pedido));
  }
});

/*
 * Aviso no aparelho.
 *
 * Estes dois ouvintes são o que faz a notificação existir. Sem `push` o
 * navegador recebe a entrega e não mostra nada; sem `notificationclick` a
 * pessoa toca no aviso e ele só some.
 *
 * O conteúdo da mensagem NÃO vem aqui — o servidor manda "Você tem uma
 * mensagem nova" e nada mais. Ver supabase/functions/notificar/index.ts.
 */
self.addEventListener('push', (evento) => {
  let dados = {};
  try {
    dados = evento.data?.json() ?? {};
  } catch {
    // Carga que não é JSON: mostra o aviso genérico em vez de engolir o evento.
    // Alguns navegadores penalizam quem recebe push e não notifica nada.
  }
  evento.waitUntil(self.registration.showNotification(dados.titulo || 'QICONEXÃO', {
    body: dados.corpo || 'Você tem uma mensagem nova.',
    icon: `${CASCA}icones/icone-192.png`,
    badge: `${CASCA}icones/icone-192.png`,
    // Mesma `tag` empilha em vez de encher a tela com três avisos seguidos.
    tag: dados.tag || 'qiconexao',
    lang: 'pt-BR',
    data: { url: CASCA },
  }));
});

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  evento.waitUntil((async () => {
    // Se o app já está aberto numa aba, traz aquela para a frente em vez de
    // abrir outra — senão a pessoa acumula abas do mesmo app.
    const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const janela of janelas) {
      if (janela.url.startsWith(self.location.origin)) return janela.focus();
    }
    return self.clients.openWindow(evento.notification.data?.url || CASCA);
  })());
});

/** Válvula de escape: o app manda desligar e o service worker se apaga. */
self.addEventListener('message', (evento) => {
  if (evento.data !== 'DESLIGAR') return;
  evento.waitUntil((async () => {
    const nomes = await caches.keys();
    await Promise.all(nomes.map((n) => caches.delete(n)));
    await self.registration.unregister();
  })());
});

/** Estando online, o que vale é o que veio do servidor. Offline, a casca. */
/**
 * A casca é o app; qualquer outra navegação é uma página própria.
 *
 * Enquanto existiu uma única página navegável, esta distinção não fazia falta.
 * Passou a fazer quando nasceu /privacidade.html, que o Google Play exige como
 * endereço público e separado.
 */
function ehACasca(pedido) {
  const caminho = new URL(pedido.url).pathname;
  return caminho === CASCA || caminho === `${CASCA}index.html`;
}

async function redePrimeiro(pedido) {
  const cache = await caches.open(CACHE);
  // A resposta era guardada SEMPRE sob a chave da casca. Com uma página só,
  // isso era inofensivo. Com duas, abrir a política de privacidade passava a
  // sobrescrever a casca do app — e a próxima abertura sem rede mostraria a
  // política no lugar do aplicativo, sem nada que explicasse o porquê.
  const chave = ehACasca(pedido) ? CASCA : pedido;
  try {
    const resposta = await fetch(pedido);
    if (resposta.ok) await cache.put(chave, resposta.clone());
    return resposta;
  } catch {
    // Sem rede: primeiro a própria página, depois a casca como último recurso.
    return (await cache.match(chave)) ?? (await cache.match(CASCA)) ?? Response.error();
  }
}

/** Só para arquivos com hash no nome: o conteúdo deles nunca muda. */
async function cachePrimeiro(pedido) {
  const cache = await caches.open(CACHE);
  const guardada = await cache.match(pedido);
  if (guardada) return guardada;
  const resposta = await fetch(pedido);
  if (resposta.ok) await cache.put(pedido, resposta.clone());
  return resposta;
}

/** Ícones e manifest: responde na hora e atualiza por baixo. */
async function cacheERevalida(pedido) {
  const cache = await caches.open(CACHE);
  const guardada = await cache.match(pedido);
  const daRede = fetch(pedido)
    .then((resposta) => {
      if (resposta.ok) void cache.put(pedido, resposta.clone());
      return resposta;
    })
    .catch(() => guardada ?? Response.error());
  return guardada ?? daRede;
}
