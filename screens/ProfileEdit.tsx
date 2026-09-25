import { useEffect, useMemo, useState } from 'react';
import type { User } from '../types';
import { useApp } from '../state/AppContext';
import { Page } from '../components/layout/AppShell';
import { Banner, Button, Card, Chip, Field, Icon, Input, SectionTitle, Select, Textarea, Toggle } from '../components/ui';
import { Portrait } from '../components/Portrait';
import { blurCoord } from '../services/utils';
import { uploadProfilePhoto } from '../services/media';
import { NOMES_DE_CIDADE, UFS, coordenadasDe } from '../services/localizacao';
import { type Categoria, listarCategorias } from '../services/mercado';

// ---------------------------------------------------------------------------
// Editar o perfil profissional.
//
// Saíram quatro cartões inteiros: bússola de conexão, estilo de vida,
// interesses e preferências de descoberta. Entraram as áreas de atuação, os
// anos de experiência e o telefone.
//
// O MÁXIMO DE CINCO ÁREAS É COBRADO NO BANCO, não aqui — o gatilho
// `no_maximo_cinco_especialidades` recusa a sexta. Esta tela apenas impede de
// chegar lá, para a pessoa não escrever o perfil inteiro e levar um erro no
// fim. A regra que VALE é a de lá.
// ---------------------------------------------------------------------------

const MAX_AREAS = 5;

export function ProfileEdit() {
  const { me, saveProfile, back, toast } = useApp();
  const [d, setD] = useState<User | null>(me);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    listarCategorias().then(setCategorias).catch((e) => toast((e as Error).message, 'danger'));
  }, [toast]);

  const grupos = useMemo(() => {
    const m = new Map<string, Categoria[]>();
    for (const c of categorias) m.set(c.grupo, [...(m.get(c.grupo) ?? []), c]);
    return [...m.entries()];
  }, [categorias]);

  if (!me || !d) return null;

  const set = <K extends keyof User>(k: K, v: User[K]) => setD({ ...d, [k]: v });

  const alternarArea = (id: string) => {
    const tem = d.especialidades.includes(id);
    if (!tem && d.especialidades.length >= MAX_AREAS) {
      toast(`No máximo ${MAX_AREAS} áreas. Quem diz que faz tudo não é procurado para nada.`, 'info');
      return;
    }
    set('especialidades', tem
      ? d.especialidades.filter((x) => x !== id)
      : [...d.especialidades, id]);
  };

  const save = async () => {
    setSalvando(true);
    try {
      // A coordenada é DEDUZIDA da cidade, e mudar de cidade tem de mudá-la.
      // Antes ela era calculada só no cadastro: quem se mudava trocava o nome
      // na tela e continuava sendo oferecido a quem estava perto do endereço
      // antigo, para sempre e sem meio de corrigir.
      const [lat, lng] = coordenadasDe(d.city, d.state);
      await saveProfile({ ...d, approxLat: blurCoord(lat), approxLng: blurCoord(lng) });
      toast('Perfil atualizado.', 'ok');
      back();
    } catch (err) {
      toast((err as Error).message, 'danger');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Page
      title="Editar perfil"
      back={back}
      action={<Button size="sm" icon="check" loading={salvando} onClick={() => void save()}>Salvar</Button>}
    >
      <section className="space-y-6">
        <Card className="p-5">
          <SectionTitle hint="Nítida, e para todo mundo. Rosto ou logotipo — o que representar você melhor no trabalho.">
            Foto
          </SectionTitle>
          <div className="flex items-center gap-5">
            <Portrait seed={d.id} photo={d.photo} name={d.name} className="h-28 w-28" />
            <div className="space-y-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-line px-4 py-2 text-[13px] font-semibold hover:bg-bg">
                <Icon name="image" size={16} /> {d.photo ? 'Trocar foto' : 'Enviar foto'}
                <input
                  type="file" accept="image/*" className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try { set('photo', await uploadProfilePhoto(file, d.id)); }
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
          <SectionTitle>Quem é você no trabalho</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome">
              <Input value={d.name} onChange={(e) => set('name', e.target.value)} />
            </Field>
            <Field label="Profissão" hint='Como você se apresenta: "Contadora", "Engenheiro civil".'>
              <Input
                value={d.profession} placeholder="Contadora"
                onChange={(e) => set('profession', e.target.value)}
              />
            </Field>
            <Field label="Cidade" hint="Mostramos só a cidade, nunca o endereço.">
              <Input value={d.city} onChange={(e) => set('city', e.target.value)} list="cidades-perfil" />
              <datalist id="cidades-perfil">{NOMES_DE_CIDADE.map((c) => <option key={c} value={c} />)}</datalist>
            </Field>
            <Field label="Estado">
              <Select value={d.state} onChange={(e) => set('state', e.target.value)}>
                {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
              </Select>
            </Field>
            <Field label="Anos de experiência" hint="Opcional.">
              <Input
                type="number" min={0} max={70}
                value={d.anosExperiencia ?? ''}
                onChange={(e) => set('anosExperiencia', e.target.value ? Number(e.target.value) : undefined)}
                placeholder="12"
              />
            </Field>
          </div>

          <Toggle
            checked={d.atendeRemoto}
            onChange={(v) => set('atendeRemoto', v)}
            label="Atendo a distância"
            description="Deixe ligado se você consegue trabalhar por vídeo, telefone e documento assinado digitalmente. Isso te coloca em anúncios remotos de todo o país."
          />

          <Field
            label="O que você faz"
            hint={`${d.bio.trim().length}/600 — diga o que faz, para quem, e algo parecido que já entregou. É o texto que decide se te chamam.`}
          >
            <Textarea
              rows={6} value={d.bio} maxLength={600}
              onChange={(e) => set('bio', e.target.value)}
              placeholder="Contabilidade para pequenas empresas e MEI. Abertura, regularização e acompanhamento mensal. Atendo Goiânia e região há 12 anos."
            />
          </Field>
        </Card>

        <Card className="space-y-4 p-5">
          <SectionTitle hint={`Escolha até ${MAX_AREAS}. É por aqui que alguém te encontra ao procurar por área.`}>
            Em que você atua ({d.especialidades.length}/{MAX_AREAS})
          </SectionTitle>

          {grupos.length === 0 ? (
            <p className="text-sm text-muted">Carregando as áreas…</p>
          ) : (
            <div className="space-y-4">
              {grupos.map(([grupo, itens]) => (
                <div key={grupo}>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{grupo}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {itens.map((c) => (
                      <Chip
                        key={c.id}
                        size="sm"
                        active={d.especialidades.includes(c.id)}
                        onClick={() => alternarArea(c.id)}
                      >
                        {c.nome}
                      </Chip>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="space-y-4 p-5">
          <SectionTitle>Telefone</SectionTitle>
          <Banner tone="info" icon="lock" title="Ninguém vê este número">
            Ele não aparece no seu perfil nem na busca. Só é mostrado ao outro lado quando uma
            proposta é aceita — de um lado e do outro, ao mesmo tempo. É assim de propósito: com
            telefone à vista, o primeiro a se cadastrar em massa é quem quer a lista.
          </Banner>
          <Field label="Telefone com DDD" hint="Opcional, mas sem ele fica difícil fechar negócio.">
            <Input
              type="tel" value={d.telefone ?? ''} placeholder="(62) 99999-0000"
              onChange={(e) => set('telefone', e.target.value || undefined)}
            />
          </Field>
        </Card>

        <div className="flex gap-2 pb-4">
          <Button variant="ghost" onClick={back}>Cancelar</Button>
          <Button className="ml-auto" icon="check" loading={salvando} onClick={() => void save()}>Salvar alterações</Button>
        </div>
      </section>
    </Page>
  );
}
