// ---------------------------------------------------------------------------
// Instalação no celular.
//
// O que faz o app virar aplicativo instalável são três coisas, e só elas: o
// manifest (public/manifest.webmanifest), os ícones de 192 e 512 pixels, e um
// service worker registrado com tratamento de `fetch`. Com as três, o Android
// oferece "Instalar aplicativo" e o app abre em tela cheia, sem barra de
// endereço. Sem qualquer uma, não oferece — e não diz por quê.
//
// É também o pré-requisito da Play Store: o empacotador (TWA) parte de um PWA
// instalável. Ver docs/CELULAR.md.
// ---------------------------------------------------------------------------

/**
 * Registra o service worker. Só em produção, e só se o navegador tiver a API.
 *
 * Em desenvolvimento fica de fora de propósito: o service worker guardaria os
 * arquivos que o Vite acabou de trocar a quente, e a tela pararia de refletir
 * o código — um jeito caro de perder uma tarde.
 */
export function registrarServiceWorker(): void {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;
  if (!import.meta.env.PROD) return;

  // Depois do `load` para não disputar banda com o primeiro desenho da tela.
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .catch((erro) => {
        // Falhar aqui não quebra nada: o app continua funcionando pela rede,
        // só não fica instalável. Por isso avisa e segue.
        console.warn('[pwa] o service worker não registrou', erro);
      });
  });
}

/**
 * Válvula de escape.
 *
 * Se algum dia uma versão ruim do service worker ficar servindo tela velha,
 * isto apaga os caches e o desregistra. Está exportado para poder ser chamado
 * do console do navegador sem depender de uma publicação nova — que é
 * justamente o que não funcionaria nesse cenário.
 */
export async function desligarServiceWorker(): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  const registros = await navigator.serviceWorker.getRegistrations();
  for (const registro of registros) {
    registro.active?.postMessage('DESLIGAR');
    await registro.unregister();
  }
  if ('caches' in window) {
    for (const nome of await caches.keys()) await caches.delete(nome);
  }
}
