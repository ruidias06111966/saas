// ---------------------------------------------------------------------------
// A escada de perguntas.
//
// Substitui `data/prompts.ts`, que era a escada dos "Rituais de Conversa" do
// app de relacionamentos — perguntas que iam de "qual seu café da manhã" a "do
// que você tem medo". A mecânica sobrevive ao pivô; o assunto não.
//
// Aqui a escada sobe pelo COMPROMISSO, não pela intimidade. O nível 1 é
// curiosidade profissional; o 4 é o que se pergunta quando já se está quase
// fechando. Quem pula direto para o nível 4 numa primeira mensagem assusta —
// exatamente como no outro app, por motivo diferente.
// ---------------------------------------------------------------------------

export interface PerguntaDaEscada {
  level: 1 | 2 | 3 | 4;
  text: string;
}

export const LADDER: PerguntaDaEscada[] = [
  // Nível 1 — quebrar o gelo sem custo nenhum para quem responde.
  { level: 1, text: 'Há quanto tempo você trabalha com isso?' },
  { level: 1, text: 'Você atende mais empresa ou pessoa física?' },
  { level: 1, text: 'Como costuma ser o primeiro contato no seu trabalho?' },
  { level: 1, text: 'Você atende só aqui na região ou também a distância?' },

  // Nível 2 — entender o serviço de verdade.
  { level: 2, text: 'Qual foi o trabalho mais difícil que você entregou este ano?' },
  { level: 2, text: 'O que costuma dar errado nesse tipo de serviço?' },
  { level: 2, text: 'Como você prefere que o cliente te passe as informações?' },
  { level: 2, text: 'Tem algum tipo de trabalho que você prefere não pegar?' },

  // Nível 3 — as perguntas que separam quem sabe de quem improvisa.
  { level: 3, text: 'Como você cobra: valor fechado, por hora ou por etapa?' },
  { level: 3, text: 'O que você precisa de mim para começar?' },
  { level: 3, text: 'Se o prazo apertar, o que você corta primeiro?' },
  { level: 3, text: 'Já aconteceu de um cliente te procurar com o serviço já começado errado? Como resolveu?' },

  // Nível 4 — já é negociação.
  { level: 4, text: 'Consegue me passar uma referência de cliente que eu possa consultar?' },
  { level: 4, text: 'Como fica o pagamento: entrada, parcelas, na entrega?' },
  { level: 4, text: 'O que exatamente está incluído, e o que ficaria de fora?' },
  { level: 4, text: 'Se precisarmos de ajuste depois da entrega, como funciona?' },
];
