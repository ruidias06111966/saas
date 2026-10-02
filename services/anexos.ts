// ---------------------------------------------------------------------------
// OS FICHEIROS QUE A CONVERSA ACEITA — e os que não aceita.
//
// O PEDIDO: "na conversa não consegui anexar ficheiros"
//
// Não era defeito: nunca existiu. A conversa aceitava imagem e mais nada. Num
// mercado de serviços isso é uma falta real — orçamento, contrato, planta e nota
// fiscal viajam em PDF, não em foto.
//
// A ESCOLHA, QUE FOI DO DONO
//
// Três caminhos: só PDF, PDF e documentos, ou qualquer ficheiro. Ele escolheu o
// do meio. "Qualquer ficheiro" foi recusado com motivo: a plataforma passaria a
// carregar um programa de uma pessoa para outra, e quem o entregou seria o
// QICONEXÃO.
//
// ESTA LISTA NÃO É A GRADE — É A TERCEIRA DELAS
//
// Quem recusa de verdade é o servidor, em dois lugares: a policy de envio, que
// olha a EXTENSÃO, e o depósito, que olha o TIPO declarado (migração 030). Esta
// lista aqui existe para a pessoa saber ANTES de esperar o envio — e porque o
// seletor do celular precisa de saber o que oferecer.
//
// Um guarda de tela sozinho não guarda nada: contorna-se com uma ferramenta de
// navegador. Por isso ele nunca é o único, e por isso esta lista e a do servidor
// têm de dizer a mesma coisa — há teste a cobrar isso.
// ---------------------------------------------------------------------------

/** Um tipo aceito: como o navegador o chama, e como a pessoa o chama. */
export interface TipoAceito {
  extensao: string;
  mime: string;
  rotulo: string;
}

export const TIPOS_ACEITOS: readonly TipoAceito[] = [
  { extensao: 'pdf',  mime: 'application/pdf', rotulo: 'PDF' },
  { extensao: 'doc',  mime: 'application/msword', rotulo: 'Word' },
  { extensao: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', rotulo: 'Word' },
  { extensao: 'xls',  mime: 'application/vnd.ms-excel', rotulo: 'Excel' },
  { extensao: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', rotulo: 'Excel' },
] as const;

/**
 * O teto. É o MESMO das imagens, e de propósito: está escrito no manual, e um
 * número só é mais fácil de explicar do que dois.
 */
export const MAXIMO_BYTES = 8 * 1024 * 1024;

/** O que o seletor de ficheiros do aparelho deve oferecer. */
export const ACCEPT = TIPOS_ACEITOS
  .map((t) => `.${t.extensao}`)
  .concat(TIPOS_ACEITOS.map((t) => t.mime))
  .join(',');

/**
 * A extensão, em minúsculas e sem o ponto. Vazia se não houver.
 *
 * `lastIndexOf` e não um `split('.')[1]`: "Orçamento.v2.final.pdf" tem três
 * pontos, e o que vale é o último.
 */
export function extensaoDe(nome: string): string {
  const i = nome.lastIndexOf('.');
  return i < 0 ? '' : nome.slice(i + 1).toLowerCase();
}

/**
 * Este ficheiro pode ser enviado? Devolve o motivo quando não.
 *
 * Devolve uma FRASE e não um booleano porque a pessoa precisa de saber qual das
 * duas coisas falhou — tipo ou tamanho —, e "não deu" não ajuda ninguém.
 */
export function porQueNaoPosso(nome: string, bytes: number): string | null {
  const ext = extensaoDe(nome);
  if (!TIPOS_ACEITOS.some((t) => t.extensao === ext)) {
    const lista = [...new Set(TIPOS_ACEITOS.map((t) => t.rotulo))].join(', ');
    return `Este tipo de arquivo não é aceito. Pode enviar: ${lista} — e imagens, pelo botão de imagem.`;
  }
  if (bytes > MAXIMO_BYTES) {
    return `Este arquivo tem ${emMB(bytes)} e o limite é ${emMB(MAXIMO_BYTES)}.`;
  }
  if (bytes <= 0) return 'Este arquivo está vazio.';
  return null;
}

/** 2516582 → "2,4 MB". Vírgula decimal, que é como se lê em português. */
export function emMB(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb < 0.1) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${mb.toFixed(1).replace('.', ',')} MB`;
}

/**
 * O nome que vai para a tela — o original, mas domado.
 *
 * NÃO é o nome gravado no depósito: esse é um carimbo de tempo, de propósito.
 * Nome de ficheiro vindo de fora é texto de terceiro, e deixá-lo decidir o
 * caminho é como se escreve fora da própria pasta.
 *
 * Aqui corta-se a 120 caracteres (o mesmo teto da restrição do banco, migração
 * 030) e tiram-se as barras e quebras de linha, que num nome só servem para
 * fingir ser outra coisa.
 */
export function nomeParaMostrar(nome: string): string {
  const limpo = nome.replace(/[\\/\r\n\t]+/g, ' ').trim();
  if (limpo.length <= 120) return limpo || 'arquivo';
  // O corte preserva a extensão: um nome sem ela deixa de dizer o que é.
  const ext = extensaoDe(limpo);
  const sufixo = ext ? `….${ext}` : '…';
  return limpo.slice(0, 120 - sufixo.length) + sufixo;
}
