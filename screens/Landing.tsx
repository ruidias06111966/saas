import { useApp } from '../state/AppContext';
import { Button, Card, Icon, type IconName } from '../components/ui';
import { supabaseEnabled } from '../services/supabaseClient';
import { APP_NAME, APP_TAGLINE, URL_DIRETRIZES, URL_MANUAL, URL_PRIVACIDADE, URL_TERMOS } from '../constants';

const STEPS = [
  { n: '01', t: 'Publique', d: 'De graça, dos dois lados: o que você precisa, ou o que você sabe fazer.' },
  { n: '02', t: 'Encontre', d: 'Quem precisa acha quem oferece. Quem oferece acha quem precisa.' },
  { n: '03', t: 'Conecte-se', d: 'Demonstre interesse, envie proposta, converse. É aqui que o negócio começa.' },
  { n: '04', t: 'Negocie', d: 'Combinado fechado, os telefones dos dois lados são liberados.' },
];

const PILLARS: { icon: IconName; t: string; d: string }[] = [
  {
    icon: 'search', t: 'Você procura, ninguém te empurra',
    d: 'Busca de verdade — por área, cidade e palavra. E que ignora acento: quem digita "construcao" acha "construção".',
  },
  {
    icon: 'lock', t: 'Telefone só depois do acordo',
    d: 'Ninguém vê o seu contato enquanto você não aceitar uma proposta. É o que impede o app de virar uma lista de telefones.',
  },
  {
    icon: 'handshake', t: 'Proposta é sigilosa',
    d: 'Cada profissional vê apenas a própria proposta. Quem publicou vê todas. Preço à vista faz todo mundo copiar quem chegou primeiro.',
  },
];

export function Landing() {
  const { navigate } = useApp();
  return (
    <div className="min-h-full bg-bg">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <div>
          <span className="font-display text-xl font-bold tracking-tight">{APP_NAME}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* O manual fica no TOPO, e não só no rodapé. Quem chega sem conhecer
              o produto precisa achá-lo sem rolar a página inteira. */}
          <a
            href={URL_MANUAL} target="_blank" rel="noopener noreferrer"
            className="hidden items-center gap-1.5 rounded-2xl px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-bg hover:text-ink sm:inline-flex"
          >
            <Icon name="compass" size={17} /> Manual
          </a>
          <Button variant="ghost" size="sm" onClick={() => navigate({ name: 'login' })}>Entrar</Button>
          <Button size="sm" onClick={() => navigate({ name: 'signup' })}>Criar minha conta</Button>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-5 pb-16 pt-8 lg:pt-16">
        <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
          <div className="animate-floatIn">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">
              <Icon name="sparkle" size={13} filled /> {APP_TAGLINE}
            </p>
            <h1 className="font-display text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
              Encontre quem precisa.<br />
              <span className="bg-gradient-to-r from-brand to-ember bg-clip-text text-transparent">Encontre quem oferece.</span>
            </h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-muted sm:text-lg">
              O QICONEXÃO conecta pessoas, profissionais e empresas para encontrar e oferecer
              serviços. Contador, eletricista, advogado, quem faz site, quem cuida de alvará.
            </p>

            {/* OS DOIS CAMINHOS, LADO A LADO E DO MESMO TAMANHO.
                Quem chega traz uma de duas perguntas. Um botão só, ou um
                maior que o outro, responde a errada para metade das pessoas. */}
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {([
                { tipo: 'procurando', icone: 'search', titulo: 'Procurar um serviço',
                  linha: 'Publique gratuitamente o que você precisa.' },
                { tipo: 'oferecendo', icone: 'handshake', titulo: 'Oferecer um serviço',
                  linha: 'Divulgue gratuitamente o que você faz.' },
              ] as const).map((c) => (
                <button
                  key={c.tipo}
                  type="button"
                  onClick={() => navigate({ name: 'signup' })}
                  className="group rounded-xl3 border border-line bg-surface p-5 text-left transition-colors hover:border-brand hover:bg-brandSoft"
                >
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-brandSoft text-brand transition-colors group-hover:bg-brand group-hover:text-white">
                    <Icon name={c.icone} size={19} />
                  </span>
                  <span className="mt-3 block font-display text-lg font-semibold">{c.titulo}</span>
                  <span className="mt-1 block text-[13px] leading-relaxed text-muted">{c.linha}</span>
                </button>
              ))}
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" onClick={() => navigate({ name: 'signup' })}>Criar minha conta</Button>
              <Button size="lg" variant="outline" onClick={() => navigate({ name: 'login' })}>Já tenho conta</Button>
            </div>
            <p className="mt-4 text-xs text-muted">
              Grátis para começar. Maiores de 18 anos. Sem cobrança no cadastro.
            </p>
            {/* O lugar onde está quem ainda não decidiu. Cartão, e não link de
                rodapé: perguntar "como isto funciona?" é o passo ANTES de
                criar conta, e quem não acha a resposta fecha a aba. */}
            <a
              href={URL_MANUAL} target="_blank" rel="noopener noreferrer"
              className="mt-6 flex items-start gap-3 rounded-xl3 border border-line bg-surface p-4 transition-colors hover:border-brand hover:bg-brandSoft"
            >
              <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brandSoft text-brand">
                <Icon name="compass" size={19} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">Primeira vez aqui? Leia o manual</span>
                <span className="mt-0.5 block text-[13px] leading-relaxed text-muted">
                  Passo a passo de como criar a conta, publicar um trabalho, enviar propostas e
                  fechar negócio. Abre sem precisar de conta.
                </span>
              </span>
            </a>
          </div>

          {/* Um anúncio como ele aparece no quadro. */}
          <div className="relative mx-auto w-full max-w-sm">
            <div className="grain relative overflow-hidden rounded-xl4 bg-gradient-to-br from-brand via-brand/70 to-ember p-6 shadow-lift">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/80">Anúncio aberto</p>
              <p className="mt-2 font-display text-2xl font-semibold leading-snug text-white">
                Contador para abertura de empresa
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-white/90">
                Prestação de serviço, dois sócios, Goiânia. Precisa estar pronto em outubro.
              </p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {['Contabilidade', 'Goiânia, GO', 'R$ 1.200'].map((t) => (
                  <span key={t} className="rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-medium text-white">
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <Card className="absolute -left-6 top-40 hidden w-56 p-4 shadow-lift sm:block">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Propostas recebidas</p>
              <p className="font-display text-3xl font-bold text-brand">7</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted">
                Só quem publicou enxerga os valores. Cada profissional vê apenas a própria.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* Como funciona */}
      <section className="border-y border-line bg-surface py-16">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="font-display text-3xl font-bold tracking-tight">Como funciona</h2>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <div key={s.n} className="rounded-xl3 border border-line bg-bg p-5">
                <span className="font-display text-sm font-bold text-ember">{s.n}</span>
                <h3 className="mt-2 font-display text-lg font-semibold">{s.t}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Diferencial */}
      <section className="py-16">
        <div className="mx-auto max-w-6xl px-5">
          <div className="max-w-2xl">
            <h2 className="font-display text-3xl font-bold tracking-tight">O que fazemos diferente</h2>
            <p className="mt-3 text-base leading-relaxed text-muted">
              Os sites de freelancer grandes otimizam para o volume: milhares de propostas de
              qualquer lugar do mundo, e o preço mais baixo ganha. O {APP_NAME} é do tamanho da sua
              região, e quem ganha é quem entrega.
            </p>
          </div>
          <div className="mt-8 grid gap-5 lg:grid-cols-3">
            {PILLARS.map((p) => (
              <Card key={p.t} className="p-6">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brandSoft text-brand">
                  <Icon name={p.icon} size={21} />
                </span>
                <h3 className="mt-4 font-display text-xl font-semibold">{p.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{p.d}</p>
              </Card>
            ))}
          </div>

          <blockquote className="mt-10 rounded-xl4 bg-ink p-8 text-bg sm:p-12">
            <p className="font-display text-2xl font-semibold leading-snug sm:text-3xl">
              “Quem faz o serviço mora perto de quem precisa dele. Faltava um lugar para os dois
              se acharem.”
            </p>
            <p className="mt-4 max-w-xl text-sm leading-relaxed opacity-70">
              Não prometemos milhares de oportunidades. Prometemos as da sua região, com nome,
              rosto e reputação de quem está do outro lado — e um jeito de fechar o combinado sem
              intermediário cobrando comissão.
            </p>
          </blockquote>
        </div>
      </section>

      {/* Segurança */}
      <section className="border-t border-line bg-surface py-16">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 lg:grid-cols-2">
          <div>
            <h2 className="font-display text-3xl font-bold tracking-tight">Segurança não é recurso premium</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Verificação de perfil, moderação assistida por IA com revisão humana, bloqueio e
              denúncia em um toque. Seu endereço exato nunca aparece — só a cidade. Você pode
              exportar ou apagar seus dados quando quiser, como manda a LGPD.
            </p>
          </div>
          <ul className="space-y-3">
            {[
              'Nenhuma conta é banida por decisão automática: toda suspensão passa por análise humana.',
              'Mensagens com pedido de taxa antecipada, ameaça ou conteúdo impróprio são bloqueadas antes do envio.',
              'Você exporta todos os seus dados em JSON e apaga sua conta sem precisar falar com ninguém.',
              'E-mail nunca aparece. O telefone só é mostrado ao outro lado quando uma proposta é aceita.',
            ].map((t) => (
              <li key={t} className="flex items-start gap-3 rounded-2xl border border-line bg-bg p-4 text-[13px] leading-relaxed">
                <Icon name="check" size={16} className="mt-0.5 shrink-0 text-sage" />{t}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-5 py-10 text-center">
        <p className="font-display text-lg font-bold">{APP_NAME}</p>
        {/* Este aviso precisa dizer a verdade sobre o modo em que o site subiu.
            Em modo online há gente real e banco real; chamar isso de "perfis
            fictícios" seria falso justamente na frase que fala de dados. */}
        <p className="mt-1 text-xs text-muted">
          {supabaseEnabled
            ? 'Conectado a um banco real, com Row Level Security. '
            : 'Projeto de demonstração. Perfis fictícios, sem pessoas reais. '}
          <a href={URL_MANUAL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-ink">Manual de utilização</a>
          <span aria-hidden="true">·</span>
          <a href={URL_TERMOS} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-ink">Termos de Uso</a>
          {' · '}
          <a href={URL_PRIVACIDADE} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-ink">Política de Privacidade</a>
          {' · '}
          <a href={URL_DIRETRIZES} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-ink">Diretrizes da Comunidade</a>
        </p>
      </footer>
    </div>
  );
}
