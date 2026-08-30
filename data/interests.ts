export interface Interest {
  id: string;
  label: string;
  emoji: string;
  category: string;
  /** Peso de raridade: interesses mais específicos valem mais quando batem. */
  weight: number;
}

export const INTERESTS: Interest[] = [
  { id: 'viagens', label: 'Viagens', emoji: '✈️', category: 'Mundo', weight: 1.0 },
  { id: 'trilhas', label: 'Trilhas', emoji: '🥾', category: 'Mundo', weight: 1.25 },
  { id: 'praia', label: 'Praia', emoji: '🏖️', category: 'Mundo', weight: 1.0 },
  { id: 'acampar', label: 'Acampar', emoji: '⛺', category: 'Mundo', weight: 1.35 },
  { id: 'road_trip', label: 'Road trip', emoji: '🚗', category: 'Mundo', weight: 1.25 },

  { id: 'musica', label: 'Música', emoji: '🎵', category: 'Sons', weight: 0.85 },
  { id: 'shows', label: 'Shows ao vivo', emoji: '🎤', category: 'Sons', weight: 1.1 },
  { id: 'vinil', label: 'Vinil', emoji: '💿', category: 'Sons', weight: 1.4 },
  { id: 'instrumento', label: 'Tocar instrumento', emoji: '🎸', category: 'Sons', weight: 1.35 },
  { id: 'samba', label: 'Samba e pagode', emoji: '🥁', category: 'Sons', weight: 1.2 },
  { id: 'mpb', label: 'MPB', emoji: '🎼', category: 'Sons', weight: 1.2 },

  { id: 'gastronomia', label: 'Gastronomia', emoji: '🍝', category: 'Sabores', weight: 0.95 },
  { id: 'cozinhar', label: 'Cozinhar', emoji: '👨‍🍳', category: 'Sabores', weight: 1.15 },
  { id: 'cafe', label: 'Café', emoji: '☕', category: 'Sabores', weight: 1.0 },
  { id: 'vinho', label: 'Vinho', emoji: '🍷', category: 'Sabores', weight: 1.15 },
  { id: 'feira', label: 'Feira livre', emoji: '🥬', category: 'Sabores', weight: 1.35 },
  { id: 'confeitaria', label: 'Confeitaria', emoji: '🧁', category: 'Sabores', weight: 1.3 },

  { id: 'cinema', label: 'Cinema', emoji: '🎬', category: 'Cultura', weight: 0.85 },
  { id: 'series', label: 'Séries', emoji: '📺', category: 'Cultura', weight: 0.8 },
  { id: 'livros', label: 'Livros', emoji: '📚', category: 'Cultura', weight: 1.05 },
  { id: 'teatro', label: 'Teatro', emoji: '🎭', category: 'Cultura', weight: 1.35 },
  { id: 'museus', label: 'Museus', emoji: '🖼️', category: 'Cultura', weight: 1.25 },
  { id: 'poesia', label: 'Poesia', emoji: '✒️', category: 'Cultura', weight: 1.45 },
  { id: 'podcasts', label: 'Podcasts', emoji: '🎧', category: 'Cultura', weight: 1.0 },

  { id: 'corrida', label: 'Corrida', emoji: '🏃', category: 'Movimento', weight: 1.05 },
  { id: 'academia', label: 'Academia', emoji: '🏋️', category: 'Movimento', weight: 0.9 },
  { id: 'yoga', label: 'Yoga', emoji: '🧘', category: 'Movimento', weight: 1.2 },
  { id: 'danca', label: 'Dança', emoji: '💃', category: 'Movimento', weight: 1.2 },
  { id: 'futebol', label: 'Futebol', emoji: '⚽', category: 'Movimento', weight: 0.9 },
  { id: 'surf', label: 'Surf', emoji: '🏄', category: 'Movimento', weight: 1.4 },
  { id: 'ciclismo', label: 'Ciclismo', emoji: '🚴', category: 'Movimento', weight: 1.2 },
  { id: 'escalada', label: 'Escalada', emoji: '🧗', category: 'Movimento', weight: 1.45 },

  { id: 'animais', label: 'Animais', emoji: '🐶', category: 'Casa', weight: 0.9 },
  { id: 'plantas', label: 'Plantas', emoji: '🪴', category: 'Casa', weight: 1.15 },
  { id: 'jogos', label: 'Jogos', emoji: '🎮', category: 'Casa', weight: 1.0 },
  { id: 'boardgames', label: 'Jogos de tabuleiro', emoji: '🎲', category: 'Casa', weight: 1.35 },
  { id: 'marcenaria', label: 'Fazer com as mãos', emoji: '🔨', category: 'Casa', weight: 1.45 },

  { id: 'fotografia', label: 'Fotografia', emoji: '📷', category: 'Criação', weight: 1.2 },
  { id: 'desenho', label: 'Desenho', emoji: '🎨', category: 'Criação', weight: 1.3 },
  { id: 'escrita', label: 'Escrita', emoji: '📝', category: 'Criação', weight: 1.35 },
  { id: 'moda', label: 'Moda', emoji: '👗', category: 'Criação', weight: 1.15 },

  { id: 'ciencia', label: 'Ciência', emoji: '🔬', category: 'Mente', weight: 1.3 },
  { id: 'tecnologia', label: 'Tecnologia', emoji: '💻', category: 'Mente', weight: 0.95 },
  { id: 'filosofia', label: 'Filosofia', emoji: '🧠', category: 'Mente', weight: 1.45 },
  { id: 'historia', label: 'História', emoji: '🏛️', category: 'Mente', weight: 1.3 },
  { id: 'idiomas', label: 'Idiomas', emoji: '🗣️', category: 'Mente', weight: 1.25 },
  { id: 'voluntariado', label: 'Voluntariado', emoji: '🤝', category: 'Mente', weight: 1.4 },
  { id: 'astronomia', label: 'Astronomia', emoji: '🔭', category: 'Mente', weight: 1.5 },
];

export const INTEREST_MAP: Record<string, Interest> = Object.fromEntries(
  INTERESTS.map((i) => [i.id, i]),
);

export const INTEREST_CATEGORIES = Array.from(new Set(INTERESTS.map((i) => i.category)));

export function interestLabel(id: string): string {
  const i = INTEREST_MAP[id];
  return i ? `${i.emoji} ${i.label}` : id;
}
