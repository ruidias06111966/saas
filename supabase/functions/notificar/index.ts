// ---------------------------------------------------------------------------
// QICONEXÃO — avisa no celular que chegou mensagem.
//
// Chamada pelo aparelho de QUEM ENVIOU, logo depois de gravar a mensagem. Só
// recebe o id da conversa: quem descobre para quem avisar é esta função, com
// service_role, lendo a conexão. O cliente nunca diz a quem notificar — se
// dissesse, qualquer pessoa autenticada poderia disparar aviso para qualquer
// outra, e um aplicativo de relacionamentos viraria ferramenta de assédio.
//
// O que esta função garante, e cada uma custou uma decisão:
//
//   1. Quem chama tem de ser participante da conversa. Confere no banco.
//   2. Quem recebe é sempre "a outra pessoa". Não há como escolher.
//   3. O conteúdo da mensagem NÃO vai no aviso. Vai "Você tem uma mensagem
//      nova" e mais nada — o texto de uma conversa privada não passeia pelos
//      servidores de push do Google só para caber numa tarja de notificação.
//   4. Se houver bloqueio entre as partes, ninguém é avisado.
//   5. Inscrição que o serviço de push recusa como morta (404/410) é apagada
//      na hora. Sem isso a tabela vira cemitério de aparelhos trocados.
// ---------------------------------------------------------------------------

import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const CABECALHOS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const responder = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CABECALHOS, 'Content-Type': 'application/json' },
  });

/** O segredo pode estar avulso ou dentro do pacote que o Supabase injeta. */
function servico(): string | null {
  const direto = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (direto) return direto;
  try {
    return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default ?? null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CABECALHOS });
  if (req.method !== 'POST') return responder({ erro: 'Método não permitido.' }, 405);

  const publica = Deno.env.get('VAPID_PUBLIC_KEY');
  const privada = Deno.env.get('VAPID_PRIVATE_KEY');
  const contato = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:contato@qidominios.com.br';

  // Sem as chaves o push simplesmente não existe. Devolve 503 e uma frase que
  // diz o que fazer, em vez de 500 com pilha de erro — porque este é o estado
  // esperado do sistema até alguém gerar o par de chaves.
  if (!publica || !privada) {
    return responder(
      { erro: 'Push não configurado.', detalhe: 'Faltam VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY nos segredos. Ver docs/PUSH.md.' },
      503,
    );
  }

  const url = Deno.env.get('SUPABASE_URL');
  const chaveDeServico = servico();
  if (!url || !chaveDeServico) return responder({ erro: 'Serviço indisponível.' }, 503);

  // Identidade de quem chama, tirada do JWT — nunca do corpo do pedido.
  const autorizacao = req.headers.get('Authorization') ?? '';
  const comoUsuario = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: autorizacao } },
    auth: { persistSession: false },
  });
  const { data: sessao } = await comoUsuario.auth.getUser();
  const remetente = sessao?.user?.id;
  if (!remetente) return responder({ erro: 'Não autenticado.' }, 401);

  let conexao: string | undefined;
  try {
    conexao = (await req.json())?.conexao;
  } catch {
    return responder({ erro: 'Corpo inválido.' }, 400);
  }
  if (typeof conexao !== 'string' || !conexao) {
    return responder({ erro: 'Informe a conversa.' }, 400);
  }

  const db = createClient(url, chaveDeServico, { auth: { persistSession: false } });

  const { data: conn } = await db
    .from('connections')
    .select('user_a, user_b, status')
    .eq('id', conexao)
    .maybeSingle();

  if (!conn) return responder({ erro: 'Conversa não encontrada.' }, 404);
  if (conn.user_a !== remetente && conn.user_b !== remetente) {
    // Quem não participa da conversa não dispara aviso nela. Resposta igual à
    // de "não existe", para não confirmar a existência da conversa a estranhos.
    return responder({ erro: 'Conversa não encontrada.' }, 404);
  }

  const destinatario = conn.user_a === remetente ? conn.user_b : conn.user_a;

  const { data: bloqueio } = await db
    .from('blocks')
    .select('blocker_id')
    .or(`and(blocker_id.eq.${remetente},blocked_id.eq.${destinatario}),and(blocker_id.eq.${destinatario},blocked_id.eq.${remetente})`)
    .limit(1);
  if (bloqueio?.length) return responder({ avisados: 0, motivo: 'bloqueio' });

  const { data: inscricoes } = await db
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', destinatario);

  if (!inscricoes?.length) return responder({ avisados: 0, motivo: 'sem inscrição' });

  webpush.setVapidDetails(contato, publica, privada);

  // Sem nome, sem trecho da conversa, sem id de quem enviou. `tag` faz o
  // sistema empilhar os avisos em vez de encher a tela quando chegam três
  // mensagens seguidas.
  const carga = JSON.stringify({
    titulo: 'QICONEXÃO',
    corpo: 'Você tem uma mensagem nova.',
    tag: 'mensagem',
  });

  let avisados = 0;
  const mortas: string[] = [];

  await Promise.all(inscricoes.map(async (i) => {
    try {
      await webpush.sendNotification(
        { endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } },
        carga,
        { TTL: 3600 },
      );
      avisados++;
    } catch (err) {
      const codigo = (err as { statusCode?: number }).statusCode;
      // 404/410 = o serviço de push diz que este aparelho não existe mais.
      // É a única resposta que autoriza apagar; erro de rede, não.
      if (codigo === 404 || codigo === 410) mortas.push(i.endpoint);
      else console.error('[notificar] falha ao entregar', codigo, (err as Error).message);
    }
  }));

  if (mortas.length) {
    await db.from('push_subscriptions').delete().in('endpoint', mortas);
  }
  if (avisados) {
    await db.from('push_subscriptions')
      .update({ last_ok_at: new Date().toISOString() })
      .eq('user_id', destinatario);
  }

  return responder({ avisados, removidas: mortas.length });
});
