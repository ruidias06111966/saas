import { useApp } from '../state/AppContext';
import { Button, Card, Icon, type IconName } from '../components/ui';
import { APP_TAGLINE } from '../constants';

const STEPS = [
  { n: '01', t: 'Crie seu perfil', d: 'Interesses, jeito de ser e algumas respostas suas. Leva cinco minutos.' },
  { n: '02', t: 'Receba sua curadoria do dia', d: 'Poucas pessoas, escolhidas por afinidade real. Sem rolagem infinita.' },
  { n: '03', t: 'Comece pela conversa', d: 'A foto entra velada. O que aparece primeiro é o que a pessoa pensa.' },
  { n: '04', t: 'Deixe a conexão se revelar', d: 'Conforme a conversa avança de verdade, a imagem se revela.' },
];

const PILLARS: { icon: IconName; t: string; d: string }[] = [
  {
    icon: 'lock', t: 'Revelação progressiva',
    d: 'A foto começa velada e só se revela conforme a conversa evolui — ou quando os dois concordam em revelar antes.',
  },
  {
    icon: 'compass', t: 'Curadoria diária',
    d: 'Um Encontro do Dia e poucas sugestões, todo dia. Escassez proposital: aqui você conversa, não coleciona.',
  },
  {
    icon: 'thermometer', t: 'Termômetro de conversa',
    d: 'Medimos reciprocidade, profundidade e constância. Quem conversa bem alcança mais gente. Quem some, menos.',
  },
];

export function Landing() {
  const { navigate } = useApp();
  return (
    <div className="min-h-full bg-bg">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <div>
          <span className="font-display text-xl font-bold tracking-tight">CONEXÃO</span>
        </div>
        <div className="flex items-center gap-2">
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
              Encontre alguém que<br />
              <span className="bg-gradient-to-r from-brand to-ember bg-clip-text text-transparent">combine com você.</span>
            </h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-muted sm:text-lg">
              Conexões baseadas em interesses, personalidade e boas conversas.
              Aqui a foto não abre a porta — ela é a recompensa de uma conversa que valeu a pena.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" onClick={() => navigate({ name: 'signup' })}>Criar minha conta</Button>
              <Button size="lg" variant="outline" onClick={() => navigate({ name: 'login' })}>Já tenho conta</Button>
            </div>
            <p className="mt-4 text-xs text-muted">
              Grátis para começar. Maiores de 18 anos. Sem cobrança no cadastro.
            </p>
          </div>

          {/* Ilustração do véu */}
          <div className="relative mx-auto w-full max-w-sm">
            <div className="grain relative aspect-[4/5] overflow-hidden rounded-xl4 bg-gradient-to-br from-brand via-brand/70 to-ember shadow-lift">
              <div className="absolute inset-0 grid grid-cols-2">
                <div className="backdrop-blur-2xl" />
                <div className="backdrop-blur-[2px]" />
              </div>
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/80 to-transparent p-6 text-white">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] opacity-80">Estágio 3 de 5</p>
                <p className="mt-1 font-display text-2xl font-semibold">A imagem se revela</p>
                <p className="mt-1 text-[13px] opacity-90">à medida que vocês se conhecem.</p>
              </div>
            </div>
            <Card className="absolute -left-6 top-8 hidden w-56 p-4 shadow-lift sm:block">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Compatibilidade</p>
              <p className="font-display text-3xl font-bold text-brand">87%</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted">
                Objetivo, ritmo de conversa e 4 interesses em comum.
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
              Aplicativos de relacionamento otimizam para o tempo que você passa deslizando perfis.
              O CONEXÃO otimiza para a conversa que sobra depois.
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
              “Aqui, uma boa conversa pode ser o começo de uma grande história.”
            </p>
            <p className="mt-4 max-w-xl text-sm leading-relaxed opacity-70">
              Não prometemos que o algoritmo vai encontrar seu par. Prometemos colocar você na frente
              de menos gente, melhor escolhida, e tornar mais fácil começar a falar.
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
              Verificação de perfil, moderação assistida por IA com revisão humana, bloqueio e denúncia
              em um toque. Seu endereço exato nunca aparece — só a cidade e uma faixa de distância.
              Você pode exportar ou apagar seus dados quando quiser, como manda a LGPD.
            </p>
          </div>
          <ul className="space-y-3">
            {[
              'Nenhuma conta é banida por decisão automática: toda suspensão passa por análise humana.',
              'Mensagens com pedido de dinheiro, ameaça ou conteúdo sexual não solicitado são bloqueadas antes do envio.',
              'Você exporta todos os seus dados em JSON e apaga sua conta sem precisar falar com ninguém.',
              'E-mail e telefone nunca aparecem no seu perfil público.',
            ].map((t) => (
              <li key={t} className="flex items-start gap-3 rounded-2xl border border-line bg-bg p-4 text-[13px] leading-relaxed">
                <Icon name="check" size={16} className="mt-0.5 shrink-0 text-sage" />{t}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-5 py-10 text-center">
        <p className="font-display text-lg font-bold">CONEXÃO</p>
        <p className="mt-1 text-xs text-muted">
          Projeto de demonstração. Perfis fictícios, sem pessoas reais. Termos de Uso · Política de
          Privacidade · Diretrizes da Comunidade
        </p>
      </footer>
    </div>
  );
}
