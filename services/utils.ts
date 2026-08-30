export const clamp = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v));

/**
 * Identificador legível, para coisas que vivem só no navegador (avisos na tela).
 *
 * NÃO use para nada que vá ao Postgres: as tabelas declaram `id uuid` e um
 * `msg_m4x2abc` é recusado no insert. Para entidades do domínio use `newId()`.
 */
export const uid = (prefix = 'id'): string =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/**
 * Identificador de entidade do domínio: mensagem, conexão, denúncia.
 *
 * Precisa ser UUID de verdade. O cliente gera o id antes de escrever, porque a
 * escrita é otimista — a tela mostra a mensagem na hora e o servidor recebe
 * depois. Se o formato não bate com a coluna, o Postgres recusa e a pessoa vê a
 * mensagem na tela sem que ela exista para ninguém.
 */
export const newId = (): string =>
  globalThis.crypto?.randomUUID?.() ?? uuidV4Manual();

/** Reserva para contexto sem `randomUUID` (http, WebView antiga). */
function uuidV4Manual(): string {
  const b = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40; // versão 4
  b[8] = (b[8] & 0x3f) | 0x80; // variante RFC 4122
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Hash determinístico (FNV-1a 32 bits) — usado na curadoria e nos retratos. */
export function hash32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** PRNG determinístico a partir de uma semente textual. */
export function seededRandom(seed: string): () => number {
  let s = hash32(seed) || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 0xffffffff;
  };
}

export const dateKey = (d: Date = new Date()): string => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export function age(birthDate: string): number {
  const b = new Date(birthDate);
  const now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) a--;
  return a;
}

/** Distância aproximada em km entre duas coordenadas já arredondadas. */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

/** Nunca exibimos distância exata: sempre uma faixa. */
export function distanceBand(km: number): string {
  if (km <= 5) return 'pertinho';
  if (km <= 15) return 'até 15 km';
  if (km <= 30) return 'até 30 km';
  if (km <= 60) return 'até 60 km';
  if (km <= 150) return 'até 150 km';
  return 'mais de 150 km';
}

/** Arredonda coordenada para ~0,05° (≈5 km) antes de persistir. */
export const blurCoord = (v: number): number => Math.round(v * 20) / 20;

export async function sha256(text: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  return `plain:${hash32(text).toString(16)}`;
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'agora';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'ontem';
  if (d < 7) return `${d} dias`;
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

export const clockTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export const dayLabel = (iso: string): string => {
  const d = new Date(iso);
  const today = dateKey();
  const yest = dateKey(new Date(Date.now() - 86400000));
  const k = dateKey(d);
  if (k === today) return 'Hoje';
  if (k === yest) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
};

export const initials = (name: string): string =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');

export const firstName = (name: string): string => name.trim().split(/\s+/)[0] ?? name;

export function pick<T>(arr: T[], rnd: () => number): T {
  return arr[Math.floor(rnd() * arr.length) % arr.length];
}

export function shuffle<T>(arr: T[], rnd: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
