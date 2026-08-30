import type { Connection, Message } from '../types';
import { requireSupabase, supabaseEnabled } from './supabaseClient';
import { toConnection, toMessage, type RawConnection, type RawMessage } from './backend';

// ---------------------------------------------------------------------------
// Realtime.
//
// O Supabase entrega eventos de postgres_changes já filtrados pelo RLS de quem
// assina. Como a policy de `messages` exige participar da conexão, ninguém
// recebe evento de conversa alheia — a MESMA regra que protege o SELECT
// protege o stream. Por isso não há filtro por id no cliente: filtrar aqui
// daria uma falsa sensação de segurança e esconderia um erro de policy.
// ---------------------------------------------------------------------------

export interface RealtimeHandlers {
  /** INSERT e UPDATE de mensagem: chegada nova e confirmação de leitura. */
  onMessage: (message: Message) => void;
  /** Mudança de conexão: interesse recíproco, encerramento, bloqueio. */
  onConnection: (connection: Connection) => void;
  /** Muda quando a assinatura conecta ou cai. */
  onStatus?: (conectado: boolean) => void;
}

/**
 * Assina as mudanças das conversas da pessoa logada.
 * Devolve a função de cancelamento — chame-a ao sair ou trocar de conta.
 */
export function subscribeToConversations(h: RealtimeHandlers): () => void {
  if (!supabaseEnabled) return () => {};

  const db = requireSupabase();
  const canal = db
    .channel('conexao:conversas')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'messages' },
      (payload) => {
        const linha = payload.new as RawMessage | undefined;
        if (linha?.id) h.onMessage(toMessage(linha));
      },
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'connections' },
      (payload) => {
        const linha = payload.new as RawConnection | undefined;
        if (linha?.id) h.onConnection(toConnection(linha));
      },
    )
    .subscribe((status) => {
      h.onStatus?.(status === 'SUBSCRIBED');
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('[Realtime] Canal caiu:', status);
      }
    });

  return () => { void db.removeChannel(canal); };
}
