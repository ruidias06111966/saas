// ---------------------------------------------------------------------------
// CONEXÃO — decisão de um pedido de verificação de perfil.
//
// POR QUE ISTO NÃO É UMA RPC DO POSTGRES
// A decisão tem duas metades que precisam andar juntas: gravar o veredito (e o
// selo, quando aprovado) e APAGAR A SELFIE do Storage. A segunda metade só
// existe pela API do Storage — o Postgres proíbe deletar de storage.objects
// direto. Se a remoção ficasse a cargo do cliente, bastaria o revisor fechar a
// aba para a selfie ficar guardada para sempre.
//
// TRÊS PROTEÇÕES
// 1. Exige JWT, e confere que quem chama é administrador — lendo o papel do
//    BANCO, nunca de um campo enviado na requisição.
// 2. O selo é escrito com service_role. A coluna `verified` está congelada
//    pelo gatilho campos_privilegiados para todo usuário comum, inclusive o
//    próprio revisor agindo pela tela normal.
// 3. A selfie é apagada em qualquer desfecho — aprovada ou recusada. Ela serviu
//    à decisão; guardar é risco sem contrapartida (LGPD art. 6º, III e art. 16).
// ---------------------------------------------------------------------------

import { createClient } from 'npm:@supabase/supabase-js@2';

const BUCKET = 'verificacao';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const responder = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return responder({ erro: 'Use POST.' }, 405);

  const autorizacao = req.headers.get('Authorization');
  if (!autorizacao) return responder({ erro: 'É preciso estar autenticado.' }, 401);

  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
  const servico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    ?? JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default;
  if (!url || !anon || !servico) {
    console.error('[decidir-verificacao] ambiente incompleto');
    return responder({ erro: 'Serviço indisponível.' }, 503);
  }

  const comoUsuario = createClient(url, anon, {
    global: { headers: { Authorization: autorizacao } },
  });
  const { data: sessao, error: erroAuth } = await comoUsuario.auth.getUser();
  const uid = sessao?.user?.id;
  if (erroAuth || !uid) return responder({ erro: 'Sessão inválida.' }, 401);

  const db = createClient(url, servico, { auth: { persistSession: false } });

  // O papel vem do banco. Um campo "sou admin" na requisição seria só texto.
  const { data: quem } = await db.from('users').select('role').eq('id', uid).maybeSingle();
  if (quem?.role !== 'admin') return responder({ erro: 'Somente administradores.' }, 403);

  let body: { pedido?: string; aprovar?: boolean; motivo?: string };
  try {
    body = await req.json();
  } catch {
    return responder({ erro: 'Corpo inválido.' }, 400);
  }

  const pedido = String(body.pedido ?? '');
  if (!/^[0-9a-f-]{36}$/.test(pedido)) return responder({ erro: 'Pedido inválido.' }, 400);
  const aprovar = body.aprovar === true;
  const motivo = typeof body.motivo === 'string' ? body.motivo.slice(0, 500).trim() : '';

  if (!aprovar && !motivo) {
    return responder({ erro: 'Recusa exige um motivo, que a pessoa vai ler.' }, 400);
  }

  const { data: r, error: erroPedido } = await db
    .from('verification_requests')
    .select('id, user_id, status')
    .eq('id', pedido)
    .maybeSingle();
  if (erroPedido || !r) return responder({ erro: 'Pedido não encontrado.' }, 404);
  if (r.status !== 'pendente') return responder({ erro: 'Este pedido já foi decidido.' }, 409);

  // A selfie sai primeiro. Se a gravação falhar depois, o pior caso é um pedido
  // que precisa ser refeito — nunca uma selfie esquecida no Storage.
  const caminho = `${r.user_id}/${r.id}.jpg`;
  const { error: erroRemocao } = await db.storage.from(BUCKET).remove([caminho]);
  if (erroRemocao) {
    console.error('[decidir-verificacao] falha ao apagar a selfie', erroRemocao);
    return responder({ erro: 'Não foi possível concluir. Tente de novo.' }, 500);
  }

  const { error: erroUpdate } = await db.from('verification_requests').update({
    status: aprovar ? 'aprovada' : 'recusada',
    decided_at: new Date().toISOString(),
    decided_by: uid,
    reason: motivo || null,
    selfie_removida: true,
  }).eq('id', r.id);
  if (erroUpdate) {
    console.error('[decidir-verificacao] falha ao gravar o veredito', erroUpdate);
    return responder({ erro: 'Não foi possível concluir. Tente de novo.' }, 500);
  }

  if (aprovar) {
    const { error: erroSelo } = await db.from('users')
      .update({ verified: true }).eq('id', r.user_id);
    if (erroSelo) {
      console.error('[decidir-verificacao] falha ao conceder o selo', erroSelo);
      return responder({ erro: 'Veredito gravado, mas o selo falhou.' }, 500);
    }
  }

  await db.from('notifications').insert({
    user_id: r.user_id,
    kind: 'sistema',
    title: aprovar ? 'Perfil verificado ✅' : 'Verificação não aprovada',
    body: aprovar
      ? 'Sua selfie confere com a foto do perfil. O selo já aparece para as outras pessoas.'
      : `Motivo: ${motivo} Você pode tentar de novo quando quiser.`,
    read: false,
  });

  return responder({ ok: true, aprovado: aprovar });
});
