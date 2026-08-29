import { useState } from 'react';
import type { Lifestyle, RelationshipGoal, SeekingGender, User } from '../types';
import {
  AXES, GENDER_LABEL, GOAL_EMOJI, GOAL_LABEL, LIFESTYLE_FIELDS, PACE_LABEL,
} from '../constants';
import { INTEREST_CATEGORIES, INTERESTS } from '../data/interests';
import { PROFILE_PROMPTS } from '../data/prompts';
import { useApp } from '../state/AppContext';
import { Page } from '../components/layout/AppShell';
import { Button, Card, Chip, Field, Icon, Input, SectionTitle, Select, Slider, Textarea } from '../components/ui';
import { Portrait } from '../components/Portrait';
import { readImageAsDataUrl } from '../services/storage';

export function ProfileEdit() {
  const { me, dispatch, back, toast } = useApp();
  const [d, setD] = useState<User | null>(me);

  if (!me || !d) return null;
  const set = <K extends keyof User>(k: K, v: User[K]) => setD({ ...d, [k]: v });
  const answerOf = (id: string) => d.answers.find((a) => a.promptId === id)?.answer ?? '';
  const setAnswer = (id: string, value: string) => {
    const others = d.answers.filter((a) => a.promptId !== id);
    set('answers', value.trim() ? [...others, { promptId: id, answer: value }] : others);
  };

  const save = () => {
    dispatch({ type: 'UPDATE_USER', id: me.id, patch: d });
    toast('Perfil atualizado.', 'ok');
    back();
  };

  return (
    <Page title="Editar perfil" back={back} action={<Button size="sm" icon="check" onClick={save}>Salvar</Button>}>
      <section className="space-y-6">
        <Card className="p-5">
          <SectionTitle hint="Ela entra velada na descoberta e se revela conforme suas conversas evoluem.">Foto</SectionTitle>
          <div className="flex items-center gap-5">
            <Portrait seed={d.id} photo={d.photo} name={d.name} reveal={1} className="h-28 w-28" />
            <div className="space-y-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-line px-4 py-2 text-[13px] font-semibold hover:bg-bg">
                <Icon name="image" size={16} /> {d.photo ? 'Trocar foto' : 'Enviar foto'}
                <input
                  type="file" accept="image/*" className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try { set('photo', await readImageAsDataUrl(file)); }
                    catch (err) { toast((err as Error).message, 'danger'); }
                  }}
                />
              </label>
              {d.photo && (
                <Button size="sm" variant="ghost" icon="trash" onClick={() => set('photo', undefined)}>Remover</Button>
              )}
            </div>
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <SectionTitle>Sobre você</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome"><Input value={d.name} onChange={(e) => set('name', e.target.value)} /></Field>
            <Field label="Profissão"><Input value={d.profession} onChange={(e) => set('profession', e.target.value)} /></Field>
            <Field label="Cidade"><Input value={d.city} onChange={(e) => set('city', e.target.value)} /></Field>
            <Field label="Como você se identifica">
              <Select value={d.gender} onChange={(e) => set('gender', e.target.value as User['gender'])}>
                {Object.entries(GENDER_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Bio" hint={`${d.bio.length}/400`}>
            <Textarea value={d.bio} maxLength={400} onChange={(e) => set('bio', e.target.value)} />
          </Field>
        </Card>

        <Card className="space-y-4 p-5">
          <SectionTitle hint="Pode mudar quantas vezes quiser.">Objetivo e ritmo</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(GOAL_LABEL) as RelationshipGoal[]).map((g) => (
              <Chip key={g} active={d.goal === g} onClick={() => set('goal', g)}>{GOAL_EMOJI[g]} {GOAL_LABEL[g]}</Chip>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(PACE_LABEL) as (keyof typeof PACE_LABEL)[]).map((p) => (
              <Chip key={p} active={d.chatPace === p} onClick={() => set('chatPace', p)}>{PACE_LABEL[p]}</Chip>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle hint={`${d.interests.length} selecionados — o cálculo usa a raridade de cada um.`}>Interesses</SectionTitle>
          <div className="space-y-4">
            {INTEREST_CATEGORIES.map((cat) => (
              <div key={cat}>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{cat}</p>
                <div className="flex flex-wrap gap-1.5">
                  {INTERESTS.filter((i) => i.category === cat).map((i) => (
                    <Chip
                      key={i.id} size="sm" active={d.interests.includes(i.id)}
                      onClick={() => set('interests', d.interests.includes(i.id) ? d.interests.filter((x) => x !== i.id) : [...d.interests, i.id])}
                    >
                      {i.emoji} {i.label}
                    </Chip>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle>Suas palavras</SectionTitle>
          <div className="space-y-3">
            {PROFILE_PROMPTS.map((p) => (
              <div key={p.id}>
                <label className="mb-1 block text-[13px] font-medium text-brand">{p.label}</label>
                <Textarea
                  value={answerOf(p.id)} maxLength={p.maxLength} placeholder={p.placeholder}
                  onChange={(e) => setAnswer(p.id, e.target.value)} className="min-h-[66px]"
                />
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle>Bússola de conexão</SectionTitle>
          {AXES.map((ax) => (
            <Slider
              key={ax.key} label={ax.label} left={ax.left} right={ax.right} hint={ax.hint}
              value={d.personality[ax.key]}
              onChange={(v) => set('personality', { ...d.personality, [ax.key]: v })}
            />
          ))}
        </Card>

        <Card className="p-5">
          <SectionTitle>Estilo de vida</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            {LIFESTYLE_FIELDS.map((f) => (
              <Field key={f.key} label={f.label}>
                <Select
                  value={d.lifestyle[f.key]}
                  onChange={(e) => set('lifestyle', { ...d.lifestyle, [f.key]: e.target.value } as Lifestyle)}
                >
                  {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </Field>
            ))}
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <SectionTitle hint="Filtros duros: quem não passa aqui nem entra na sua curadoria.">Preferências de descoberta</SectionTitle>
          <Field label="Quem você quer conhecer">
            <div className="mt-1 flex flex-wrap gap-2">
              {(['mulher', 'homem', 'nao_binario', 'todos'] as SeekingGender[]).map((g) => (
                <Chip
                  key={g} active={d.preferences.seeking.includes(g)}
                  onClick={() => set('preferences', {
                    ...d.preferences,
                    seeking: d.preferences.seeking.includes(g)
                      ? d.preferences.seeking.filter((x) => x !== g)
                      : [...d.preferences.seeking, g],
                  })}
                >
                  {g === 'todos' ? 'Todas as pessoas' : GENDER_LABEL[g as User['gender']]}
                </Chip>
              ))}
            </div>
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Idade mínima">
              <Input type="number" min={18} max={99} value={d.preferences.ageMin}
                onChange={(e) => set('preferences', { ...d.preferences, ageMin: Number(e.target.value) })} />
            </Field>
            <Field label="Idade máxima">
              <Input type="number" min={18} max={99} value={d.preferences.ageMax}
                onChange={(e) => set('preferences', { ...d.preferences, ageMax: Number(e.target.value) })} />
            </Field>
            <Field label="Distância" hint={`${d.preferences.maxDistanceKm} km`}>
              <input
                type="range" min={5} max={300} step={5} value={d.preferences.maxDistanceKm}
                onChange={(e) => set('preferences', { ...d.preferences, maxDistanceKm: Number(e.target.value) })}
                className="w-full accent-[rgb(var(--c-brand))]"
              />
            </Field>
          </div>
        </Card>

        <div className="flex gap-2 pb-4">
          <Button variant="ghost" onClick={back}>Cancelar</Button>
          <Button className="ml-auto" icon="check" onClick={save}>Salvar alterações</Button>
        </div>
      </section>
    </Page>
  );
}
