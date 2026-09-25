import { useEffect, useState } from 'react';
import { useApp } from '../state/AppContext';
import { Page } from '../components/layout/AppShell';
import { Banner, Button, Card, Chip, Field, Input, SectionTitle, Textarea } from '../components/ui';
import {
  type Anuncio as TAnuncio, type Proposta,
  dinheiro, enviarProposta, faixaDeOrcamento, lerAnuncio, minhasPropostas, ondeFica,
  responderProposta, propostasDoAnuncio, STATUS_PROPOSTA_LABEL,
} from '../services/mercado';

// ---------------------------------------------------------------------------
// Um anúncio, visto pelos dois lados.
//
// Quem publicou vê as propostas que chegaram e decide. Quem passou por aqui vê
// o trabalho e se oferece. É a mesma tela porque é o mesmo objeto — e porque
// ter duas telas quase iguais é como elas divergem com o tempo.
// ---------------------------------------------------------------------------

const MIN_MENSAGEM = 20;

function Formulario({ anuncioId, onEnviada }: { anuncioId: string; onEnviada: () => void }) {
  const { me, toast } = useApp();
  const [mensagem, setMensagem] = useState('');
  const [valor, setValor] = useState('');
  const [prazo, setPrazo] = useState('');
  const [enviando, setEnviando] = useState(false);

  const curta = mensagem.trim().length < MIN_MENSAGEM;

  const enviar = async () => {
    if (!me || curta) return;
    setEnviando(true);
    try {
      await enviarProposta(anuncioId, me.id, {
        mensagem,
        valor: valor ? Number(valor) : undefined,
        prazoDias: prazo ? Number(prazo) : undefined,
      });
      toast('Proposta enviada. Quem publicou foi avisado.', 'ok');
      onEnviada();
    } catch (e) {
      toast((e as Error).message, 'danger');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Card className="space-y-4 p-5">
      <SectionTitle hint="Quem publicou vê o seu nome, a sua mensagem e, se preencher, o valor e o prazo.">
        Enviar proposta
      </SectionTitle>

      <Field
        label="Sua mensagem"
        required
        hint={curta
          ? `Faltam ${MIN_MENSAGEM - mensagem.trim().length} caracteres. Diga como você faria e o que já fez parecido.`
          : `${mensagem.trim().length} caracteres`}
      >
        <Textarea
          rows={5} value={mensagem} onChange={(e) => setMensagem(e.target.value)}
          placeholder="Explique como você resolveria e cite algo parecido que já fez. Propostas genéricas quase nunca são escolhidas."
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Quanto você cobra" hint="Opcional, mas ajuda muito a ser escolhido.">
          <Input
            type="number" min={0} step={50} value={valor}
            onChange={(e) => setValor(e.target.value)} placeholder="R$"
          />
        </Field>
        <Field label="Em quantos dias" hint="Opcional.">
          <Input
            type="number" min={1} max={3650} value={prazo}
            onChange={(e) => setPrazo(e.target.value)} placeholder="dias"
          />
        </Field>
      </div>

      <Button onClick={enviar} disabled={curta || enviando} icon="send">
        {enviando ? 'Enviando…' : 'Enviar proposta'}
      </Button>
    </Card>
  );
}

function PropostaRecebida({ p, aoResponder }: { p: Proposta; aoResponder: (s: 'aceita' | 'recusada') => void }) {
  const decidida = p.status !== 'enviada';
  return (
    <Card className="space-y-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold">{p.profissionalNome ?? 'Profissional'}</p>
          {p.profissionalProfissao && <p className="text-xs text-muted">{p.profissionalProfissao}</p>}
          <p className="text-xs text-muted">
            {new Date(p.createdAt).toLocaleDateString('pt-BR')}
            {p.profissionalReputacao != null && ` · reputação ${p.profissionalReputacao}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {p.valor != null && <Chip size="sm" tone="sage">{dinheiro(p.valor)}</Chip>}
          {p.prazoDias != null && <Chip size="sm">{p.prazoDias} dias</Chip>}
        </div>
      </div>

      <p className="whitespace-pre-wrap text-sm">{p.mensagem}</p>

      {p.status === 'aceita' && <Chip size="sm" tone="sage">Você aceitou esta proposta</Chip>}
      {p.status === 'recusada' && <Chip size="sm">Recusada</Chip>}
      {p.status === 'retirada' && <Chip size="sm">Retirada pelo profissional</Chip>}

      {!decidida && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon="check" onClick={() => aoResponder('aceita')}>Aceitar</Button>
          <Button size="sm" variant="ghost" onClick={() => aoResponder('recusada')}>Recusar</Button>
        </div>
      )}
    </Card>
  );
}

export function Anuncio({ id }: { id: string }) {
  const { me, back, toast } = useApp();
  const [anuncio, setAnuncio] = useState<TAnuncio | null>(null);
  const [propostas, setPropostas] = useState<Proposta[]>([]);
  const [minha, setMinha] = useState<Proposta | null>(null);
  const [carregando, setCarregando] = useState(true);

  const recarregar = async () => {
    if (!me) return;
    const a = await lerAnuncio(id);
    setAnuncio(a);
    if (a && a.autorId === me.id) {
      setPropostas(await propostasDoAnuncio(id));
    } else {
      // A RLS já devolveria só a própria, mas pedir a lista inteira para achar
      // uma linha é desperdício — e o caminho por `minhasPropostas` é o mesmo
      // que a outra tela usa, então há um lugar só para manter.
      const todas = await minhasPropostas(me.id);
      setMinha(todas.find((p) => p.anuncioId === id) ?? null);
    }
  };

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    recarregar()
      .catch((e) => { if (vivo) toast((e as Error).message, 'danger'); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, me?.id]);

  if (!me) return null;
  if (carregando) return <Page back={back}><Card className="h-40 animate-pulseSoft"><span /></Card></Page>;
  if (!anuncio) {
    return (
      <Page title="Anúncio indisponível" back={back}>
        <p className="text-sm text-muted">
          Ele pode ter sido encerrado, ou o prazo de publicação terminou.
        </p>
      </Page>
    );
  }

  const meu = anuncio.autorId === me.id;
  const aberto = anuncio.status === 'aberto' && new Date(anuncio.expiresAt) > new Date();

  const responder = async (propostaId: string, status: 'aceita' | 'recusada') => {
    try {
      await responderProposta(propostaId, status);
      toast(status === 'aceita'
        ? 'Proposta aceita. O profissional foi avisado.'
        : 'Proposta recusada.', status === 'aceita' ? 'ok' : 'info');
      await recarregar();
    } catch (e) {
      toast((e as Error).message, 'danger');
    }
  };

  return (
    <Page title={anuncio.titulo} back={back} maxWidth="max-w-3xl">
      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap gap-2">
          {anuncio.categoriaNome && <Chip size="sm" tone="brand">{anuncio.categoriaNome}</Chip>}
          <Chip size="sm">{ondeFica(anuncio)}</Chip>
          <Chip size="sm" tone="sage">{faixaDeOrcamento(anuncio)}</Chip>
          {anuncio.prazoDias && <Chip size="sm">Prazo de {anuncio.prazoDias} dias</Chip>}
        </div>

        <p className="whitespace-pre-wrap text-sm leading-relaxed">{anuncio.descricao}</p>

        <p className="text-xs text-muted">
          Publicado por {meu ? 'você' : (anuncio.autorNome ?? 'alguém')} em{' '}
          {new Date(anuncio.createdAt).toLocaleDateString('pt-BR')}
          {aberto && ` · aberto até ${new Date(anuncio.expiresAt).toLocaleDateString('pt-BR')}`}
        </p>
      </Card>

      {!aberto && (
        <div className="mt-5">
          <Banner tone="warn" icon="clock" title="Este anúncio não recebe mais propostas">
            Ele foi encerrado ou o prazo de publicação terminou.
          </Banner>
        </div>
      )}

      {meu ? (
        <div className="mt-8">
          <SectionTitle hint={propostas.length === 0
            ? 'Ninguém respondeu ainda.'
            : 'Só você enxerga estas propostas.'}>
            Propostas recebidas ({propostas.length})
          </SectionTitle>
          <div className="mt-4 space-y-3">
            {propostas.length === 0 ? (
              <Card className="p-5">
                <p className="text-sm text-muted">
                  Assim que alguém se oferecer, a proposta aparece aqui e você recebe um aviso.
                </p>
              </Card>
            ) : (
              propostas.map((p) => (
                <PropostaRecebida key={p.id} p={p} aoResponder={(s) => responder(p.id, s)} />
              ))
            )}
          </div>
        </div>
      ) : minha ? (
        <div className="mt-8">
          <SectionTitle>Sua proposta</SectionTitle>
          <Card className="mt-4 space-y-3 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Chip size="sm" tone={minha.status === 'aceita' ? 'sage' : 'neutral'}>
                {STATUS_PROPOSTA_LABEL[minha.status]}
              </Chip>
              {minha.valor != null && <Chip size="sm">{dinheiro(minha.valor)}</Chip>}
              {minha.prazoDias != null && <Chip size="sm">{minha.prazoDias} dias</Chip>}
            </div>
            <p className="whitespace-pre-wrap text-sm">{minha.mensagem}</p>
            {minha.status === 'enviada' && (
              <Button
                size="sm" variant="ghost"
                onClick={async () => {
                  try {
                    await responderProposta(minha.id, 'retirada');
                    toast('Proposta retirada.', 'info');
                    await recarregar();
                  } catch (e) { toast((e as Error).message, 'danger'); }
                }}
              >
                Retirar proposta
              </Button>
            )}
          </Card>
        </div>
      ) : aberto ? (
        <div className="mt-8">
          <Formulario anuncioId={anuncio.id} onEnviada={recarregar} />
        </div>
      ) : null}
    </Page>
  );
}
