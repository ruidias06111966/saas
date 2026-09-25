import { useEffect, useMemo, useState } from 'react';
import type { User } from '../types';
import { useApp } from '../state/AppContext';
import { blockedIdsFor } from '../state/appState';
import { isEligible } from '../services/perfil';
import { Page } from '../components/layout/AppShell';
import { Button, Card, Chip, Empty, Field, Icon, Input, Select } from '../components/ui';
import { Avatar } from '../components/Portrait';
import { UFS } from '../services/localizacao';
import { normalizarCidade } from '../services/localizacao';
import { type Categoria, listarCategorias } from '../services/mercado';

// ---------------------------------------------------------------------------
// Quem faz o quê.
//
// Ocupa o lugar da antiga Descobrir, e a diferença é a mesma que separa o
// quadro de anúncios da curadoria: a Descobrir EMPURRAVA cinco pessoas por dia,
// escolhidas por um cálculo de afinidade. Aqui a pessoa PROCURA — por área,
// por estado, por palavra.
//
// A busca é feita em memória, sobre o que o retrato já trouxe, e não no banco.
// É uma escolha consciente e tem prazo de validade: enquanto a base couber num
// carregamento, filtrar aqui é instantâneo e não gasta viagem. Quando não
// couber, isto vira uma consulta paginada como a de `buscarAnuncios` — e o
// lugar para mudar é só este arquivo.
// ---------------------------------------------------------------------------

function Cartao({ u, categorias, onAbrir }: {
  u: User; categorias: Map<string, string>; onAbrir: () => void;
}) {
  return (
    <Card className="transition-shadow hover:shadow-lift">
      <button type="button" className="flex w-full items-start gap-4 p-4 text-left" onClick={onAbrir}>
        <Avatar seed={u.id} photo={u.photo} name={u.name} size={56} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[15px] font-semibold">
            {u.name}
            {u.verified && <Icon name="check" size={13} className="ml-1.5 inline text-sage" />}
          </p>
          <p className="truncate text-[12px] text-muted">
            {u.profession || 'Profissão não informada'} · {u.city}, {u.state}
            {typeof u.anosExperiencia === 'number' && ` · ${u.anosExperiencia} anos`}
          </p>

          {u.especialidades.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {u.especialidades.slice(0, 3).map((id) => (
                <Chip key={id} size="sm" tone="brand">{categorias.get(id) ?? id}</Chip>
              ))}
              {u.especialidades.length > 3 && (
                <Chip size="sm">+{u.especialidades.length - 3}</Chip>
              )}
            </div>
          )}

          {u.bio && <p className="mt-2 line-clamp-2 text-[13px] text-muted">{u.bio}</p>}
        </div>
      </button>
    </Card>
  );
}

export function Profissionais() {
  const { me, state, navigate } = useApp();
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [texto, setTexto] = useState('');
  const [area, setArea] = useState('');
  const [uf, setUf] = useState('');
  const [soRemoto, setSoRemoto] = useState(false);

  useEffect(() => { listarCategorias().then(setCategorias).catch(() => {}); }, []);

  const nomeDaCategoria = useMemo(
    () => new Map(categorias.map((c) => [c.id, c.nome])),
    [categorias],
  );

  const grupos = useMemo(() => {
    const m = new Map<string, Categoria[]>();
    for (const c of categorias) m.set(c.grupo, [...(m.get(c.grupo) ?? []), c]);
    return [...m.entries()];
  }, [categorias]);

  const resultados = useMemo(() => {
    if (!me) return [];
    const bloqueados = blockedIdsFor(state, me.id);
    // Sem acento e sem caixa: metade do Brasil digita "goiania" e "construcao".
    // A mesma armadilha que a busca de anúncios resolve no banco, com a
    // configuração `portugues_sem_acento`. Aqui resolve `normalizarCidade`,
    // que já existia para o nome das cidades.
    const termo = normalizarCidade(texto);

    return state.users
      .filter((u) => isEligible(me, u, bloqueados))
      .filter((u) => (area ? u.especialidades.includes(area) : true))
      .filter((u) => (uf ? u.state === uf : true))
      .filter((u) => (soRemoto ? u.atendeRemoto : true))
      .filter((u) => {
        if (!termo) return true;
        const alvo = normalizarCidade(
          `${u.name} ${u.profession} ${u.bio} ${u.city} ${u.especialidades.map((e) => nomeDaCategoria.get(e) ?? '').join(' ')}`,
        );
        return termo.split(' ').every((palavra) => alvo.includes(palavra));
      })
      .sort((a, b) => {
        // Verificado primeiro, depois reputação. Perfil vazio afunda sozinho:
        // sem áreas escolhidas, ninguém chega aqui por filtro de área.
        if (a.verified !== b.verified) return a.verified ? -1 : 1;
        return b.reputation - a.reputation;
      });
  }, [me, state, texto, area, uf, soRemoto, nomeDaCategoria]);

  if (!me) return null;

  const temFiltro = !!(texto || area || uf || soRemoto);
  const limpar = () => { setTexto(''); setArea(''); setUf(''); setSoRemoto(false); };

  return (
    <Page
      title="Profissionais"
      subtitle={`${resultados.length} pessoa(s) cadastradas. Procure por área, cidade ou palavra.`}
      maxWidth="max-w-4xl"
    >
      <div className="mb-5">
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
            <Icon name="search" size={17} />
          </span>
          <Input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="contador, engenheiro, alvará, Goiânia…"
            className="!pl-10"
            aria-label="Buscar profissionais"
          />
        </div>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Field label="Área">
          <Select value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="">Todas</option>
            {grupos.map(([grupo, itens]) => (
              <optgroup key={grupo} label={grupo}>
                {itens.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </optgroup>
            ))}
          </Select>
        </Field>

        <Field label="Estado">
          <Select value={uf} onChange={(e) => setUf(e.target.value)}>
            <option value="">Todos</option>
            {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
          </Select>
        </Field>

        <Field label="Atendimento">
          <Select value={soRemoto ? 'remoto' : ''} onChange={(e) => setSoRemoto(e.target.value === 'remoto')}>
            <option value="">Tanto faz</option>
            <option value="remoto">Só quem atende a distância</option>
          </Select>
        </Field>
      </div>

      {temFiltro && (
        <div className="mb-4">
          <Button size="sm" variant="ghost" onClick={limpar}>Limpar filtros</Button>
        </div>
      )}

      {resultados.length === 0 ? (
        <Empty
          icon="users"
          title={temFiltro ? 'Ninguém com esses filtros' : 'Ainda não há outros profissionais'}
          body={temFiltro
            ? 'Tente outras palavras, ou limpe os filtros para ver todo mundo.'
            : 'Conforme as pessoas se cadastrarem, elas aparecem aqui. Enquanto isso, publique o que você precisa: um anúncio aberto atrai quem ainda nem chegou.'}
          action={temFiltro
            ? <Button size="sm" variant="outline" onClick={limpar}>Limpar filtros</Button>
            : <Button size="sm" icon="plus" onClick={() => navigate({ name: 'publicar' })}>Publicar um anúncio</Button>}
        />
      ) : (
        <div className="space-y-3">
          {resultados.map((u) => (
            <Cartao
              key={u.id} u={u} categorias={nomeDaCategoria}
              onAbrir={() => navigate({ name: 'person', id: u.id })}
            />
          ))}
        </div>
      )}
    </Page>
  );
}
