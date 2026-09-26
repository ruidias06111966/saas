import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NIVEL_ORIGINAL, sufixo } from '../services/media';

// ---------------------------------------------------------------------------
// Uma foto, um arquivo.
//
// O envio da foto de perfil gravava CINCO arquivos: o original e quatro
// versões borradas, geradas pela Edge Function `velar`. Era a pirâmide do
// véu do app de relacionamentos — a foto ia sendo revelada conforme a
// conversa avançava.
//
// A migração 019 acabou com o véu: num mercado de serviços o rosto de quem
// presta serviço é credencial, e quem contrata precisa ver ANTES de decidir.
// Só que o envio continuou gerando os quatro borrões que ninguém mais lê. E
// pior: se a geração falhasse, o cliente APAGAVA o original que já tinha
// gravado e recusava o envio inteiro. Um passo que não protegia mais nada
// tinha poder de veto sobre o envio da foto.
//
// POR QUE ISTO NÃO MUDOU NENHUMA PERMISSÃO
//
// A política de escrita do Storage nunca deixou o dono gravar os níveis
// borrados — só `-orig.jpg`. Os quatro borrões só existiam porque a `velar`
// escrevia com a chave de serviço. Tirar a chamada tira quatro arquivos
// inúteis; não abre nem fecha nenhuma porta. Estes testes provam isso lendo
// a política do próprio repositório, e não a minha palavra.
//
// O QUE ESTES TESTES NÃO PROVAM
//
// Não sobe foto nenhuma. Não há navegador aqui: `FileReader`, `Image` e
// `canvas.toBlob` não existem em Node, e exercitar o caminho online de
// verdade criaria dados na produção. Isto guarda a ESTRUTURA do envio e o
// acordo entre o nome que o cliente monta e a regra que o banco aplica.
// Verificar o código não é verificar o app.
// ---------------------------------------------------------------------------

const RAIZ = new URL('..', import.meta.url).pathname;
const ler = (p: string) => readFileSync(join(RAIZ, p), 'utf8');

const media = ler('services/media.ts');

/**
 * Recorta o corpo de uma função exportada de `services/media.ts`.
 *
 * Fecha no primeiro `}` na COLUNA ZERO — o fecho da própria função. Um
 * recorte por número de caracteres já passou um teste por acidente nesta
 * base, encontrando no vizinho o que devia achar aqui dentro.
 */
function corpoDe(nome: string): string {
  const abre = media.indexOf(`export async function ${nome}`);
  expect(abre, `não achei \`${nome}\` em services/media.ts`).toBeGreaterThan(-1);
  const fecha = media.indexOf('\n}', abre);
  expect(fecha, `não achei o fim de \`${nome}\``).toBeGreaterThan(abre);
  return media.slice(abre, fecha + 2);
}

describe('o envio da foto de perfil grava um arquivo, e não cinco', () => {
  const corpo = corpoDe('uploadProfilePhoto');

  it('não chama mais nenhuma Edge Function', () => {
    // Era `functions.invoke('velar', …)`. Nenhuma função de borda participa
    // mais do envio da foto.
    expect(corpo).not.toMatch(/functions\s*\.\s*invoke/);
    expect(corpo).not.toContain('velar');
  });

  it('faz UM upload, só', () => {
    expect(corpo.match(/\.upload\(/g) ?? []).toHaveLength(1);
  });

  it('não apaga o que acabou de gravar', () => {
    // O desfazer era a parte pior: a foto ia para o bucket e era removida
    // porque um passo seguinte, que não protegia nada, falhou.
    expect(corpo).not.toMatch(/\.remove\(|removeImage/);
  });

  it('o que ele grava é o original', () => {
    expect(corpo).toContain('sufixo(NIVEL_ORIGINAL)');
  });
});

describe('o nome que o cliente monta é o que a política do Storage aceita', () => {
  // A política de escrita mora em docs/SUPABASE.sql e está aplicada no banco.
  // Se o cliente mudar o nome do arquivo sem que ela mude, o envio começa a
  // dar 403 — ou, pior, o cliente passa a escrever um nome que a política
  // permite mas ninguém lê.
  const sql = ler('docs/SUPABASE.sql');
  const politica = sql.slice(
    sql.indexOf('create policy "dono envia só o original ou imagem de conversa"'),
  );
  const trecho = politica.slice(0, politica.indexOf(');'));

  /** A regex que o Postgres aplica ao nome de uma foto de perfil. */
  const exigida = (() => {
    const m = trecho.match(/\[2\] = 'perfil' and name ~ '([^']+)'/);
    expect(m, 'não achei a regra de nome da foto de perfil na política').not.toBeNull();
    // No SQL a barra invertida é literal; em JS precisa sobreviver ao parser.
    return new RegExp(m![1]);
  })();

  const caminho = (nivel: number) => `abc/perfil/1700000000000-${sufixo(nivel)}.jpg`;

  it('o original passa', () => {
    expect(exigida.test(caminho(NIVEL_ORIGINAL))).toBe(true);
  });

  it.each([0, 1, 2, 3])('o nível velado %i NUNCA pôde ser escrito pelo dono', (nivel) => {
    // Isto é o argumento inteiro: os borrões só nasciam pela chave de serviço,
    // dentro da `velar`. Tirar a chamada não devolveu nem tomou permissão de
    // ninguém.
    expect(exigida.test(caminho(nivel))).toBe(false);
  });

  it('a política continua exigindo que a pasta seja a de quem envia', () => {
    expect(trecho).toContain("(storage.foldername(name))[1] = auth.uid()::text");
  });
});

describe('as fotos enviadas antes desta mudança continuam sendo apagáveis', () => {
  // Há 4 fotos no bucket com 4 borrões cada (16 arquivos). Se `removeImage`
  // passar a pedir só o original, esses 16 ficam órfãos para sempre: o dono
  // troca de foto, a antiga "sai" da tela e o arquivo fica.
  const corpo = corpoDe('removeImage');

  it('removeImage ainda pede os cinco nomes', () => {
    expect(corpo).toContain('[0, 1, 2, 3, NIVEL_ORIGINAL]');
  });
});

describe('a descida de níveis segue existindo como rede de segurança', () => {
  const corpo = corpoDe('resolveImage');

  it('resolveImage começa no original', () => {
    // Começar por baixo é exactamente o bug da 019: entrega a versão pior e
    // não registra erro nenhum.
    expect(corpo).toMatch(/for \(let nivel = NIVEL_ORIGINAL; nivel >= 0; nivel--\)/);
  });
});
