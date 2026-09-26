import { requireSupabase, supabaseEnabled } from './supabaseClient';
import { readImageAsDataUrl } from './storage';

// ---------------------------------------------------------------------------
// Imagens de perfil.
//
// O VÉU ACABOU — e a migração 019 é o que o encerrou de verdade.
//
// Era o diferencial do app de relacionamentos: a foto subia como pirâmide de
// resoluções (12, 24, 48, 96 px e o original) e o banco liberava um nível de
// cada vez, conforme a conversa avançava. A foto era a recompensa.
//
// Num mercado de serviços isso é o contrário do que se quer: o rosto de quem
// presta serviço é credencial. Quem contrata precisa ver com quem está lidando
// ANTES de decidir, não depois.
//
// O QUE DEU ERRADO, E POR QUE DEMOROU A APARECER
//
// Este arquivo foi pivotado no dia do pivô — `resolveImage` passou a pedir o
// original. A POLÍTICA DO STORAGE não foi, e continuou liberando só o nível 0
// para quem não fosse dono. Como `resolveImage` desce nível a nível até algo
// passar, não havia erro nenhum: aparecia a foto borrada, e pronto.
//
// Ninguém viu porque havia UMA conta no sistema. Ninguém nunca tinha olhado o
// perfil de outra pessoa. É a mesma armadilha da 014 e da 015 — o cliente e o
// banco discordando em silêncio —, e desta vez a pista estava aqui mesmo, num
// comentário que dizia "não há mais véu" enquanto o véu continuava de pé.
//
// COMO ESTÁ AGORA
//
// A foto segue a mesma regra do crachá: a política do Storage chama
// `private.perfil_visivel`, a MESMA função que decide quem aparece em
// `perfis_do_mercado`. Não é uma regra parecida — é a mesma, de propósito.
//
// A pirâmide ainda é gerada no envio, pela Edge Function `velar`, e ninguém
// mais a lê. É peso morto: cinco arquivos onde um bastaria, e um envio que
// falha inteiro se `velar` falhar. Tirar isso mexe no caminho de ENVIO, que é
// o mais arriscado deste arquivo, então fica para uma mudança própria.
//
// Modo demo (sem backend) guarda um dataURL só, como sempre guardou.
// ---------------------------------------------------------------------------

const BUCKET = 'midia';
const URL_TTL_SEGUNDOS = 60 * 60;

/** O nível 4 é o original; 0..3 são os velados que o servidor gera. */
export const NIVEL_ORIGINAL = 4;

// A pirâmide continua sendo gerada no envio — ver o cabeçalho. Ninguém mais a
// lê: desde a 019 o original passa para todo mundo que o crachá já mostra.

const sufixo = (nivel: number) => (nivel >= NIVEL_ORIGINAL ? 'orig' : String(nivel));

function carregar(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('Arquivo não é uma imagem.'));
    if (file.size > 8 * 1024 * 1024) return reject(new Error('Imagem acima de 8 MB.'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Imagem inválida.'));
      img.onload = () => resolve(img);
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function renderizar(img: HTMLImageElement, larguraAlvo: number, qualidade: number): Promise<Blob> {
  const escala = Math.min(1, larguraAlvo / img.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * escala));
  canvas.height = Math.max(1, Math.round(img.height * escala));
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Canvas indisponível.'));
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Falha ao gerar a imagem.'))),
      'image/jpeg', qualidade,
    );
  });
}

/**
 * Sobe a foto de perfil e devolve o caminho-base, sem extensão. O nível concreto
 * é escolhido na leitura, conforme o que o banco autorizar.
 *
 * O navegador entrega SÓ o original. Os níveis velados são gerados pela Edge
 * Function `velar`, com service_role — e a política do Storage recusa qualquer
 * escrita do cliente em `-0..3.jpg`. Antes a pirâmide era feita aqui, o que
 * deixava quem sobe escolher o conteúdo do próprio borrão e se revelar mais
 * cedo do que a conversa merecia.
 *
 * Se a geração falhar, o original é apagado e o erro sobe. É de propósito:
 * meio caminho aqui significaria um retrato sem véu para quem ainda não tem
 * direito a ele, e é melhor não ter foto do que ter a foto errada.
 */
export async function uploadProfilePhoto(file: File, userId: string): Promise<string> {
  if (!supabaseEnabled) return readImageAsDataUrl(file, 720);

  const img = await carregar(file);
  const base = `${userId}/perfil/${Date.now()}`;
  const caminhoOriginal = `${base}-${sufixo(NIVEL_ORIGINAL)}.jpg`;
  const db = requireSupabase();

  const original = await renderizar(img, 720, 0.85);
  const { error } = await db.storage.from(BUCKET).upload(caminhoOriginal, original, {
    contentType: 'image/jpeg', upsert: true,
  });
  if (error) throw new Error(`Falha ao enviar a imagem: ${error.message}`);

  const { data, error: erroVeu } = await db.functions.invoke('velar', { body: { base } });
  if (erroVeu || !(data as { ok?: boolean } | null)?.ok) {
    await db.storage.from(BUCKET).remove([caminhoOriginal]);
    throw new Error('Não foi possível preparar o véu da sua foto. Tente de novo.');
  }
  return base;
}

/** Imagem trocada dentro da conversa: enviada de propósito, sem pirâmide. */
export async function uploadChatImage(file: File, userId: string): Promise<string> {
  if (!supabaseEnabled) return readImageAsDataUrl(file, 900);
  const img = await carregar(file);
  const blob = await renderizar(img, 900, 0.85);
  const caminho = `${userId}/conversa/${Date.now()}.jpg`;
  const { error } = await requireSupabase().storage
    .from(BUCKET).upload(caminho, blob, { contentType: 'image/jpeg', upsert: true });
  if (error) throw new Error(`Falha ao enviar a imagem: ${error.message}`);
  return caminho;
}

const cache = new Map<string, { url: string; expira: number }>();

async function assinar(caminho: string): Promise<string | undefined> {
  const agora = Date.now();
  const emCache = cache.get(caminho);
  if (emCache && emCache.expira > agora) return emCache.url;

  const { data, error } = await requireSupabase().storage
    .from(BUCKET).createSignedUrl(caminho, URL_TTL_SEGUNDOS);
  if (error || !data) return undefined;

  cache.set(caminho, { url: data.signedUrl, expira: agora + (URL_TTL_SEGUNDOS - 60) * 1000 });
  return data.signedUrl;
}

/**
 * Resolve a imagem exibível.
 *
 * Pede o ORIGINAL primeiro. A descida pelos níveis continua como rede de
 * segurança para fotos antigas cujo original possa não estar no bucket.
 *
 * ATENÇÃO ao mexer aqui: foi esta descida que escondeu o bug da 019 por
 * semanas. Ela transforma "o banco me negou" em "achei uma versão pior", sem
 * erro nenhum. Se um dia a foto voltar a aparecer borrada, é aqui que o
 * sintoma some — e a causa vai estar na política do Storage, não neste laço.
 */
export async function resolveImage(caminho?: string): Promise<string | undefined> {
  if (!caminho) return undefined;
  if (caminho.startsWith('data:') || caminho.startsWith('http')) return caminho;
  if (!supabaseEnabled) return caminho;

  // Caminho completo (imagem de conversa) já tem extensão.
  if (caminho.endsWith('.jpg')) return assinar(caminho);

  for (let nivel = NIVEL_ORIGINAL; nivel >= 0; nivel--) {
    const url = await assinar(`${caminho}-${sufixo(nivel)}.jpg`);
    if (url) return url;
  }
  return undefined;
}

export async function removeImage(caminho?: string): Promise<void> {
  if (!caminho || !supabaseEnabled || caminho.startsWith('data:')) return;
  const alvos = caminho.endsWith('.jpg')
    ? [caminho]
    : [0, 1, 2, 3, NIVEL_ORIGINAL].map((n) => `${caminho}-${sufixo(n)}.jpg`);
  await requireSupabase().storage.from(BUCKET).remove(alvos);
}
