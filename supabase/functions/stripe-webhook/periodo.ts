// ---------------------------------------------------------------------------
// Onde fica o fim do período de uma assinatura do Stripe.
//
// Este arquivo existe separado por dois motivos. O primeiro é que a regra é
// sutil o bastante para merecer teste, e o webhook em si não é testável fora do
// Deno. O segundo é que ela não depende do SDK do Stripe — só do formato do
// dado — então descrever aqui só o que interessa deixa o teste possível de rodar
// junto com os outros.
//
// A REGRA
// O Stripe serializa cada evento na versão de API do ENDPOINT do webhook, que
// não é a versão que o SDK usa para chamar a API. Da versão `basil`
// (2025-04-30) em diante, `current_period_end` saiu da assinatura e passou a
// viver em cada item dela. Ler os dois lugares mantém isto correto nas duas
// serializações, em vez de depender de uma configuração que ninguém lembra de
// conferir — foi exatamente assim que a data de renovação chegou nula no
// primeiro pagamento de verdade.
// ---------------------------------------------------------------------------

/** Só o pedaço da assinatura que interessa aqui. */
export interface AssinaturaComPeriodo {
  items?: { data?: Array<{ current_period_end?: number | null }> } | null;
  current_period_end?: number | null;
}

/** Segundos desde a época, ou null quando o evento não diz. */
export function fimDoPeriodo(assin: AssinaturaComPeriodo): number | null {
  const doItem = assin.items?.data?.[0]?.current_period_end;
  const legado = assin.current_period_end;
  return doItem ?? legado ?? null;
}
