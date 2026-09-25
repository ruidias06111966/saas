import { useEffect, useMemo, useState } from 'react';
import type { User } from '../types';
import {
  MIN_AGE, POLICY_VERSION, URL_DIRETRIZES, URL_PRIVACIDADE, URL_TERMOS,
} from '../constants';
import { NOMES_DE_CIDADE, UFS, coordenadasDe } from '../services/localizacao';
import { useApp } from '../state/AppContext';
import {
  Bar, Banner, Button, Card, Checkbox, Chip, Field, Icon, Input, Select, Textarea, Toggle,
} from '../components/ui';
import { Portrait } from '../components/Portrait';
import { readImageAsDataUrl } from '../services/storage';
import { uploadProfilePhoto } from '../services/media';
import { resendConfirmation, signUp } from '../services/auth';
import { supabaseEnabled } from '../services/supabaseClient';
import { clearDraft, loadDraft, saveDraft } from '../services/signupDraft';
import * as backend from '../services/backend';
import { type Categoria, listarCategorias } from '../services/mercado';
import { blurCoord, isEmail, sha256, uid } from '../services/utils';

// ---------------------------------------------------------------------------
// Cadastro.
//
// Eram SETE etapas: conta, você, objetivo de relacionamento, interesses, jeito
// de ser (a bússola), suas palavras (as perguntas de perfil) e foto/termos.
// Agora são QUATRO, e o corte não foi por pressa — foi porque cada pergunta a
// mais é gente que desiste no meio, e nenhuma daquelas ajudava alguém a ser
// contratado.
//
// A DATA DE NASCIMENTO SAIU. Os Termos continuam valendo só para maiores de
// 18, e o registro disso continua existindo: é o consentimento `maioridade`,
// marcado na última etapa. O que não existe mais é a coleta de uma data que o
// app não usava para nada além de mostrar a idade ao lado do nome — e mostrar
// idade num perfil profissional é convite para discriminação etária.
//
// O máximo de 5 áreas é cobrado no BANCO (gatilho no_maximo_cinco_especialidades).
// Aqui só impedimos de chegar lá.
// ---------------------------------------------------------------------------

const STEPS = ['Conta', 'Seu trabalho', 'Suas áreas', 'Foto e termos'];
const MAX_AREAS = 5;

interface Draft {
  name: string; email: string; password: string; password2: string;
  city: string; state: string;
  profession: string; bio: string;
  especialidades: string[];
  anosExperiencia: string;
  atendeRemoto: boolean;
  telefone: string;
  photo?: string; photoFile?: File; verified: boolean;
  acceptTerms: boolean; acceptPrivacy: boolean; acceptGuidelines: boolean;
}

const EMPTY: Draft = {
  name: '', email: '', password: '', password2: '',
  city: '', state: 'GO',
  profession: '', bio: '',
  especialidades: [], anosExperiencia: '', atendeRemoto: true, telefone: '',
  verified: false, acceptTerms: false, acceptPrivacy: false, acceptGuidelines: false,
};

export function Signup() {
  const { state, dispatch, navigate, toast, refresh, pendingAccount } = useApp();
  // `pendingAccount` = a conta já existe no Auth e o e-mail já foi confirmado,
  // mas o perfil nunca chegou a ser gravado. Nesse caso a etapa "Conta" não faz
  // sentido: e-mail e senha já estão definidos.
  const [step, setStep] = useState(pendingAccount ? 1 : 0);
  const [d, setD] = useState<Draft>(
    pendingAccount ? { ...EMPTY, email: pendingAccount.email } : EMPTY,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  /** Preenchido quando o cadastro terminou e falta a pessoa confirmar o e-mail. */
  const [aguardandoEmail, setAguardandoEmail] = useState('');
  const [retomando, setRetomando] = useState(!!pendingAccount);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setD((prev) => ({ ...prev, [key]: value }));

  const [categorias, setCategorias] = useState<Categoria[]>([]);
  useEffect(() => { listarCategorias().then(setCategorias).catch(() => {}); }, []);

  const grupos = useMemo(() => {
    const m = new Map<string, Categoria[]>();
    for (const c of categorias) m.set(c.grupo, [...(m.get(c.grupo) ?? []), c]);
    return [...m.entries()];
  }, [categorias]);

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

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (step === 0) {
      if (d.name.trim().split(/\s+/).length < 2) e.name = 'Informe nome e sobrenome.';
      if (!isEmail(d.email)) e.email = 'E-mail inválido.';
      if (!supabaseEnabled && state.users.some((u) => (u.email ?? '').toLowerCase() === d.email.trim().toLowerCase())) {
        e.email = 'Já existe uma conta com este e-mail.';
      }
      if (d.password.length < 8) e.password = 'Use pelo menos 8 caracteres.';
      if (d.password !== d.password2) e.password2 = 'As senhas não conferem.';
    }
    if (step === 1) {
      if (!d.profession.trim()) e.profession = 'Diga como você se apresenta profissionalmente.';
      if (!d.city.trim()) e.city = 'Informe sua cidade.';
      if (d.bio.trim().length < 60) e.bio = 'Escreva ao menos 60 caracteres. É o texto que decide se te chamam.';
      if (d.anosExperiencia && (Number(d.anosExperiencia) < 0 || Number(d.anosExperiencia) > 70)) {
        e.anosExperiencia = 'Informe um número entre 0 e 70.';
      }
    }
    if (step === 2 && d.especialidades.length === 0) {
      e.especialidades = 'Escolha pelo menos uma área. Sem isso ninguém te encontra na busca.';
    }
    if (step === 3) {
      if (!d.acceptTerms || !d.acceptPrivacy || !d.acceptGuidelines) {
        e.consent = 'É necessário aceitar os três documentos para criar a conta.';
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = async () => {
    if (!validate()) return;
    if (step < STEPS.length - 1) { setStep(step + 1); window.scrollTo({ top: 0 }); return; }
    await finish();
  };

  /** Monta o objeto de domínio a partir do formulário. */
  const montarUsuario = async (dados: Draft, id: string, foto?: string): Promise<User> => {
    // Cidade reconhecida devolve a própria coordenada; desconhecida cai na
    // capital da UF. Ver services/localizacao.ts para o porquê.
    const [lat, lng] = coordenadasDe(dados.city, dados.state);
    const now = new Date().toISOString();
    return {
      id, name: dados.name.trim(), email: dados.email.trim().toLowerCase(),
      passwordHash: supabaseEnabled ? '' : await sha256(dados.password),
      city: dados.city.trim(), state: dados.state,
      approxLat: blurCoord(lat), approxLng: blurCoord(lng),
      photo: foto, extraPhotos: [],
      profession: dados.profession.trim(), bio: dados.bio.trim(),
      especialidades: dados.especialidades,
      atendeRemoto: dados.atendeRemoto,
      anosExperiencia: dados.anosExperiencia ? Number(dados.anosExperiencia) : undefined,
      telefone: dados.telefone.trim() || undefined,
      verified: false, reputation: 70, plan: 'free', role: 'user', status: 'ativo',
      consents: [
        { kind: 'termos', version: POLICY_VERSION, acceptedAt: now },
        { kind: 'privacidade', version: POLICY_VERSION, acceptedAt: now },
        { kind: 'diretrizes', version: POLICY_VERSION, acceptedAt: now },
        // O registro de maioridade continua existindo mesmo sem data de
        // nascimento guardada: é ele que sustenta a exigência dos Termos.
        { kind: 'maioridade', version: POLICY_VERSION, acceptedAt: now },
      ],
      createdAt: now, lastActiveAt: now,
    };
  };

  /** A foto do rascunho volta como dataURL; o upload precisa de um arquivo. */
  const arquivoDaFoto = async (dados: Draft): Promise<File | undefined> => {
    if (dados.photoFile) return dados.photoFile;
    if (!dados.photo?.startsWith('data:')) return undefined;
    const blob = await (await fetch(dados.photo)).blob();
    return new File([blob], 'perfil.jpg', { type: blob.type || 'image/jpeg' });
  };

  /**
   * Grava o perfil. Só é chamada quando JÁ existe sessão — antes disso o RLS
   * recusaria tudo, porque tanto a política de `users` quanto a do Storage
   * comparam com auth.uid().
   */
  const gravarPerfil = async (dados: Draft, id: string) => {
    let foto: string | undefined;
    const arquivo = await arquivoDaFoto(dados);
    if (arquivo) {
      try {
        foto = await uploadProfilePhoto(arquivo, id);
      } catch (err) {
        // Sem foto o perfil ainda vale; ela pode ser enviada depois.
        toast((err as Error).message, 'warn');
      }
    }
    const user = await montarUsuario(dados, id, foto);
    await backend.saveUser(user);
    await backend.salvarEspecialidades(user.id, user.especialidades);
    await backend.saveConsents(user.id, user.consents);
    clearDraft();
    await refresh();
  };

  // Retomada: a conta existe, o e-mail foi confirmado, e o perfil ficou
  // esperando neste aparelho. Conclui sozinho, sem pedir tudo de novo.
  useEffect(() => {
    if (!pendingAccount) return;
    const rascunho = loadDraft(pendingAccount.id) as Draft | null;
    if (!rascunho) { setRetomando(false); return; }
    setBusy(true);
    gravarPerfil({ ...rascunho, email: pendingAccount.email }, pendingAccount.id)
      .then(() => toast('Bem-vindo! Seu perfil está pronto.', 'ok'))
      .catch((err: Error) => {
        toast(`Não foi possível concluir o cadastro: ${err.message}`, 'danger');
        setD({ ...rascunho, email: pendingAccount.email });
      })
      .finally(() => { setBusy(false); setRetomando(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAccount?.id]);

  const finish = async () => {
    setBusy(true);

    // Caminho de retomada: a conta já existe, só falta o perfil.
    if (pendingAccount) {
      try {
        await gravarPerfil(d, pendingAccount.id);
        toast('Cadastro concluído. Seu perfil já pode receber trabalho.', 'ok');
      } catch (err) {
        toast(`Não foi possível salvar o perfil: ${(err as Error).message}`, 'danger');
      }
      setBusy(false);
      return;
    }

    if (!supabaseEnabled) {
      const user = await montarUsuario(d, uid('u'), d.photo);
      dispatch({ type: 'REGISTER', user });
      setBusy(false);
      toast('Conta criada. Seu perfil já pode receber trabalho.', 'ok');
      return;
    }

    let novoId: string;
    let precisaConfirmarEmail: boolean;
    try {
      const r = await signUp(d.email, d.password);
      if (!r.userId) throw new Error('Não foi possível criar a conta.');
      novoId = r.userId;
      precisaConfirmarEmail = r.needsEmailConfirmation;
    } catch (err) {
      setBusy(false);
      setStep(0);
      setErrors({ email: (err as Error).message });
      return;
    }

    // Com confirmação de e-mail ligada não há sessão ainda, e sem sessão o RLS
    // recusa qualquer escrita. O perfil espera no aparelho e sobe na primeira
    // entrada — ver services/signupDraft.ts.
    if (precisaConfirmarEmail) {
      saveDraft(novoId, d.email.trim().toLowerCase(), { ...d, photoFile: undefined, password: '', password2: '' });
      setBusy(false);
      setAguardandoEmail(d.email.trim().toLowerCase());
      return;
    }

    try {
      await gravarPerfil(d, novoId);
      toast('Conta criada. Seu perfil já pode receber trabalho.', 'ok');
    } catch (err) {
      toast(`Conta criada, mas o perfil não foi salvo: ${(err as Error).message}`, 'danger');
    }
    setBusy(false);
  };

  const progress = ((step + 1) / STEPS.length) * 100;

  // Cadastro feito, falta confirmar o e-mail. Nada foi gravado no servidor
  // ainda — o perfil está guardado neste aparelho e sobe na primeira entrada.
  if (aguardandoEmail) {
    return (
      <div className="mx-auto w-full max-w-2xl px-5 py-10">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Cadastro</p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight">Confirme seu e-mail</h1>
        <Card className="mt-5 p-6">
          <p className="text-[15px] leading-relaxed">
            Enviamos um link de confirmação para <strong>{aguardandoEmail}</strong>. Abra a mensagem
            e clique no link — você volta para cá já com a conta ativa, e o perfil que você acabou
            de preencher é salvo automaticamente.
          </p>
          <div className="mt-4">
            <Banner tone="info" icon="info" title="Ainda não gravamos nada no servidor">
              Seu perfil está guardado neste navegador até a confirmação. Se você confirmar em outro
              aparelho, a conta funciona igual — só vamos pedir os dados do perfil de novo.
            </Banner>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              variant="outline" icon="mail" loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await resendConfirmation(aguardandoEmail);
                  toast('Enviamos de novo. Confira também a caixa de spam.', 'ok');
                } catch (err) {
                  toast((err as Error).message, 'danger');
                } finally { setBusy(false); }
              }}
            >
              Reenviar o e-mail
            </Button>
            <Button variant="ghost" onClick={() => navigate({ name: 'login' })}>Ir para a entrada</Button>
          </div>
        </Card>
      </div>
    );
  }

  // Retomada automática em andamento.
  if (retomando) {
    return (
      <div className="mx-auto w-full max-w-2xl px-5 py-10">
        <h1 className="font-display text-2xl font-bold tracking-tight">Concluindo seu cadastro</h1>
        <Card className="mt-5 p-6">
          <p className="text-[13px] text-muted">Salvando o perfil que você preencheu. Um instante…</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-8">
      <div className="mb-6 flex items-center gap-3">
        <button
          type="button" aria-label="Voltar"
          onClick={() => {
            // Na retomada a etapa "Conta" não existe: e-mail e senha já estão
            // definidos, e voltar até ela pediria uma senha que não será usada.
            const minimo = pendingAccount ? 1 : 0;
            if (step > minimo) setStep(step - 1);
            else if (!pendingAccount) navigate({ name: 'landing' });
          }}
          className="-ml-2 grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-brandSoft hover:text-ink"
        >
          <Icon name="back" />
        </button>
        <div className="flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Etapa {step + 1} de {STEPS.length} · {STEPS[step]}
          </p>
          <Bar value={progress} className="mt-1.5" />
        </div>
      </div>

      <Card className="p-6 sm:p-8">
        {step === 0 && (
          <div className="space-y-4">
            <h1 className="font-display text-2xl font-bold">Vamos começar</h1>
            <p className="-mt-2 text-sm text-muted">Só o essencial. O perfil vem nas próximas etapas.</p>
            <Field label="Nome completo" required error={errors.name}>
              <Input value={d.name} onChange={(e) => set('name', e.target.value)} placeholder="Como você quer ser chamado" autoComplete="name" />
            </Field>
            <Field label="E-mail" required error={errors.email} hint="Nunca aparece no seu perfil público.">
              <Input type="email" value={d.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Senha" required error={errors.password} hint="Mínimo de 8 caracteres.">
                <Input type="password" value={d.password} onChange={(e) => set('password', e.target.value)} autoComplete="new-password" />
              </Field>
              <Field label="Confirmar senha" required error={errors.password2}>
                <Input type="password" value={d.password2} onChange={(e) => set('password2', e.target.value)} autoComplete="new-password" />
              </Field>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <div>
              <h1 className="font-display text-2xl font-bold">Seu trabalho</h1>
              <p className="mt-1 text-sm text-muted">
                É o que aparece para quem procura alguém. Escreva pensando em quem vai te contratar.
              </p>
            </div>

            <Field label="Profissão" required error={errors.profession} hint='Como você se apresenta: "Contadora", "Engenheiro civil", "Consultor de licitações".'>
              <Input value={d.profession} onChange={(e) => set('profession', e.target.value)} placeholder="Contadora" />
            </Field>

            <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
              <Field label="Cidade" required error={errors.city} hint="Mostramos só a cidade, nunca o endereço.">
                <Input value={d.city} onChange={(e) => set('city', e.target.value)} placeholder="Goiânia" list="cidades" />
                <datalist id="cidades">{NOMES_DE_CIDADE.map((c) => <option key={c} value={c} />)}</datalist>
              </Field>
              <Field label="Estado" required>
                <Select value={d.state} onChange={(e) => set('state', e.target.value)}>
                  {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
                </Select>
              </Field>
            </div>

            <Field label="Anos de experiência" error={errors.anosExperiencia} hint="Opcional.">
              <Input
                type="number" min={0} max={70} value={d.anosExperiencia}
                onChange={(e) => set('anosExperiencia', e.target.value)} placeholder="12"
              />
            </Field>

            <Toggle
              checked={d.atendeRemoto}
              onChange={(v) => set('atendeRemoto', v)}
              label="Atendo a distância"
              description="Deixe ligado se você consegue trabalhar por vídeo, telefone e documento assinado digitalmente. Isso te coloca em anúncios remotos de todo o país."
            />

            <Field
              label="O que você faz"
              required
              error={errors.bio}
              hint={`${d.bio.trim().length}/600 — diga o que faz, para quem, e algo parecido que já entregou.`}
            >
              <Textarea
                rows={6} value={d.bio} maxLength={600}
                onChange={(e) => set('bio', e.target.value)}
                placeholder="Contabilidade para pequenas empresas e MEI. Abertura, regularização e acompanhamento mensal. Atendo Goiânia e região há 12 anos."
              />
            </Field>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div>
              <h1 className="font-display text-2xl font-bold">Em que você atua</h1>
              <p className="mt-1 text-sm text-muted">
                Escolha até {MAX_AREAS}. É por aqui que alguém te encontra ao procurar por área — e
                por onde os anúncios da sua área chegam até você.
              </p>
            </div>

            {errors.especialidades && (
              <p className="text-xs font-medium text-danger">{errors.especialidades}</p>
            )}

            <p className="text-[13px] font-semibold text-brand">
              {d.especialidades.length} de {MAX_AREAS} escolhidas
            </p>

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
                          key={c.id} size="sm"
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

            <Field label="Telefone com DDD" hint="Opcional. Ninguém vê este número — ele só é mostrado quando uma proposta é aceita.">
              <Input
                type="tel" value={d.telefone} placeholder="(62) 99999-0000"
                onChange={(e) => set('telefone', e.target.value)}
              />
            </Field>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <div>
              <h1 className="font-display text-2xl font-bold">Foto e termos</h1>
              <p className="mt-1 text-sm text-muted">
                Sua foto aparece nítida para todo mundo. Pode ser seu rosto ou o logotipo da sua
                empresa — o que representar melhor você no trabalho.
              </p>
            </div>

            <div className="flex items-center gap-5">
              <Portrait seed={d.email || 'novo'} photo={d.photo} name={d.name || 'Você'} className="h-28 w-28" />
              <div className="flex-1">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-line px-4 py-2 text-[13px] font-semibold transition-colors hover:bg-bg">
                  <Icon name="image" size={16} />
                  {d.photo ? 'Trocar foto' : 'Enviar foto'}
                  <input
                    type="file" accept="image/*" className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        setD((prev) => ({ ...prev, photoFile: file }));
                        set('photo', await readImageAsDataUrl(file));
                      } catch (err) { toast((err as Error).message, 'danger'); }
                    }}
                  />
                </label>
                <p className="mt-2 text-xs leading-relaxed text-muted">
                  Opcional, mas perfil sem foto recebe muito menos resposta.
                </p>
              </div>
            </div>

            {/* O selo não é gravável pelo cliente: o servidor congela a coluna
                `verified` (gatilho campos_privilegiados). */}
            <div className="rounded-2xl border border-line p-4">
              <p className="flex items-center gap-2 text-[13px] font-semibold">
                <Icon name="shield" size={16} className="text-sage" /> Verificação de perfil
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Depois de entrar, você pode pedir a verificação no seu perfil. O selo é concedido
                pelo servidor — nunca pelo aplicativo no seu aparelho — e pesa muito na hora de
                alguém escolher entre duas propostas parecidas.
              </p>
            </div>

            <div className="rounded-2xl bg-bg p-4">
              <Checkbox checked={d.acceptTerms} onChange={(v) => set('acceptTerms', v)}>
                Li e aceito os <a href={URL_TERMOS} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink underline underline-offset-2">Termos de Uso</a>.
              </Checkbox>
              <Checkbox checked={d.acceptPrivacy} onChange={(v) => set('acceptPrivacy', v)}>
                Li a <a href={URL_PRIVACIDADE} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink underline underline-offset-2">Política de Privacidade</a> e concordo com o tratamento
                dos meus dados conforme a LGPD. Posso exportar ou apagar tudo a qualquer momento.
              </Checkbox>
              <Checkbox checked={d.acceptGuidelines} onChange={(v) => set('acceptGuidelines', v)}>
                Concordo com as <a href={URL_DIRETRIZES} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink underline underline-offset-2">Diretrizes da Comunidade</a> e confirmo que
                tenho {MIN_AGE} anos ou mais.
              </Checkbox>
              {errors.consent && <p className="mt-2 text-xs font-medium text-danger">{errors.consent}</p>}
            </div>

            <Banner tone="info" icon="lock">
              Guardamos apenas a cidade e uma coordenada arredondada. Sua posição exata nunca sai do
              seu aparelho, e o seu telefone não aparece para ninguém até uma proposta ser aceita.
            </Banner>
          </div>
        )}

        <div className="mt-8 flex items-center gap-3">
          {step > 0 && <Button variant="ghost" onClick={() => setStep(step - 1)}>Voltar</Button>}
          <Button className="ml-auto" onClick={next} loading={busy}>
            {step === STEPS.length - 1 ? 'Criar minha conta' : 'Continuar'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
