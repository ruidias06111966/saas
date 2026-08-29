import type { AppState } from '../state/appState';
import { STORAGE_KEY } from '../constants';

// ---------------------------------------------------------------------------
// Persistência do MVP: localStorage.
// Esta é a ÚNICA camada que muda ao plugar o Supabase (ver docs/SUPABASE.sql).
// Nada aqui é seguro para produção — é um substituto de banco para demonstração.
// ---------------------------------------------------------------------------

export function loadState(): AppState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppState;
    if (!parsed || !Array.isArray(parsed.users)) return null;
    return parsed;
  } catch {
    return null;
  }
}

let queued: number | null = null;

export function saveState(state: AppState): void {
  if (queued !== null) window.clearTimeout(queued);
  queued = window.setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      // Cota estourada costuma ser foto em base64. Avisa e segue sem quebrar.
      console.warn('[storage] Não foi possível salvar o estado.', err);
    }
  }, 250);
}

export function clearState(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/** Lê um arquivo de imagem como dataURL, redimensionando para caber no storage. */
export function readImageAsDataUrl(file: File, maxSize = 720): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('Arquivo não é uma imagem.'));
    if (file.size > 8 * 1024 * 1024) return reject(new Error('Imagem acima de 8 MB.'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Imagem inválida.'));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas indisponível.'));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
