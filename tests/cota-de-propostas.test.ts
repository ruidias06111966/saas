import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { QUOTAS, quantidade } from '../constants';

// ---------------------------------------------------------------------------
// O número da tela tem de ser o número do banco.
//
// A cota de propostas existe em DOIS lugares, de propósito:
//
//   • no banco, no gatilho `private.cota_de_propostas` — é ele que RECUSA;
//   • em `constants.ts` — é ele que AVISA antes, na tela.
//
// Duas cópias de um número é como um número diverge. E a divergência aqui é
// das piores: a tela prometeria uma quarta proposta que o banco recusaria, e a
// pessoa perderia o texto que escreveu.
//
// Este teste lê o SQL e compara. É da mesma família do
// `colunas-do-cracha.test.ts`, escrito depois de o app passar uma noite fora do
// ar por um número que só existia num lado.
// ---------------------------------------------------------------------------

const RAIZ = new URL('..', import.meta.url).pathname;

/** O SQL da migração mais recente que define a cota. */
function sqlDaCota(): string {
  const dir = join(RAIZ, 'supabase/migrations');
  const arquivos = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

  let ultimo = '';
  for (const arquivo of arquivos) {
    const sql = readFileSync(join(dir, arquivo), 'utf8');
    if (sql.includes('function private.cota_de_propostas')) ultimo = sql;
  }
  return ultimo;
}

describe('a cota da tela é a mesma do banco', () => {
  const sql = sqlDaCota();

  it('achou a migração que define a cota', () => {
    expect(sql.length).toBeGreaterThan(0);
  });

  it('o limite do gatilho é o mesmo de QUOTAS.free', () => {
    // `limite  constant int := 3;`
    const achado = sql.match(/limite\s+constant\s+int\s*:=\s*(\d+)/);
    expect(achado, 'não achei a constante `limite` no gatilho').not.toBeNull();
    expect(Number(achado![1])).toBe(QUOTAS.free.propostasPorMes);
  });

  it('a função que conta o que resta usa o mesmo limite', () => {
    // `greatest(0, 3 - (`
    const achado = sql.match(/greatest\(0,\s*(\d+)\s*-/);
    expect(achado, 'não achei o limite em propostas_restantes()').not.toBeNull();
    expect(Number(achado![1])).toBe(QUOTAS.free.propostasPorMes);
  });

  it('o Premium é ilimitado dos dois lados', () => {
    expect(Number.isFinite(QUOTAS.premium.propostasPorMes)).toBe(false);
    expect(sql).toMatch(/plano\s*=\s*'premium'/);
    expect(sql).toContain('return new;');
  });

  it('publicar anúncio não tem cota nenhuma, em plano nenhum', () => {
    // A regra do produto: cobra-se do lado abundante. Se algum dia alguém
    // acrescentar uma cota de anúncios, este teste obriga a pensar duas vezes.
    expect(Object.keys(QUOTAS.free)).not.toContain('anunciosPorMes');
    expect(sql).not.toContain('public.anuncios');
  });
});

describe('nenhum Infinity vaza para a tela', () => {
  it('o ilimitado vira palavra', () => {
    expect(quantidade(QUOTAS.premium.propostasPorMes)).toBe('Ilimitado');
    expect(quantidade(QUOTAS.free.propostasPorMes)).toBe('3');
  });
});
