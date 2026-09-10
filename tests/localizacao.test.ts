import { describe, expect, it } from 'vitest';
import { NOMES_DE_CIDADE, UFS, coordenadasDe, normalizarCidade } from '../services/localizacao';

// ---------------------------------------------------------------------------
// A coordenada decide quem aparece para quem. Estes testes existem porque ela
// já esteve errada em produção — e de um jeito que nenhuma tela denunciava.
// ---------------------------------------------------------------------------

const BRASILIA: [number, number] = [-15.79, -47.88];
const SAO_PAULO: [number, number] = [-23.55, -46.63];

describe('normalizarCidade', () => {
  it('faz de acento, caixa e espaço a mesma chave', () => {
    const esperado = 'brasilia';
    for (const escrito of ['Brasília', 'BrasíLia', 'BRASILIA', 'brasilia', '  Brasilia  ', 'Bras  ilia'.replace('  ', '')]) {
      expect(normalizarCidade(escrito)).toBe(esperado);
    }
  });

  it('colapsa espaço repetido no meio do nome', () => {
    expect(normalizarCidade('São   Bernardo do  Campo')).toBe('sao bernardo do campo');
  });
});

describe('coordenadasDe', () => {
  // O caso real: das três contas do lançamento, as três eram de Brasília, e
  // duas foram parar em São Paulo por terem sido escritas sem acento.
  it('acerta Brasília escrita de qualquer jeito', () => {
    for (const escrito of ['Brasília', 'Brasilia', 'brasilia', 'BrasíLia', ' BRASILIA ']) {
      expect(coordenadasDe(escrito, 'DF')).toEqual(BRASILIA);
    }
  });

  it('não manda ninguém para São Paulo por engano de digitação', () => {
    expect(coordenadasDe('Brasilia', 'DF')).not.toEqual(SAO_PAULO);
  });

  // A regra que substitui o "cai em São Paulo": cidade que a tabela não
  // conhece vira a capital da UF, que a pessoa escolheu numa lista fechada.
  it('usa a capital da UF quando a cidade é desconhecida', () => {
    expect(coordenadasDe('Formosa', 'GO')).toEqual([-16.68, -49.25]);
    expect(coordenadasDe('Cidade Que Não Existe', 'AM')).toEqual([-3.12, -60.02]);
    expect(coordenadasDe('', 'RS')).toEqual([-30.03, -51.23]);
  });

  it('prefere a cidade à capital quando conhece as duas', () => {
    expect(coordenadasDe('Sorocaba', 'SP')).not.toEqual(SAO_PAULO);
    expect(coordenadasDe('Joinville', 'SC')).not.toEqual(coordenadasDe('Qualquer', 'SC'));
  });

  // Dado antigo pode ter UF fora da lista; a função não pode explodir.
  it('nunca falha, mesmo com UF inválida', () => {
    for (const uf of ['', 'ZZ', 'xx', 'São Paulo']) {
      const [lat, lng] = coordenadasDe('Cidade Desconhecida', uf);
      expect(Number.isFinite(lat)).toBe(true);
      expect(Number.isFinite(lng)).toBe(true);
    }
  });

  it('aceita a UF em minúsculas', () => {
    expect(coordenadasDe('Desconhecida', 'df')).toEqual(BRASILIA);
  });
});

describe('a tabela em si', () => {
  it('cobre as 27 unidades da federação com uma capital', () => {
    expect(UFS).toHaveLength(27);
    for (const uf of UFS) {
      // Cidade inexistente força o caminho da capital: se faltasse uma, cairia
      // em São Paulo e o teste apontaria qual.
      expect(coordenadasDe('zzz-inexistente', uf), `capital faltando para ${uf}`)
        .not.toEqual(uf === 'SP' ? [0, 0] : SAO_PAULO);
    }
  });

  it('não tem nome repetido depois de normalizar', () => {
    const chaves = NOMES_DE_CIDADE.map(normalizarCidade);
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it('mantém as coordenadas dentro do Brasil', () => {
    for (const nome of NOMES_DE_CIDADE) {
      const [lat, lng] = coordenadasDe(nome, 'SP');
      expect(lat, nome).toBeGreaterThan(-34);
      expect(lat, nome).toBeLessThan(6);
      expect(lng, nome).toBeGreaterThan(-74);
      expect(lng, nome).toBeLessThan(-34);
    }
  });

  it('sugere cidades com o nome acentuado, para a pessoa ler', () => {
    expect(NOMES_DE_CIDADE).toContain('Brasília');
    expect(NOMES_DE_CIDADE).toContain('São Paulo');
    expect(NOMES_DE_CIDADE.length).toBeGreaterThan(90);
  });
});
