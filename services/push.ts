import { requireSupabase, supabaseEnabled } from './supabaseClient';

// ---------------------------------------------------------------------------
// Aviso no aparelho (Web Push).
//
// O que o navegador exige, e que não dá para contornar:
//
//   * HTTPS e um service worker registrado. Os dois já existem — ver
//     services/pwa.ts.
//   * A chave pública VAPID, para o navegador saber que a inscrição é nossa.
//     Sem ela nada aqui funciona, e o app se comporta como se push não
//     existisse. É de propósito: melhor ausente do que quebrado.
//   * Permissão dada pela pessoa, e SÓ a partir de um toque dela. Pedir ao
//     abrir o app é o caminho mais curto para o "Bloquear" — que é definitivo
//     e só se desfaz nas configurações do navegador. Por isso a única chamada
//     de `ligarPush()` no projeto está atrás de um interruptor.
//
// NO IPHONE só funciona a partir do iOS 16.4 E com o app instalado na tela de
// início. Aberto no Safari comum, `PushManager` nem existe — e é por isso que
// `estadoDoPush()` distingue "sem suporte" de "desligado": a tela precisa
// explicar, não sumir.
// ---------------------------------------------------------------------------

export type EstadoDoPush =
  /** O navegador não tem a API, ou falta a chave VAPID no build. */
  | 'indisponivel'
  /** Dá para ligar, e ainda não está ligado neste aparelho. */
  | 'desligado'
  /** Ligado neste aparelho. */
  | 'ligado'
  /** A pessoa recusou. Só ela desfaz, nas configurações do navegador. */
  | 'negado';

const CHAVE_PUBLICA = import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim();

export const pushDisponivel = Boolean(
  CHAVE_PUBLICA
  && supabaseEnabled
  && typeof window !== 'undefined'
  && 'serviceWorker' in navigator
  && 'PushManager' in window
  && 'Notification' in window,
);

/**
 * A chave VAPID viaja em base64url e o navegador quer bytes crus.
 * `atob` não entende base64url, daí a troca de `-_` por `+/` e o padding.
 */
function chaveEmBytes(base64url: string): Uint8Array {
  const preenchido = base64url.replace(/-/g, '+').replace(/_/g, '/')
    + '='.repeat((4 - (base64url.length % 4)) % 4);
  const bruto = atob(preenchido);
  return Uint8Array.from(bruto, (c) => c.charCodeAt(0));
}

/** Converte um ArrayBuffer para base64url, que é como o servidor guarda. */
function paraBase64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function estadoDoPush(): Promise<EstadoDoPush> {
  if (!pushDisponivel) return 'indisponivel';
  if (Notification.permission === 'denied') return 'negado';
  const registro = await navigator.serviceWorker.getRegistration();
  const inscricao = await registro?.pushManager.getSubscription();
  return inscricao ? 'ligado' : 'desligado';
}

/**
 * Pede a permissão e guarda a inscrição. Devolve o estado final.
 *
 * Chame só a partir de um gesto da pessoa (clique/toque): alguns navegadores
 * recusam o pedido feito fora de um, e a recusa não é reversível pelo app.
 */
export async function ligarPush(): Promise<EstadoDoPush> {
  if (!pushDisponivel) return 'indisponivel';

  const permissao = await Notification.requestPermission();
  if (permissao !== 'granted') return permissao === 'denied' ? 'negado' : 'desligado';

  // `ready` e não `getRegistration`: logo depois de instalar o app o service
  // worker pode ainda estar ativando, e inscrever num registro não ativo falha.
  const registro = await navigator.serviceWorker.ready;

  const inscricao = await registro.pushManager.subscribe({
    // Obrigatório no Chrome: promete que todo push mostra notificação visível.
    // Push silencioso serviria para rastrear alguém sem que ela perceba, e o
    // navegador simplesmente não deixa.
    userVisibleOnly: true,
    applicationServerKey: chaveEmBytes(CHAVE_PUBLICA!),
  });

  const db = requireSupabase();
  const { data: sessao } = await db.auth.getUser();
  const uid = sessao?.user?.id;
  if (!uid) throw new Error('Entre na sua conta antes de ligar os avisos.');

  const { error } = await db.from('push_subscriptions').upsert({
    endpoint: inscricao.endpoint,
    user_id: uid,
    p256dh: paraBase64Url(inscricao.getKey('p256dh')),
    auth: paraBase64Url(inscricao.getKey('auth')),
    user_agent: navigator.userAgent.slice(0, 200),
  }, { onConflict: 'endpoint' });

  if (error) {
    // Guardar falhou: desfaz a inscrição no navegador. Deixá-la de pé daria
    // um aparelho inscrito que o servidor não conhece — nunca receberia nada,
    // e o interruptor mentiria dizendo "ligado".
    await inscricao.unsubscribe().catch(() => {});
    throw new Error(`Não foi possível guardar o aviso: ${error.message}`);
  }
  return 'ligado';
}

/** Desliga neste aparelho. Não mexe nos outros aparelhos da pessoa. */
export async function desligarPush(): Promise<EstadoDoPush> {
  if (!pushDisponivel) return 'indisponivel';
  const registro = await navigator.serviceWorker.getRegistration();
  const inscricao = await registro?.pushManager.getSubscription();
  if (!inscricao) return 'desligado';

  // Apaga do servidor ANTES de desinscrever: se a ordem fosse a inversa e a
  // rede caísse no meio, ficaria uma linha morta que o servidor tentaria
  // usar para sempre.
  await requireSupabase().from('push_subscriptions')
    .delete().eq('endpoint', inscricao.endpoint);
  await inscricao.unsubscribe().catch(() => {});
  return 'desligado';
}

/**
 * Avisa a outra pessoa que chegou mensagem.
 *
 * Manda só o id da conversa. Quem descobre o destinatário é a Edge Function,
 * que confere no banco se quem chamou participa mesmo dela — o cliente não
 * tem como escolher a quem notificar.
 *
 * Nunca lança: um aviso que não saiu não pode derrubar o envio da mensagem,
 * que é o que realmente importa.
 */
export async function avisarDaMensagem(conexao: string): Promise<void> {
  if (!supabaseEnabled) return;
  try {
    await requireSupabase().functions.invoke('notificar', { body: { conexao } });
  } catch (err) {
    console.warn('[push] o aviso não saiu', err);
  }
}
