import { requireSupabase, supabaseEnabled } from './supabaseClient';

// ---------------------------------------------------------------------------
// Verificação de perfil por selfie, com revisão humana.
//
// Por que revisão humana e não reconhecimento facial: biometria é dado pessoal
// SENSÍVEL na LGPD (art. 11), e comparação facial confiável é serviço pago de
// terceiro. Uma selfie reproduzindo uma pose sorteada, olhada por uma pessoa da
// equipe, resolve o problema real — provar que existe alguém por trás do
// perfil — sem construir uma base biométrica.
//
// O que este arquivo NÃO faz, de propósito:
//  • não escolhe a pose (o servidor sorteia; se o cliente escolhesse, daria
//    para garimpar entre fotos antigas uma que já servisse);
//  • não concede o selo (`users.verified` está congelada para o cliente);
//  • não apaga a selfie (quem apaga é a Edge Function, ao decidir — se
//    dependesse do navegador, fechar a aba deixaria a selfie guardada).
// ---------------------------------------------------------------------------

const BUCKET = 'verificacao';

export type VerificationStatus = 'pendente' | 'aprovada' | 'recusada';

export interface VerificationRequest {
  id: string;
  status: VerificationStatus;
  pose: string;
  createdAt: string;
  reason?: string;
}

export interface QueueItem {
  id: string;
  userId: string;
  name: string;
  pose: string;
  createdAt: string;
  photoBase?: string;
  city: string;
  birthDate: string;
}

/** Abre um pedido e devolve a pose sorteada pelo servidor. */
export async function requestVerification(): Promise<{ id: string; pose: string }> {
  const { data, error } = await requireSupabase().rpc('pedir_verificacao');
  if (error) throw new Error(error.message);
  const linha = (Array.isArray(data) ? data[0] : data) as { id: string; pose: string };
  return linha;
}

/**
 * Envia a selfie. O nome do arquivo é o id do pedido — a política do Storage
 * exige exatamente isso, então não há como acumular selfies soltas na pasta.
 */
export async function uploadSelfie(requestId: string, userId: string, blob: Blob): Promise<void> {
  const { error } = await requireSupabase().storage
    .from(BUCKET)
    .upload(`${userId}/${requestId}.jpg`, blob, { contentType: 'image/jpeg', upsert: true });
  if (error) throw new Error(`Não foi possível enviar a selfie: ${error.message}`);
}

/** O pedido mais recente desta pessoa, para a tela saber o que mostrar. */
export async function myLastRequest(userId: string): Promise<VerificationRequest | null> {
  const { data, error } = await requireSupabase()
    .from('verification_requests')
    .select('id, status, pose, created_at, reason')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id, status: data.status, pose: data.pose,
    createdAt: data.created_at, reason: data.reason ?? undefined,
  };
}

/** Registra o consentimento específico para dado sensível (LGPD art. 11). */
export async function consentToSensitiveData(userId: string): Promise<void> {
  const { error } = await requireSupabase().from('consents').upsert({
    user_id: userId, kind: 'dados_sensiveis', version: '1.0',
    accepted_at: new Date().toISOString(),
  }, { onConflict: 'user_id,kind,version' });
  if (error) throw new Error(`Não foi possível registrar o consentimento: ${error.message}`);
}

/** A fila do revisor. O servidor devolve vazio para quem não é administrador. */
export async function reviewQueue(): Promise<QueueItem[]> {
  const { data, error } = await requireSupabase().rpc('fila_de_verificacao');
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, string>[]).map((r) => ({
    id: r.id, userId: r.user_id, name: r.nome, pose: r.pose,
    createdAt: r.criado_em, photoBase: r.foto_base ?? undefined,
    city: r.cidade, birthDate: r.nascimento,
  }));
}

/** URL assinada da selfie. Só administrador consegue: a política é `is_admin()`. */
export async function selfieUrl(userId: string, requestId: string): Promise<string | undefined> {
  const { data } = await requireSupabase().storage
    .from(BUCKET).createSignedUrl(`${userId}/${requestId}.jpg`, 300);
  return data?.signedUrl;
}

/** Aprova ou recusa. A recusa exige motivo, porque a pessoa vai lê-lo. */
export async function decide(
  requestId: string, approve: boolean, reason = '',
): Promise<void> {
  const { data, error } = await requireSupabase().functions.invoke('decidir-verificacao', {
    body: { pedido: requestId, aprovar: approve, motivo: reason },
  });
  const corpo = data as { ok?: boolean; erro?: string } | null;
  if (error || !corpo?.ok) throw new Error(corpo?.erro ?? error?.message ?? 'Falha ao decidir.');
}

export const verificationEnabled = supabaseEnabled;
