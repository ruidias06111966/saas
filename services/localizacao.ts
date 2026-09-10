// ---------------------------------------------------------------------------
// De onde a pessoa é — e por que isto virou um arquivo só.
//
// A distância entre duas pessoas é medida por coordenada, não pelo nome da
// cidade. E a coordenada nunca é pedida: ela é DEDUZIDA do que a pessoa
// escreveu no campo "Cidade". Isso funciona bem — desde que a dedução acerte.
//
// A dedução morava dentro de screens/Signup.tsx, com quinze cidades e busca
// por igualdade exata de texto. Duas consequências, as duas medidas em
// produção antes deste arquivo existir:
//
//   1. ACENTO DECIDIA A LOCALIZAÇÃO. Das três contas reais, as três eram de
//      Brasília. Quem escreveu "BrasíLia" caiu em Brasília; quem escreveu
//      "Brasilia" e "brasilia" foi parar em São Paulo, a 870 km de casa.
//   2. QUALQUER CIDADE FORA DAS QUINZE virava São Paulo, calada. O Brasil tem
//      5.570 municípios; a lista cobria 0,27% deles.
//
// O efeito não aparece em lugar nenhum da tela: o perfil continua dizendo
// "Brasília", porque o NOME é guardado certo. Só a coordenada está errada — e
// é ela que decide quem aparece para quem, e a faixa de distância mostrada no
// cartão. Uma pessoa de Brasília era oferecida a paulistanos e escondida dos
// vizinhos, sem nada na interface que denunciasse o engano.
//
// AS TRÊS DECISÕES DAQUI
//
//   * O nome é normalizado antes da busca: acento, caixa e espaço repetido
//     deixam de decidir. "BRASILIA", "Brasília" e " brasilia " são a mesma
//     chave.
//   * Cidade desconhecida cai na CAPITAL DA UF, não em São Paulo. A UF é
//     escolhida numa lista fechada, então é sempre confiável — e a capital do
//     estado certo erra por quilômetros, enquanto São Paulo erra por milhares.
//   * A tabela é uma lista só, e dela saem o mapa de busca e a lista de
//     sugestões. Não há duas cópias para divergirem.
// ---------------------------------------------------------------------------

/** As 27 unidades da federação, na ordem em que aparecem no formulário. */
export const UFS = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB',
  'PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
] as const;

export type UF = (typeof UFS)[number];

/**
 * Tira acento, caixa e espaço repetido. É o que transforma "  BrasíLia " e
 * "brasilia" na mesma chave.
 *
 * A decomposição NFD separa a letra do acento, e a faixa ̀-ͯ é
 * exatamente a dos acentos combinantes — usada no lugar de `\p{Diacritic}`
 * porque não depende de suporte a propriedades Unicode no regex.
 */
export function normalizarCidade(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Capitais das 27 UFs. É o destino de quem escreve uma cidade que não está na
 * tabela abaixo — o que, no Brasil, é a maioria dos casos.
 */
const CAPITAIS: Record<UF, [number, number]> = {
  AC: [-9.97, -67.81],  AL: [-9.67, -35.74],  AP: [0.03, -51.07],
  AM: [-3.12, -60.02],  BA: [-12.97, -38.50], CE: [-3.73, -38.52],
  DF: [-15.79, -47.88], ES: [-20.32, -40.34], GO: [-16.68, -49.25],
  MA: [-2.53, -44.30],  MT: [-15.60, -56.10], MS: [-20.44, -54.65],
  MG: [-19.92, -43.94], PA: [-1.46, -48.50],  PB: [-7.12, -34.86],
  PR: [-25.43, -49.27], PE: [-8.05, -34.88],  PI: [-5.09, -42.80],
  RJ: [-22.91, -43.17], RN: [-5.79, -35.21],  RS: [-30.03, -51.23],
  RO: [-8.76, -63.90],  RR: [2.82, -60.67],   SC: [-27.60, -48.55],
  SP: [-23.55, -46.63], SE: [-10.91, -37.07], TO: [-10.18, -48.33],
};

/**
 * As cidades que o campo sugere e reconhece pelo nome próprio: as 27 capitais
 * mais os municípios grandes de cada região. Quem mora fora desta lista ainda
 * cai na capital da própria UF, que é uma aproximação honesta.
 *
 * Escrita com acento de propósito: é daqui que sai a lista de sugestões que a
 * pessoa lê. A chave de busca é derivada, nunca digitada duas vezes.
 */
const CIDADES: ReadonlyArray<readonly [string, UF, number, number]> = [
  ['Rio Branco', 'AC', -9.97, -67.81], ['Cruzeiro do Sul', 'AC', -7.63, -72.67],
  ['Maceió', 'AL', -9.67, -35.74], ['Arapiraca', 'AL', -9.75, -36.66],
  ['Macapá', 'AP', 0.03, -51.07], ['Santana', 'AP', -0.06, -51.18],
  ['Manaus', 'AM', -3.12, -60.02], ['Parintins', 'AM', -2.63, -56.74],
  ['Salvador', 'BA', -12.97, -38.50], ['Feira de Santana', 'BA', -12.27, -38.97],
  ['Vitória da Conquista', 'BA', -14.87, -40.84], ['Camaçari', 'BA', -12.70, -38.32],
  ['Fortaleza', 'CE', -3.73, -38.52], ['Caucaia', 'CE', -3.74, -38.65],
  ['Juazeiro do Norte', 'CE', -7.21, -39.32], ['Sobral', 'CE', -3.69, -40.35],
  ['Brasília', 'DF', -15.79, -47.88], ['Taguatinga', 'DF', -15.83, -48.06],
  ['Ceilândia', 'DF', -15.82, -48.11],
  ['Vitória', 'ES', -20.32, -40.34], ['Vila Velha', 'ES', -20.33, -40.29],
  ['Serra', 'ES', -20.13, -40.31], ['Cariacica', 'ES', -20.26, -40.42],
  ['Goiânia', 'GO', -16.68, -49.25], ['Aparecida de Goiânia', 'GO', -16.82, -49.24],
  ['Anápolis', 'GO', -16.33, -48.95],
  ['São Luís', 'MA', -2.53, -44.30], ['Imperatriz', 'MA', -5.53, -47.48],
  ['Cuiabá', 'MT', -15.60, -56.10], ['Várzea Grande', 'MT', -15.65, -56.13],
  ['Rondonópolis', 'MT', -16.47, -54.64],
  ['Campo Grande', 'MS', -20.44, -54.65], ['Dourados', 'MS', -22.22, -54.81],
  ['Belo Horizonte', 'MG', -19.92, -43.94], ['Uberlândia', 'MG', -18.91, -48.28],
  ['Contagem', 'MG', -19.93, -44.05], ['Juiz de Fora', 'MG', -21.76, -43.35],
  ['Betim', 'MG', -19.97, -44.20], ['Montes Claros', 'MG', -16.73, -43.86],
  ['Uberaba', 'MG', -19.75, -47.93],
  ['Belém', 'PA', -1.46, -48.50], ['Ananindeua', 'PA', -1.37, -48.37],
  ['Santarém', 'PA', -2.44, -54.71], ['Marabá', 'PA', -5.37, -49.12],
  ['João Pessoa', 'PB', -7.12, -34.86], ['Campina Grande', 'PB', -7.22, -35.88],
  ['Curitiba', 'PR', -25.43, -49.27], ['Londrina', 'PR', -23.31, -51.16],
  ['Maringá', 'PR', -23.42, -51.94], ['Ponta Grossa', 'PR', -25.09, -50.16],
  ['Cascavel', 'PR', -24.96, -53.46], ['Foz do Iguaçu', 'PR', -25.55, -54.59],
  ['Recife', 'PE', -8.05, -34.88], ['Jaboatão dos Guararapes', 'PE', -8.11, -35.01],
  ['Olinda', 'PE', -8.01, -34.86], ['Caruaru', 'PE', -8.28, -35.98],
  ['Petrolina', 'PE', -9.39, -40.50],
  ['Teresina', 'PI', -5.09, -42.80], ['Parnaíba', 'PI', -2.90, -41.78],
  ['Rio de Janeiro', 'RJ', -22.91, -43.17], ['Niterói', 'RJ', -22.88, -43.10],
  ['São Gonçalo', 'RJ', -22.83, -43.05], ['Duque de Caxias', 'RJ', -22.79, -43.31],
  ['Nova Iguaçu', 'RJ', -22.76, -43.45], ['Campos dos Goytacazes', 'RJ', -21.75, -41.33],
  ['Petrópolis', 'RJ', -22.51, -43.18], ['Volta Redonda', 'RJ', -22.52, -44.10],
  ['Natal', 'RN', -5.79, -35.21], ['Mossoró', 'RN', -5.19, -37.34],
  ['Parnamirim', 'RN', -5.92, -35.26],
  ['Porto Alegre', 'RS', -30.03, -51.23], ['Caxias do Sul', 'RS', -29.17, -51.18],
  ['Pelotas', 'RS', -31.77, -52.34], ['Canoas', 'RS', -29.92, -51.18],
  ['Santa Maria', 'RS', -29.68, -53.81], ['Gravataí', 'RS', -29.94, -50.99],
  ['Porto Velho', 'RO', -8.76, -63.90], ['Ji-Paraná', 'RO', -10.88, -61.95],
  ['Boa Vista', 'RR', 2.82, -60.67],
  ['Florianópolis', 'SC', -27.60, -48.55], ['Joinville', 'SC', -26.30, -48.85],
  ['Blumenau', 'SC', -26.92, -49.07], ['São José', 'SC', -27.59, -48.63],
  ['Chapecó', 'SC', -27.10, -52.62], ['Criciúma', 'SC', -28.68, -49.37],
  ['Itajaí', 'SC', -26.91, -48.66],
  ['São Paulo', 'SP', -23.55, -46.63], ['Campinas', 'SP', -22.90, -47.06],
  ['Santo André', 'SP', -23.66, -46.53], ['Guarulhos', 'SP', -23.45, -46.53],
  ['Osasco', 'SP', -23.53, -46.79], ['São Bernardo do Campo', 'SP', -23.69, -46.56],
  ['Sorocaba', 'SP', -23.50, -47.45], ['Ribeirão Preto', 'SP', -21.18, -47.81],
  ['São José dos Campos', 'SP', -23.18, -45.89], ['Santos', 'SP', -23.96, -46.33],
  ['Jundiaí', 'SP', -23.19, -46.88], ['Piracicaba', 'SP', -22.73, -47.65],
  ['Bauru', 'SP', -22.31, -49.06], ['São José do Rio Preto', 'SP', -20.81, -49.38],
  ['Aracaju', 'SE', -10.91, -37.07], ['Nossa Senhora do Socorro', 'SE', -10.86, -37.13],
  ['Palmas', 'TO', -10.18, -48.33], ['Araguaína', 'TO', -7.19, -48.21],
];

/** Chave normalizada → coordenada. Derivado da tabela, nunca escrito à mão. */
const POR_NOME = new Map<string, [number, number]>(
  CIDADES.map(([nome, , lat, lng]) => [normalizarCidade(nome), [lat, lng]]),
);

/** Os nomes com acento, para a lista de sugestões do campo. */
export const NOMES_DE_CIDADE: string[] = CIDADES.map(([nome]) => nome);

/**
 * A coordenada aproximada de quem mora em `cidade`, no estado `uf`.
 *
 * Nunca falha: cidade conhecida devolve a dela, cidade desconhecida devolve a
 * capital da UF, e uma UF fora da lista — que o formulário não permite, mas
 * um dado antigo pode conter — devolve São Paulo como último recurso.
 */
export function coordenadasDe(cidade: string, uf: string): [number, number] {
  const exata = POR_NOME.get(normalizarCidade(cidade));
  if (exata) return exata;
  return CAPITAIS[uf?.toUpperCase() as UF] ?? CAPITAIS.SP;
}
