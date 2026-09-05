/*
 * Service worker do CONEXÃO.
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
async function redePrimeiro(pedido) {
  const cache = await caches.open(CACHE);
  try {
    const resposta = await fetch(pedido);
    if (resposta.ok) await cache.put(CASCA, resposta.clone());
    return resposta;
  } catch {
    const guardada = await cache.match(CASCA);
    return guardada ?? Response.error();
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
