import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { moderateText, blocksSending } from '../services/moderation';

// ---------------------------------------------------------------------------
// "Em revisão" tem de significar que alguém vai revisar.
//
// O dono criou uma segunda conta e conversou de verdade — a primeira vez que
// duas pessoas usaram o sistema. Escreveu que combinariam o telefone pelo
// WhatsApp e a mensagem ganhou a etiqueta "em revisão", que nunca saiu.
//
// A mensagem tinha sido entregue e lida dois segundos depois. O que estava
// errado era a etiqueta, e de três formas:
//
//   • a fila de moderação tinha ZERO linhas e nenhum gatilho que a enchesse;
//   • o código que "enfileirava" só mexia na memória do navegador, e nem
//     poderia gravar: `moderation_queue` não tem política de INSERT;
//   • os DOIS lados viam a etiqueta, numa conversa normal.
//
// Some-se a isso a regra que disparou: `contato_externo`, herdada do app de
// relacionamentos, onde sair da plataforma era perigoso. Aqui combinar o
// telefone depois de uma proposta aceita é o OBJETIVO — existe uma função no
// banco só para revelar o contato.
// ---------------------------------------------------------------------------

const RAIZ = new URL('..', import.meta.url).pathname;
const ler = (p: string) => readFileSync(join(RAIZ, p), 'utf8');

describe('combinar o telefone não é suspeita neste produto', () => {
  const frase = 'ok, eu faço depois quando trocarmos numeros de celular no whatsapp';

  it('a mensagem do dono continua sendo reconhecida', () => {
    const r = moderateText(frase);
    expect(r.categories).toContain('contato_externo');
    expect(r.level).toBe('atencao');
  });

  it('mas isso nunca bloqueia o envio', () => {
    expect(blocksSending(moderateText(frase))).toBe(false);
  });

  it('e NÃO marca a mensagem — só `risco` marca', () => {
    // É o que faz a etiqueta sumir da conversa dos dois lados.
    const ctx = ler('state/AppContext.tsx');
    expect(ctx).toContain("result.level === 'risco' ? { moderation: result } : {}");
    expect(ctx).not.toContain("result.level !== 'ok' ? { moderation: result } : {}");
  });

  it('o conselho fala de registro, não de "não saia do app"', () => {
    const r = moderateText(frase);
    expect(r.advice).not.toMatch(/fora do app|remove suas prote/i);
    expect(r.advice).toMatch(/registrad|escrito|combinado/i);
  });

  it('quem escreve recebe o conselho mesmo sem etiqueta', () => {
    // Sem isto, tirar a etiqueta viraria tirar o aviso junto — e o conselho
    // é a única coisa útil que a regra ainda produz.
    const chat = ler('screens/Chat.tsx');
    const doSend = chat.slice(chat.indexOf('const doSend ='));
    const corpo = doSend.slice(0, doSend.indexOf('\n  };'));

    const iCondicao = corpo.indexOf("result.level === 'atencao'");
    expect(iCondicao, 'doSend não trata o nível `atencao`').toBeGreaterThan(-1);
    expect(corpo.indexOf('toast(result.advice', iCondicao),
      'o conselho não é mostrado nesse ramo').toBeGreaterThan(iCondicao);
  });
});

describe('o que é risco de verdade continua sendo tratado', () => {
  it.each([
    ['me manda um pix adiantado', 'financeiro'],
    ['sei onde você mora', 'assedio'],
  ])('%s continua nível risco', (texto, categoria) => {
    const r = moderateText(texto);
    expect(r.level).toBe('risco');
    expect(r.categories).toContain(categoria);
    expect(blocksSending(r)).toBe(true);
  });
});

describe('a fila de revisão existe de verdade', () => {
  const migracoes = readdirSync(join(RAIZ, 'supabase/migrations'))
    .filter((f) => f.endsWith('.sql')).sort()
    .map((f) => readFileSync(join(RAIZ, 'supabase/migrations', f), 'utf8'));
  const sql = migracoes.join('\n');

  it('um gatilho no banco enfileira, não o navegador', () => {
    // O navegador pode ser fechado no meio, pode falhar, pode esquecer. O
    // gatilho não — e a fila passa a refletir o que foi GRAVADO.
    expect(sql).toMatch(/create trigger enfileira_moderacao/);
    expect(sql).toMatch(/after insert on public\.messages/);
  });

  it('só enfileira `risco`', () => {
    const f = sql.slice(sql.indexOf('function private.enfileira_moderacao'));
    expect(f.slice(0, f.indexOf('$$;'))).toMatch(/mod_level is distinct from 'risco'/);
  });

  it('o cliente não tenta mais enfileirar sozinho', () => {
    const ctx = ler('state/AppContext.tsx');
    expect(ctx).not.toContain("type: 'ADD_MODERATION'");
  });

  it('a fila continua fechada para o cliente', () => {
    // Se alguém abrir INSERT em moderation_queue, o autor da mensagem passa a
    // poder forjar — ou omitir — a própria denúncia.
    expect(sql).toMatch(/tablename = 'moderation_queue' and cmd = 'INSERT'/);
    expect(sql).toMatch(/a fila não deve ser escrita pelo cliente/);
  });
});

describe('a decisão do revisor não pode sumir ao recarregar', () => {
  const admin = ler('screens/Admin.tsx');

  it('liberar e remover passam pelo servidor', () => {
    expect(admin).toContain('backend.decidirModeracao');
    expect(admin).not.toMatch(/onClick=\{\(\) => dispatch\(\{ type: 'UPDATE_MODERATION'/);
  });

  it('suspender a conta também', () => {
    // O botão "remover e suspender autor" vive no cartão da moderação. De nada
    // adiantaria a fila ser real se a suspensão voltasse sozinha.
    expect(admin).toContain('backend.definirStatusDaConta');
  });

  it('resolver denúncia também passa pelo servidor', () => {
    // Último dos três botões do painel que ainda só mexia na memória. Uma
    // denúncia marcada "procedente" voltava para "aberta" ao recarregar.
    expect(admin).toContain('backend.resolverDenuncia');
    expect(admin).not.toMatch(/resolveReport[\s\S]{0,200}^\s*dispatch\(\{ type: 'UPDATE_REPORT'/m);
  });

  it('a decisão guarda QUEM decidiu', () => {
    // Sem `resolved_by` o registro diz que foi decidido e não diz por quem —
    // metade do valor de um registro de moderação.
    const back = ler('services/backend.ts');
    const fn = back.slice(back.indexOf('export async function resolverDenuncia'));
    expect(fn.slice(0, fn.indexOf('\n}'))).toContain('resolved_by');
  });

  it('nenhum botão do painel decide só na memória', () => {
    // A varredura que fecha a classe inteira: se aparecer um `dispatch` de
    // decisão solto, é porque alguém acrescentou um botão novo sem servidor.
    //
    // A primeira versão deste teste olhava 400 caracteres para trás — e PASSOU
    // com a quebra forçada, porque encontrou o `comServidor` da função
    // VIZINHA. Teste que passa por acidente é pior que teste nenhum: dá
    // confiança sem dar garantia. Agora delimita a função que contém a
    // decisão, e só procura ali dentro.
    const decisoes = [...admin.matchAll(/dispatch\(\{ type: '(UPDATE_USER|UPDATE_MODERATION|UPDATE_REPORT)'/g)];
    expect(decisoes.length, 'nenhuma decisão encontrada — o teste ficou cego').toBe(3);

    for (const d of decisoes) {
      const antes = admin.slice(0, d.index!);
      // O início da função que contém esta decisão.
      const inicio = antes.lastIndexOf('  const ');
      expect(inicio, 'não achei a função que contém a decisão').toBeGreaterThan(-1);
      const corpo = antes.slice(inicio);
      expect(corpo, `a decisão ${d[1]} não passa por comServidor`).toContain('comServidor');
    }
  });

  it('o estado local só muda DEPOIS do servidor aceitar', () => {
    const fn = admin.slice(admin.indexOf('const comServidor'));
    const corpo = fn.slice(0, fn.indexOf('};'));
    expect(corpo.indexOf('await acao()')).toBeLessThan(corpo.indexOf('aoDarCerto()'));
  });
});
