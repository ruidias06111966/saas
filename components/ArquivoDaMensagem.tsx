import { useState } from 'react';
import { Icon } from './ui';
import { emMB, extensaoDe } from '../services/anexos';
import { urlDoArquivo } from '../services/media';

// ---------------------------------------------------------------------------
// A BOLHA DE UM FICHEIRO NA CONVERSA.
//
// POR QUE NÃO SE PARECE COM A DA IMAGEM
//
// Uma imagem mostra-se; um ficheiro, não. O que a pessoa precisa de saber antes
// de tocar é: o QUE é isto, de que TAMANHO, e o que vai acontecer se eu tocar.
// Daí o cartão trazer nome, tipo e tamanho — e um botão que diz "Baixar", em vez
// de um bloco misterioso que abre sabe-se lá o quê.
//
// O ENDEREÇO SÓ É PEDIDO NO TOQUE, E ISSO É DE PROPÓSITO
//
// A imagem precisa do endereço para aparecer; o ficheiro não. Pedir um endereço
// assinado para cada ficheiro de uma conversa longa seria uma ida ao servidor
// por bolha, à toa — e endereços assinados expiram, portanto os de cima já não
// valeriam quando a pessoa rolasse até eles.
// ---------------------------------------------------------------------------

/** O rótulo que a pessoa lê. Vem da extensão, que é o que ela reconhece. */
const ROTULO: Record<string, string> = {
  pdf: 'PDF', doc: 'Word', docx: 'Word', xls: 'Excel', xlsx: 'Excel',
};

export function ArquivoDaMensagem(
  { caminho, nome, bytes, meu }: { caminho: string; nome: string; bytes?: number; meu?: boolean },
) {
  const [baixando, setBaixando] = useState(false);
  const [erro, setErro] = useState('');
  const ext = extensaoDe(nome);
  const tipo = ROTULO[ext] ?? ext.toUpperCase();

  const baixar = async () => {
    setErro('');
    setBaixando(true);
    try {
      const url = await urlDoArquivo(caminho, nome);
      if (!url) {
        // Acontece quando a conexão foi encerrada: o servidor deixa de assinar
        // o endereço. Dizer isso é melhor do que um botão que não faz nada.
        setErro('Não consegui abrir este arquivo agora.');
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      setErro('Não consegui abrir este arquivo agora.');
    } finally {
      setBaixando(false);
    }
  };

  return (
    <div className={meu ? 'mb-1' : 'mb-1'}>
      <div className={`flex items-center gap-3 rounded-xl2 border p-3 ${
        meu ? 'border-white/25 bg-white/10' : 'border-line bg-bg'
      }`}>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold ${
          meu ? 'bg-white/20 text-white' : 'bg-brandSoft text-brand'
        }`}>
          {tipo}
        </span>
        <span className="min-w-0 flex-1">
          {/* `break-all` e não `truncate`: um nome cortado com reticências esconde
              justamente o fim, que é onde está a extensão e muitas vezes a versão
              ("orcamento-final-v3.pdf"). */}
          <span className="block break-all text-[13px] font-semibold leading-snug">{nome}</span>
          {bytes != null && (
            <span className={`block text-[11px] ${meu ? 'text-white/70' : 'text-muted'}`}>
              {emMB(bytes)}
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={baixar}
          disabled={baixando}
          aria-label={`Baixar ${nome}`}
          className={`shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-60 ${
            meu ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-brand text-white hover:opacity-90'
          }`}
        >
          {baixando ? '…' : <><Icon name="download" size={13} /> Baixar</>}
        </button>
      </div>
      {erro && <span className="mt-1 block text-[11px] text-danger">{erro}</span>}
    </div>
  );
}
