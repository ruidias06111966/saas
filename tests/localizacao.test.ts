import { describe, expect, it } from 'vitest';
import { NOMES_DE_CIDADE, UFS, normalizarCidade } from '../services/localizacao';

// ---------------------------------------------------------------------------
// DE ONDE A PESSOA É
//
// O QUE SAIU DAQUI EM 17/10/2026, E PORQUÊ
//
// Este ficheiro era quase todo sobre `coordenadasDe` — a função que traduzia
// "Brasília, DF" numa coordenada. Ela existia para alimentar `approx_lat` e
// `approx_lng` em `public.users`, colunas que eram sobra do app de
// relacionamentos: lá, a coordenada decidia quem aparecia para quem.
//
// Desde o pivô não decidiam nada. Nenhuma vista as devolvia, nenhuma função as
// lia, nenhuma tela as mostrava — e mesmo assim cada cadastro as gravava. As
// colunas saíram, a função saiu, e estes testes saíram com ela.
//
// O QUE FICA, E CONTINUA A IMPORTAR
//
// O nome da cidade e a UF são lidos por GENTE: aparecem no crachá, no anúncio,
// e a UF é filtro na busca por profissionais. A normalização continua a ser o
// motivo de `services/localizacao.ts` existir — e o engano que a fez nascer
// (acento a decidir a localização) ainda seria um engano hoje, porque
// "Brasilia" e "Brasília" têm de ser a mesma cidade na busca.
// ---------------------------------------------------------------------------

describe('normalizarCidade', () => {
  it('faz de acento, caixa e espaço a mesma chave', () => {
    const esperado = 'brasilia';
    for (const escrito of ['Brasília', 'BrasíLia', 'BRASILIA', 'brasilia', '  Brasilia  ']) {
      expect(normalizarCidade(escrito)).toBe(esperado);
    }
  });

  it('colapsa espaço repetido no meio do nome', () => {
    expect(normalizarCidade('São   Bernardo do  Campo')).toBe('sao bernardo do campo');
  });
});

describe('a tabela em si', () => {
  it('cobre as 27 unidades da federação', () => {
    expect(UFS).toHaveLength(27);
    expect(new Set(UFS).size, 'há UF repetida na lista').toBe(27);
  });

  it('não tem nome de cidade repetido depois de normalizar', () => {
    // Nome repetido viraria duas sugestões iguais no campo, e uma delas nunca
    // seria escolhida.
    const chaves = NOMES_DE_CIDADE.map(normalizarCidade);
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it('sugere cidades com o nome acentuado, para a pessoa ler', () => {
    expect(NOMES_DE_CIDADE).toContain('Brasília');
    expect(NOMES_DE_CIDADE).toContain('São Paulo');
    expect(NOMES_DE_CIDADE.length).toBeGreaterThan(90);
  });
});
