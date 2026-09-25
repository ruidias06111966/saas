import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../state/AppContext';
import { profileCompletion, oQueFalta } from '../services/perfil';
import { connectionsOf, messagesOf } from '../state/appState';
import { Page } from '../components/layout/AppShell';
import { VerificacaoCard } from '../components/Verificacao';
import { Banner, Button, Card, Chip, Icon, Ring, SectionTitle } from '../components/ui';
import { Portrait } from '../components/Portrait';
import { firstName } from '../services/utils';
import { type Categoria, listarCategorias } from '../services/mercado';

// ---------------------------------------------------------------------------
// Seu perfil — o crachá profissional.
//
// Mudou de assunto por inteiro. Saíram idade, objetivo de relacionamento,
// bússola de personalidade, estilo de vida, interesses, respostas de prompt e a
// prévia do Cartão de Essência. Entraram profissão, áreas de atuação, anos de
// experiência e o telefone que ninguém vê.
//
// O aviso sobre a foto velada saiu com o véu: aqui a foto é nítida para todo
// mundo desde o primeiro segundo.
// ---------------------------------------------------------------------------

export function Profile() {
  const { me, state, navigate, logout } = useApp();
  const [categorias, setCategorias] = useState<Categoria[]>([]);

  useEffect(() => { listarCategorias().then(setCategorias).catch(() => {}); }, []);

  const nomeDaCategoria = useMemo(
    () => new Map(categorias.map((c) => [c.id, c.nome])),
    [categorias],
  );

  if (!me) return null;

  const completion = profileCompletion(me);
  const falta = oQueFalta(me);
  const conns = connectionsOf(state, me.id);
  const active = conns.filter((c) => c.status === 'conectada');
  const talking = active.filter((c) => messagesOf(state, c.id).length > 0);

  return (
    <Page
      title="Seu perfil"
      subtitle="É assim que você aparece para quem procura um profissional."
      action={<Button size="sm" icon="edit" onClick={() => navigate({ name: 'profileEdit' })}>Editar</Button>}
    >
      <Card className="p-5 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <Portrait seed={me.id} photo={me.photo} name={me.name} className="h-32 w-32 shrink-0" />
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-2xl font-bold">
              {me.name}
              {me.verified && <Icon name="check" size={16} className="ml-2 inline text-sage" />}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {me.profession || 'Sem profissão informada'} · {me.city}, {me.state}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {typeof me.anosExperiencia === 'number' && (
                <Chip size="sm" tone="brand">{me.anosExperiencia} anos de experiência</Chip>
              )}
              <Chip size="sm">{me.atendeRemoto ? 'Atende a distância' : 'Só presencial'}</Chip>
              <Chip size="sm" tone={me.plan === 'premium' ? 'ember' : 'neutral'}>
                {me.plan === 'premium' ? '👑 Premium' : 'Plano gratuito'}
              </Chip>
            </div>
          </div>
          <div className="flex shrink-0 gap-6 sm:flex-col sm:items-center">
            <Ring value={completion} size={84} sublabel="completo" />
          </div>
        </div>

        {falta.length > 0 && (
          <div className="mt-5">
            <Banner
              tone="info" icon="edit" title="Seu perfil ainda não está pronto para ser escolhido"
              action={<Button size="sm" variant="secondary" onClick={() => navigate({ name: 'profileEdit' })}>Completar</Button>}
            >
              Falta {falta.slice(0, 2).join(' e ')}
              {falta.length > 2 && `, entre outras ${falta.length - 2} coisa(s)`}. Quem publica um
              anúncio lê o perfil antes de responder uma proposta — um perfil pela metade é
              descartado antes mesmo do preço.
            </Banner>
          </div>
        )}
      </Card>

      <div className="mt-5 grid grid-cols-3 gap-3">
        {[
          { label: 'contatos', value: active.length },
          { label: 'conversas ativas', value: talking.length },
          { label: 'reputação', value: me.reputation },
        ].map((s) => (
          <Card key={s.label} className="p-4 text-center">
            <p className="font-display text-2xl font-bold">{s.value}</p>
            <p className="mt-0.5 text-[11px] leading-tight text-muted">{s.label}</p>
          </Card>
        ))}
      </div>

      <section className="mt-6">
        <SectionTitle hint="É por aqui que alguém te encontra ao procurar por área.">
          Em que você atua
        </SectionTitle>
        <Card className="p-5">
          {me.especialidades.length === 0 ? (
            <p className="text-sm text-muted">
              Você ainda não escolheu nenhuma área.{' '}
              <button
                type="button" className="font-semibold text-brand hover:underline"
                onClick={() => navigate({ name: 'profileEdit' })}
              >
                Escolher agora
              </button>
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {me.especialidades.map((id) => (
                <Chip key={id} size="sm" tone="brand">{nomeDaCategoria.get(id) ?? id}</Chip>
              ))}
            </div>
          )}
        </Card>
      </section>

      <section className="mt-6">
        <SectionTitle>O que você faz</SectionTitle>
        <Card className="p-5">
          {me.bio ? (
            <p className="whitespace-pre-wrap font-display text-[15px] leading-relaxed">{me.bio}</p>
          ) : (
            <p className="text-sm text-muted">
              Você ainda não escreveu o seu resumo. Diga o que faz, para quem, e o que já entregou
              parecido — é o texto que decide se alguém te chama.
            </p>
          )}
        </Card>
      </section>

      <section className="mt-6">
        <SectionTitle hint="Ninguém vê este número. Ele só aparece para o outro lado quando uma proposta é aceita.">
          Telefone de contato
        </SectionTitle>
        <Card className="p-5">
          <p className="flex items-center gap-2 text-sm">
            <Icon name="lock" size={15} className="text-muted" />
            {me.telefone
              ? <span className="font-semibold">{me.telefone}</span>
              : <span className="text-muted">Nenhum telefone cadastrado.</span>}
          </p>
        </Card>
      </section>

      <section className="mt-6">
        <VerificacaoCard />
      </section>

      <div className="mt-8 flex flex-wrap gap-2">
        <Button variant="outline" icon="settings" onClick={() => navigate({ name: 'settings' })}>Configurações e privacidade</Button>
        {me.plan === 'free' && <Button variant="secondary" icon="crown" onClick={() => navigate({ name: 'premium' })}>Ver Premium</Button>}
        <Button variant="ghost" icon="logout" onClick={() => void logout()}>Sair da conta</Button>
      </div>
      <p className="mt-4 text-xs text-muted">Olá, {firstName(me.name)} — conta criada em {new Date(me.createdAt).toLocaleDateString('pt-BR')}.</p>
    </Page>
  );
}
