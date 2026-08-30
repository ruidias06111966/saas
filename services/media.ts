import { requireSupabase, supabaseEnabled } from './supabaseClient';
import { readImageAsDataUrl } from './storage';

// ---------------------------------------------------------------------------
// Imagens.
//
// Modo demo   → dataURL redimensionado, guardado no localStorage.
// Modo online → arquivo no bucket privado `midia`, sob a pasta do próprio
//               usuário, acessado por URL assinada de curta duração.
//
// NOTA HONESTA SOBRE O VÉU: o desfoque é aplicado no cliente. Ele é uma
// mecânica de produto, não uma garantia criptográfica — quem abrir o
// inspetor consegue ver a imagem original. A correção de produção é servir
// uma derivada já desfocada pelo servidor até a conversa atingir o estágio,
// e só então liberar a original. O bucket é privado justamente para que esse
// passo seja possível depois sem trocar as URLs públicas de lugar.
// ---------------------------------------------------------------------------

const BUCKET = 'midia';
const URL_TTL_SEGUNDOS = 60 * 60;

/** Converte o dataURL redimensionado em blob, para não subir o original inteiro. */
async function comprimir(file: File, maxSize: number): Promise<Blob> {
  const dataUrl = await readImageAsDataUrl(file, maxSize);
  return await (await fetch(dataUrl)).blob();
}

/**
 * Sobe uma imagem e devolve o caminho salvo (modo online) ou o próprio dataURL
 * (modo demo). O chamador guarda esse valor em `user.photo` / `message.imageData`.
 */
export async function uploadImage(
  file: File, userId: string, pasta: 'perfil' | 'conversa', maxSize = 720,
): Promise<string> {
  if (!supabaseEnabled) return readImageAsDataUrl(file, maxSize);

  const blob = await comprimir(file, maxSize);
  const nome = `${userId}/${pasta}/${Date.now()}.jpg`;
  const { error } = await requireSupabase().storage
    .from(BUCKET).upload(nome, blob, { contentType: 'image/jpeg', upsert: true });
  if (error) throw new Error(`Falha ao enviar a imagem: ${error.message}`);
  return nome;
}

const cache = new Map<string, { url: string; expira: number }>();

/** Resolve o caminho salvo em URL exibível. dataURL passa direto. */
export async function resolveImage(caminho?: string): Promise<string | undefined> {
  if (!caminho) return undefined;
  if (caminho.startsWith('data:') || caminho.startsWith('http')) return caminho;
  if (!supabaseEnabled) return caminho;

  const agora = Date.now();
  const emCache = cache.get(caminho);
  if (emCache && emCache.expira > agora) return emCache.url;

  const { data, error } = await requireSupabase().storage
    .from(BUCKET).createSignedUrl(caminho, URL_TTL_SEGUNDOS);
  if (error || !data) return undefined;

  cache.set(caminho, { url: data.signedUrl, expira: agora + (URL_TTL_SEGUNDOS - 60) * 1000 });
  return data.signedUrl;
}

export async function removeImage(caminho?: string): Promise<void> {
  if (!caminho || !supabaseEnabled || caminho.startsWith('data:')) return;
  await requireSupabase().storage.from(BUCKET).remove([caminho]);
}
