import { useMemo, useState } from 'react';
import type { RelationshipGoal } from '../types';
import { GOAL_EMOJI, GOAL_LABEL } from '../constants';
import { INTERESTS } from '../data/interests';
import { useApp } from '../state/AppContext';
import { blockedIdsFor, connectionsOf, otherId } from '../state/appState';
import { buildCandidates, dailyCuration } from '../services/curation';
import { Page } from '../components/layout/AppShell';
import { Banner, Button, Chip, Empty, Field, Icon, Input, Modal, Select } from '../components/ui';
import { EssenceCard } from '../components/EssenceCard';
import { age, dateKey } from '../services/utils';

interface Filters {
  ageMin: number; ageMax: number; maxDistanceKm: number; city: string;
  goals: RelationshipGoal[]; interests: string[]; minCompatibility: number;
}

export function Discover() {
  const { me, state, navigate, quota, expressInterest, passOn, toast } = useApp();
  const [openFilters, setOpenFilters] = useState(false);
  const [f, setF] = useState<Filters | null>(null);

  const filters: Filters = f ?? {
    ageMin: me?.preferences.ageMin ?? 25,
    ageMax: me?.preferences.ageMax ?? 40,
    maxDistanceKm: me?.preferences.maxDistanceKm ?? 50,
    city: '', goals: [], interests: [], minCompatibility: 0,
  };

  const result = useMemo(() => {
    if (!me) return null;
    const conns = connectionsOf(state, me.id);
    const seen = new Set(conns.map((c) => otherId(c, me.id)));
    const blocked = blockedIdsFor(state, me.id);
    const base = buildCandidates(me, state.users, blocked, seen);

    const filtered = base.filter((c) => {
      const a = age(c.user.birthDate);
      if (a < filters.ageMin || a > filters.ageMax) return false;
      if (c.distanceKm > filters.maxDistanceKm) return false;
      if (filters.city && !c.user.city.toLowerCase().includes(filters.city.toLowerCase())) return false;
      if (filters.goals.length && !filters.goals.includes(c.user.goal)) return false;
      if (filters.minCompatibility && c.score < filters.minCompatibility) return false;
      if (filters.interests.length && !filters.interests.some((i) => c.user.interests.includes(i))) return false;
      return true;
    });

    const usage = state.usage.find((u) => u.userId === me.id && u.date === dateKey());
    return {
      curation: dailyCuration(me, filtered, quota.discoverCards, quota.dailyInterests - (usage?.interests ?? 0)),
      totalBefore: base.length, totalAfter: filtered.length,
    };
  }, [me, state, filters, quota]);

  if (!me || !result) return null;
  const { curation } = result;
  const advanced = quota.advancedFilters;

  const act = (id: string, kind: 'like' | 'pass') => {
    if (kind === 'pass') { passOn(id); return; }
    const r = expressInterest(id);
    if (!r.ok) return toast(r.reason ?? 'Não foi possível.', 'warn');
    toast(r.connected ? 'Conexão! Vocês dois demonstraram interesse. ❤️' : 'Interesse enviado. Se ela(e) também tiver, vira conexão.', r.connected ? 'ok' : 'info');
  };

  return (
    <Page
      title="Descobrir"
      subtitle={`Sua curadoria de hoje: ${curation.others.length + (curation.highlight ? 1 : 0)} pessoa(s). Não é um feed infinito — é uma seleção.`}
      action={
        <Button variant="outline" size="sm" icon="filter" onClick={() => setOpenFilters(true)}>
          Filtros
        </Button>
      }
    >
      <div className="mb-5">
        <Banner tone="info" icon="compass" title={`${curation.quotaLeft} interesse(s) restantes hoje`}>
          O limite diário é proposital. Menos gente, mais atenção em cada conversa.
          {me.plan === 'free' && (
            <button type="button" className="ml-1 font-semibold text-brand hover:underline" onClick={() => navigate({ name: 'premium' })}>
              Ver limites do Premium.
            </button>
          )}
        </Banner>
      </div>

      {curation.highlight ? (
        <div className="space-y-4">
          <EssenceCard
            highlight user={curation.highlight.user} score={curation.highlight.score}
            shared={curation.highlight.shared} headline={curation.highlight.headline}
            distanceKm={curation.highlight.distanceKm}
            onOpen={() => navigate({ name: 'person', id: curation.highlight!.user.id })}
            onPass={() => act(curation.highlight!.user.id, 'pass')}
            onInterest={() => act(curation.highlight!.user.id, 'like')}
          />
          {curation.others.map((c) => (
            <EssenceCard
              key={c.user.id} user={c.user} score={c.score} shared={c.shared}
              headline={c.headline} distanceKm={c.distanceKm}
              onOpen={() => navigate({ name: 'person', id: c.user.id })}
              onPass={() => act(c.user.id, 'pass')}
              onInterest={() => act(c.user.id, 'like')}
            />
          ))}
        </div>
      ) : (
        <Empty
          icon="compass" title="Nada por aqui com esses filtros"
          body={result.totalBefore > 0
            ? `Existem ${result.totalBefore} pessoa(s) compatíveis, mas nenhuma passa nos filtros atuais.`
            : 'Você já viu todo mundo que combina com suas preferências. Amplie a distância ou a faixa de idade.'}
          action={<Button size="sm" variant="outline" onClick={() => setF(null)}>Limpar filtros</Button>}
        />
      )}

      <Modal open={openFilters} onClose={() => setOpenFilters(false)} title="Filtros" wide
        footer={
          <>
            <Button variant="ghost" onClick={() => setF(null)}>Limpar</Button>
            <Button onClick={() => setOpenFilters(false)}>Aplicar</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Idade mínima">
              <Input type="number" min={18} max={99} value={filters.ageMin} onChange={(e) => setF({ ...filters, ageMin: Number(e.target.value) })} />
            </Field>
            <Field label="Idade máxima">
              <Input type="number" min={18} max={99} value={filters.ageMax} onChange={(e) => setF({ ...filters, ageMax: Number(e.target.value) })} />
            </Field>
          </div>

          <Field label="Distância máxima" hint={`${filters.maxDistanceKm} km`}>
            <input
              type="range" min={5} max={300} step={5} value={filters.maxDistanceKm}
              onChange={(e) => setF({ ...filters, maxDistanceKm: Number(e.target.value) })}
              className="w-full accent-[rgb(var(--c-brand))]"
            />
          </Field>

          <Field label="Cidade">
            <Input value={filters.city} onChange={(e) => setF({ ...filters, city: e.target.value })} placeholder="Filtrar por cidade" />
          </Field>

          <Field label="Objetivo">
            <div className="mt-1 flex flex-wrap gap-2">
              {(Object.keys(GOAL_LABEL) as RelationshipGoal[]).map((g) => (
                <Chip
                  key={g} active={filters.goals.includes(g)}
                  onClick={() => setF({
                    ...filters,
                    goals: filters.goals.includes(g) ? filters.goals.filter((x) => x !== g) : [...filters.goals, g],
                  })}
                >
                  {GOAL_EMOJI[g]} {GOAL_LABEL[g]}
                </Chip>
              ))}
            </div>
          </Field>

          <div className={advanced ? '' : 'relative'}>
            {!advanced && (
              <div className="absolute inset-0 z-10 grid place-items-center rounded-2xl bg-surface/80 backdrop-blur-[2px]">
                <Button size="sm" icon="crown" onClick={() => { setOpenFilters(false); navigate({ name: 'premium' }); }}>
                  Filtros avançados no Premium
                </Button>
              </div>
            )}
            <div className={advanced ? '' : 'pointer-events-none opacity-40'}>
              <Field label="Compatibilidade mínima" hint={`${filters.minCompatibility}%`}>
                <input
                  type="range" min={0} max={95} step={5} value={filters.minCompatibility}
                  onChange={(e) => setF({ ...filters, minCompatibility: Number(e.target.value) })}
                  className="w-full accent-[rgb(var(--c-brand))]"
                />
              </Field>
              <Field label="Interesses obrigatórios">
                <Select
                  value=""
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v && !filters.interests.includes(v)) setF({ ...filters, interests: [...filters.interests, v] });
                  }}
                >
                  <option value="">Adicionar interesse…</option>
                  {INTERESTS.map((i) => <option key={i.id} value={i.id}>{i.emoji} {i.label}</option>)}
                </Select>
                {filters.interests.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {filters.interests.map((id) => (
                      <Chip key={id} tone="brand" active onClick={() => setF({ ...filters, interests: filters.interests.filter((x) => x !== id) })}>
                        {INTERESTS.find((i) => i.id === id)?.label} <Icon name="close" size={12} />
                      </Chip>
                    ))}
                  </div>
                )}
              </Field>
            </div>
          </div>
        </div>
      </Modal>
    </Page>
  );
}
