import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ACCEPT, MAXIMO_BYTES, TIPOS_ACEITOS, emMB, extensaoDe, nomeParaMostrar, porQueNaoPosso,
} from '../services/anexos';

// ---------------------------------------------------------------------------
// O QUE ESTES TESTES GUARDAM
//
// "na conversa não consegui anexar ficheiros". Não era defeito: nunca existiu.
// A conversa aceitava imagem e mais nada — e num mercado de serviços isso é uma
// falta real, porque orçamento, contrato e nota viajam em PDF.
//
// A DECISÃO QUE ESTES TESTES PROTEGEM
//
// Três caminhos estavam em cima da mesa: só PDF, PDF e documentos, ou qualquer
// ficheiro. O dono escolheu o do meio. "Qualquer ficheiro" foi recusado com
// motivo: a plataforma passaria a carregar um programa de uma pessoa para
// outra, e quem o entregou seria o QICONEXÃO.
//
// Logo a lista é FECHADA, e o perigo não é alguém abri-la de propósito — é
// alguém acrescentar um tipo numa ponta e esquecer a outra. São TRÊS listas:
// a da tela, a da policy de envio (extensão) e a do depósito (tipo declarado).
// Divergindo, ou o ficheiro é recusado sem explicação, ou passa um que não
// devia. O último teste deste arquivo existe só para isso.
// ---------------------------------------------------------------------------

const MIGRACAO = readFileSync('supabase/migrations/030_a_conversa_so_aceitava_imagem.sql', 'utf8');
const semComentariosSQL = (sql: string) => sql.replace(/--.*$/gm, '');
const SQL = semComentariosSQL(MIGRACAO);

describe('o que a conversa aceita, e o que recusa', () => {
  it('aceita os cinco tipos escolhidos', () => {
    for (const nome of ['orcamento.pdf', 'Contrato.docx', 'planilha.xlsx', 'antigo.doc', 'antigo.xls']) {
      expect(porQueNaoPosso(nome, 1000), `recusou ${nome}`).toBeNull();
    }
  });

  it('não se perde com MAIÚSCULAS — o celular manda .PDF', () => {
    expect(porQueNaoPosso('ORCAMENTO.PDF', 1000)).toBeNull();
    expect(porQueNaoPosso('Contrato.DocX', 1000)).toBeNull();
  });

  // A REGRESSÃO QUE O DONO RECUSOU DE PROPÓSITO.
  it('recusa programa, script e página', () => {
    for (const nome of ['virus.exe', 'script.sh', 'pagina.html', 'macro.js', 'instalador.msi']) {
      expect(porQueNaoPosso(nome, 1000), `deixou passar ${nome}`).not.toBeNull();
    }
  });

  // `truque.pdf.exe` é um `.exe`. O que vale é o ÚLTIMO ponto.
  it('o nome duplo não engana: vale a última extensão', () => {
    expect(porQueNaoPosso('truque.pdf.exe', 1000)).not.toBeNull();
    expect(extensaoDe('orcamento.v2.final.pdf')).toBe('pdf');
  });

  it('recusa o que passa do limite, e diz o tamanho', () => {
    const recado = porQueNaoPosso('grande.pdf', MAXIMO_BYTES + 1);
    expect(recado).toContain('8,0 MB');
    expect(porQueNaoPosso('certo.pdf', MAXIMO_BYTES)).toBeNull();
  });

  it('recusa ficheiro vazio', () => {
    expect(porQueNaoPosso('vazio.pdf', 0)).toContain('vazio');
  });

  // Imagem tem botão próprio. Recusar aqui não é esquecimento: é a tela a dizer
  // qual dos dois botões usar.
  it('manda a imagem para o botão de imagem', () => {
    expect(porQueNaoPosso('foto.jpg', 1000)).toContain('botão de imagem');
  });

  it('o recado diz o que PODE enviar, não só o que não pode', () => {
    const recado = porQueNaoPosso('virus.exe', 1000) ?? '';
    expect(recado).toContain('PDF');
    expect(recado).toContain('Word');
    expect(recado).toContain('Excel');
  });
});

describe('o nome que a pessoa vê', () => {
  // Nome de ficheiro vindo de fora é texto de terceiro.
  it('tira barras e quebras de linha', () => {
    expect(nomeParaMostrar('../../etc/passwd.pdf')).not.toContain('/');
    expect(nomeParaMostrar('nome\ncom\nquebras.pdf')).not.toContain('\n');
  });

  it('corta nome gigante mas preserva a extensão', () => {
    const cortado = nomeParaMostrar(`${'a'.repeat(300)}.pdf`);
    expect(cortado.length).toBeLessThanOrEqual(120);
    expect(cortado.endsWith('.pdf'), 'o corte comeu a extensão').toBe(true);
  });

  it('nunca devolve vazio', () => {
    expect(nomeParaMostrar('   ')).toBe('arquivo');
    expect(nomeParaMostrar('')).toBe('arquivo');
  });

  it('o tamanho é escrito como se lê em português', () => {
    expect(emMB(2516582)).toBe('2,4 MB');
    expect(emMB(50000)).toContain('KB');
  });
});

describe('o seletor do aparelho oferece exatamente o que é aceito', () => {
  it('oferece as extensões e os tipos', () => {
    for (const t of TIPOS_ACEITOS) {
      expect(ACCEPT, `falta .${t.extensao}`).toContain(`.${t.extensao}`);
      expect(ACCEPT, `falta ${t.mime}`).toContain(t.mime);
    }
  });

  it('a tela usa a lista, não um accept escrito à mão', () => {
    const tela = readFileSync('screens/Chat.tsx', 'utf8');
    expect(tela).toContain('accept={ACCEPT}');
  });
});

describe('AS TRÊS LISTAS TÊM DE DIZER A MESMA COISA', () => {
  // Este é o teste que importa. Acrescentar um tipo numa ponta e esquecer a
  // outra não dá erro em lado nenhum: o ficheiro é recusado sem explicação
  // (tela aceita, servidor não) ou passa um que não devia (o contrário).
  it('a lista da tela e a extensão da policy de envio conferem', () => {
    const m = SQL.match(/\\\.\(([a-z|]+)\)\$/);
    expect(m, 'não achei a lista de extensões na migração').not.toBeNull();
    const naPolicy = (m?.[1] ?? '').split('|').sort();
    const naTela = TIPOS_ACEITOS.map((t) => t.extensao).sort();
    expect(naPolicy).toEqual(naTela);
  });

  it('a lista da tela e os tipos do depósito conferem', () => {
    for (const t of TIPOS_ACEITOS) {
      expect(SQL, `o depósito não aceita ${t.mime}`).toContain(`'${t.mime}'`);
    }
    // E o depósito não aceita nada que a tela não ofereça — tirando as imagens,
    // que entram pelo outro botão e já estavam lá.
    const noDeposito = [...SQL.matchAll(/'(application\/[^']+)'/g)].map((x) => x[1]).sort();
    const naTela = TIPOS_ACEITOS.map((t) => t.mime).sort();
    expect([...new Set(noDeposito)]).toEqual(naTela);
  });

  it('o teto de tamanho é o mesmo na tela e no banco', () => {
    expect(MAXIMO_BYTES).toBe(8388608);
    expect(SQL, 'o teto do banco mudou sem o da tela').toContain('8388608');
  });
});

describe('o banco recusa a mensagem malformada', () => {
  it('arquivo sem arquivo não existe, e texto não carrega arquivo escondido', () => {
    // `toContain('arquivo_tem_arquivo')` não bastava, e a regressão forçada
    // mostrou: a linha `drop constraint if exists arquivo_tem_arquivo` contém o
    // nome. Renomear só o ADD deixava o teste verde com a restrição ausente.
    expect(SQL).toContain('add constraint arquivo_tem_arquivo check');
    expect(SQL).toContain("when kind = 'arquivo' then");
    expect(SQL).toContain('arquivo_path is null and arquivo_nome is null and arquivo_bytes is null');
  });

  it('o ficheiro vai para uma pasta SÓ dele, separada da imagem', () => {
    expect(SQL).toContain("(storage.foldername(name))[2] = 'arquivo'");
  });

  // A REGRESSÃO QUE ABRIRIA A PORTA: alguém "simplifica" juntando as pastas, e
  // a regra da imagem (que exige .jpg) deixa de valer.
  it('as regras novas são ACRESCENTADAS — a da imagem fica intacta', () => {
    expect(SQL, 'a migração passou a mexer na regra da imagem')
      .not.toMatch(/drop\s+policy[^;]*imagem de conversa entre conectados/i);
    expect(SQL).toContain('create policy "arquivo de conversa entre conectados"');
  });

  it('quem lê o ficheiro é quem já lia a imagem: conexão ABERTA', () => {
    expect(SQL).toContain("c.status = 'conectada'");
  });
});

describe('o envio do ficheiro não passa pelo redimensionador de imagem', () => {
  // Um PDF rebentaria ali. É a diferença de verdade entre as duas funções.
  it('vai como está, byte por byte', () => {
    const media = readFileSync('services/media.ts', 'utf8');
    const i = media.indexOf('export async function uploadChatFile');
    expect(i).toBeGreaterThan(-1);
    const corpo = media.slice(i, media.indexOf('\nexport ', i + 10));
    expect(corpo.length).toBeLessThan(1800);
    expect(corpo, 'o ficheiro passou a ser tratado como imagem').not.toContain('renderizar(');
    expect(corpo).toContain('.upload(caminho, file');
  });

  // O nome gravado é um carimbo de tempo: nome vindo de fora não decide caminho.
  it('o nome de quem envia não decide o caminho no depósito', () => {
    const media = readFileSync('services/media.ts', 'utf8');
    const i = media.indexOf('export async function uploadChatFile');
    const corpo = media.slice(i, media.indexOf('\nexport ', i + 10));
    expect(corpo).toContain('${userId}/arquivo/${Date.now()}.');
    expect(corpo, 'o nome original passou a compor o caminho').not.toContain('/arquivo/${file.name}');
  });
});
