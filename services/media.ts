import { requireSupabase, supabaseEnabled } from './supabaseClient';
import { readImageAsDataUrl } from './storage';
import { clamp } from './utils';

// ---------------------------------------------------------------------------
// Imagens e o Véu.
//
// O Véu NÃO é blur de CSS. Cada foto de perfil vira uma pirâmide de resoluções,
// e o banco decide qual nível você tem direito de baixar, a partir do estágio
// real da conversa entre vocês (ver private.nivel_permitido em docs/SUPABASE.sql).
//
// Por que resolução em vez de desfoque: um arquivo de 12 pixels de largura não
// tem detalhe a recuperar — a informação não está nos bytes. Um JPEG desfocado
// ainda carrega mais do que parece, e quem tivesse a URL poderia tentar
// reconstruir. O desfoque de CSS continua, mas agora é só suavização visual
// por cima de uma imagem que já não contém o rosto.
//
// Modo demo (sem backend) guarda um dataURL só e o véu volta a ser cosmético:
// não há servidor para fazer valer o portão, e isso está documentado na UI.
// ---------------------------------------------------------------------------

const BUCKET = 'midia';
const URL_TTL_SEGUNDOS = 60 * 60;

/** Larguras dos níveis velados. O nível 4 é o original. */
const LARGURAS_VELADAS = [12, 24, 48, 96];
export const NIVEL_ORIGINAL = 4;

/** Qual nível da pirâmide corresponde a um `reveal` de 0..1. */
export function nivelDoReveal(reveal: number): number {
  const r = clamp(reveal);
  if (r >= 0.999) return NIVEL_ORIGINAL;
  if (r >= 0.756) return 3;
  if (r >= 0.488) return 2;
  if (r >= 0.244) return 1;
  return 0;
}

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
 * Sobe a foto de perfil como pirâmide e devolve o caminho-base, sem extensão.
 * O nível concreto é escolhido na leitura, conforme o que o banco autorizar.
 *
 * Os níveis velados são gerados aqui, no navegador. Quem sobe pode, em tese,
 * mandar um "nível 0" mais nítido do que devia — mas é a foto dele mesmo, e o
 * único efeito é se revelar mais cedo. O que ninguém consegue é ver a foto de
 * OUTRA pessoa antes da hora: isso o Storage não deixa, e é o que importa.
 */
export async function uploadProfilePhoto(file: File, userId: string): Promise<string> {
  if (!supabaseEnabled) return readImageAsDataUrl(file, 720);

  const img = await carregar(file);
  const base = `${userId}/perfil/${Date.now()}`;
  const db = requireSupabase();

  const partes: { nivel: number; blob: Blob }[] = [
    ...await Promise.all(
      LARGURAS_VELADAS.map(async (largura, nivel) => ({
        nivel, blob: await renderizar(img, largura, 0.7),
      })),
    ),
    { nivel: NIVEL_ORIGINAL, blob: await renderizar(img, 720, 0.85) },
  ];

  for (const { nivel, blob } of partes) {
    const { error } = await db.storage
      .from(BUCKET)
      .upload(`${base}-${sufixo(nivel)}.jpg`, blob, {
        contentType: 'image/jpeg', upsert: true,
      });
    if (error) throw new Error(`Falha ao enviar a imagem: ${error.message}`);
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
 * Resolve a imagem exibível. Para foto de perfil pede o nível correspondente ao
 * `reveal` e, se o servidor recusar, desce um degrau — o portão é do banco, e o
 * cliente apenas obedece ao que ele devolve.
 */
export async function resolveImage(caminho?: string, reveal = 1): Promise<string | undefined> {
  if (!caminho) return undefined;
  if (caminho.startsWith('data:') || caminho.startsWith('http')) return caminho;
  if (!supabaseEnabled) return caminho;

  // Caminho completo (imagem de conversa) já tem extensão.
  if (caminho.endsWith('.jpg')) return assinar(caminho);

  for (let nivel = nivelDoReveal(reveal); nivel >= 0; nivel--) {
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
