import { useEffect, useState } from 'react';
import type { AxisKey, Gender, Lifestyle, RelationshipGoal, SeekingGender, User } from '../types';
import {
  AXES, GENDER_LABEL, GOAL_EMOJI, GOAL_LABEL, LIFESTYLE_FIELDS, MIN_AGE, PACE_LABEL, POLICY_VERSION,
} from '../constants';
import { INTEREST_CATEGORIES, INTERESTS } from '../data/interests';
import { PROFILE_PROMPTS } from '../data/prompts';
import { useApp } from '../state/AppContext';
import {
  Bar, Banner, Button, Card, Checkbox, Chip, Field, Icon, Input, Select, Slider, Textarea,
} from '../components/ui';
import { Portrait } from '../components/Portrait';
import { readImageAsDataUrl } from '../services/storage';
import { uploadProfilePhoto } from '../services/media';
import { resendConfirmation, signUp } from '../services/auth';
import { supabaseEnabled } from '../services/supabaseClient';
import { clearDraft, loadDraft, saveDraft } from '../services/signupDraft';
import * as backend from '../services/backend';
import { age, blurCoord, cx, isEmail, sha256, uid } from '../services/utils';

// Em produção isto seria geocodificação no servidor; a coordenada é sempre
// arredondada antes de sair do cliente, para nunca guardarmos posição exata.
const CITY_COORDS: Record<string, [number, number]> = {
  'são paulo': [-23.55, -46.63], 'campinas': [-22.90, -47.06], 'santo andré': [-23.66, -46.53],
  'guarulhos': [-23.45, -46.53], 'osasco': [-23.53, -46.79], 'são bernardo do campo': [-23.69, -46.56],
  'sorocaba': [-23.50, -47.45], 'rio de janeiro': [-22.91, -43.17], 'belo horizonte': [-19.92, -43.94],
  'curitiba': [-25.43, -49.27], 'porto alegre': [-30.03, -51.23], 'salvador': [-12.97, -38.50],
  'recife': [-8.05, -34.88], 'fortaleza': [-3.73, -38.52], 'brasília': [-15.79, -47.88],
};

const UF = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

const STEPS = ['Conta', 'Você', 'Objetivo', 'Interesses', 'Jeito de ser', 'Suas palavras', 'Foto e termos'];

interface Draft {
  name: string; email: string; password: string; password2: string; birthDate: string;
  gender: Gender | ''; city: string; state: string;
  seeking: SeekingGender[]; ageMin: number; ageMax: number; maxDistanceKm: number;
  goal: RelationshipGoal | ''; chatPace: User['chatPace'];
  interests: string[]; personality: Record<AxisKey, number>; lifestyle: Lifestyle;
  profession: string; bio: string; answers: Record<string, string>;
  photo?: string; photoFile?: File; verified: boolean;
  acceptTerms: boolean; acceptPrivacy: boolean; acceptGuidelines: boolean;
}

const EMPTY: Draft = {
  name: '', email: '', password: '', password2: '', birthDate: '',
  gender: '', city: '', state: 'SP',
  seeking: [], ageMin: 25, ageMax: 40, maxDistanceKm: 50,
  goal: '', chatPace: 'equilibrado',
  interests: [], personality: { energia: 50, ritmo: 50, planejamento: 50, afeto: 50, novidade: 50 },
  lifestyle: { bebida: 'socialmente', fumo: 'nao', exercicio: 'as_vezes', filhos: 'indeciso', animais: 'gosto', religiosidade: 'pouco' },
  profession: '', bio: '', answers: {},
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

  const userAge = d.birthDate ? age(d.birthDate) : null;

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
      if (!d.birthDate) e.birthDate = 'Informe sua data de nascimento.';
      else if (userAge !== null && userAge < MIN_AGE) e.birthDate = `O CONEXÃO é exclusivo para maiores de ${MIN_AGE} anos.`;
      else if (userAge !== null && userAge > 110) e.birthDate = 'Data inválida.';
    }
    if (step === 1) {
      if (!d.gender) e.gender = 'Escolha uma opção.';
      if (!d.city.trim()) e.city = 'Informe sua cidade.';
      if (!d.seeking.length) e.seeking = 'Escolha quem você quer conhecer.';
      if (d.ageMin > d.ageMax) e.ageMin = 'A idade mínima não pode ser maior que a máxima.';
    }
    if (step === 2 && !d.goal) e.goal = 'Escolha o que você procura agora.';
    if (step === 3 && d.interests.length < 5) e.interests = 'Escolha pelo menos 5 interesses.';
    if (step === 5) {
      const filled = Object.values(d.answers).filter((v) => v.trim().length >= 20).length;
      if (filled < 3) e.answers = 'Responda pelo menos 3 perguntas com 20 caracteres ou mais.';
      if (d.bio.trim().length < 40) e.bio = 'Escreva ao menos 40 caracteres na bio.';
    }
    if (step === 6) {
      if (!d.acceptTerms || !d.acceptPrivacy || !d.acceptGuidelines) e.consent = 'É necessário aceitar os três documentos para criar a conta.';
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
    const key = dados.city.trim().toLowerCase();
    const [lat, lng] = CITY_COORDS[key] ?? CITY_COORDS['são paulo'];
    const now = new Date().toISOString();
    return {
      id, name: dados.name.trim(), email: dados.email.trim().toLowerCase(),
      passwordHash: supabaseEnabled ? '' : await sha256(dados.password),
      birthDate: dados.birthDate, age: age(dados.birthDate), gender: dados.gender as Gender,
      city: dados.city.trim(), state: dados.state,
      approxLat: blurCoord(lat), approxLng: blurCoord(lng),
      photo: foto, extraPhotos: [], profession: dados.profession.trim(), bio: dados.bio.trim(),
      interests: dados.interests, personality: dados.personality, lifestyle: dados.lifestyle,
      chatPace: dados.chatPace, goal: dados.goal as RelationshipGoal,
      answers: Object.entries(dados.answers).filter(([, v]) => v.trim())
        .map(([promptId, answer]) => ({ promptId, answer: answer.trim() })),
      preferences: {
        seeking: dados.seeking, ageMin: dados.ageMin, ageMax: dados.ageMax,
        maxDistanceKm: dados.maxDistanceKm, goals: [], minCompatibility: 0,
      },
      verified: false, reputation: 70, plan: 'free', role: 'user', status: 'ativo',
      consents: [
        { kind: 'termos', version: POLICY_VERSION, acceptedAt: now },
        { kind: 'privacidade', version: POLICY_VERSION, acceptedAt: now },
        { kind: 'diretrizes', version: POLICY_VERSION, acceptedAt: now },
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
        toast('Cadastro concluído. Sua primeira curadoria já está esperando.', 'ok');
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
      toast('Conta criada. Sua primeira curadoria já está esperando.', 'ok');
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
      toast('Conta criada. Sua primeira curadoria já está esperando.', 'ok');
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
            <p className="-mt-2 text-sm text-muted">Só o essencial. O perfil bonito vem nas próximas etapas.</p>
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
            <Field
              label="Data de nascimento" required error={errors.birthDate}
              hint={userAge !== null && userAge >= MIN_AGE ? `Você tem ${userAge} anos.` : `Exclusivo para maiores de ${MIN_AGE} anos.`}
            >
              <Input type="date" value={d.birthDate} onChange={(e) => set('birthDate', e.target.value)} max={new Date().toISOString().slice(0, 10)} />
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <h1 className="font-display text-2xl font-bold">Sobre você</h1>
            <Field label="Como você se identifica" required error={errors.gender}>
              <div className="mt-1 flex flex-wrap gap-2">
                {(Object.keys(GENDER_LABEL) as Gender[]).map((g) => (
                  <Chip key={g} active={d.gender === g} onClick={() => set('gender', g)}>{GENDER_LABEL[g]}</Chip>
                ))}
              </div>
            </Field>

            <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
              <Field label="Cidade" required error={errors.city} hint="Mostramos só a cidade, nunca o endereço.">
                <Input value={d.city} onChange={(e) => set('city', e.target.value)} placeholder="São Paulo" list="cidades" />
                <datalist id="cidades">{Object.keys(CITY_COORDS).map((c) => <option key={c} value={c.replace(/\b\w/g, (m) => m.toUpperCase())} />)}</datalist>
              </Field>
              <Field label="Estado" required>
                <Select value={d.state} onChange={(e) => set('state', e.target.value)}>
                  {UF.map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
              </Field>
            </div>

            <Field label="Quem você quer conhecer" required error={errors.seeking}>
              <div className="mt-1 flex flex-wrap gap-2">
                {(['mulher', 'homem', 'nao_binario', 'todos'] as SeekingGender[]).map((g) => (
                  <Chip
                    key={g} active={d.seeking.includes(g)}
                    onClick={() => set('seeking', d.seeking.includes(g) ? d.seeking.filter((x) => x !== g) : [...d.seeking, g])}
                  >
                    {g === 'todos' ? 'Todas as pessoas' : GENDER_LABEL[g as Gender]}
                  </Chip>
                ))}
              </div>
            </Field>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Idade mínima" error={errors.ageMin}>
                <Input type="number" min={18} max={99} value={d.ageMin} onChange={(e) => set('ageMin', Number(e.target.value))} />
              </Field>
              <Field label="Idade máxima">
                <Input type="number" min={18} max={99} value={d.ageMax} onChange={(e) => set('ageMax', Number(e.target.value))} />
              </Field>
              <Field label="Distância máxima" hint={`${d.maxDistanceKm} km`}>
                <Input type="range" min={5} max={300} step={5} value={d.maxDistanceKm} onChange={(e) => set('maxDistanceKm', Number(e.target.value))} className="!border-0 !bg-transparent !px-0 accent-[rgb(var(--c-brand))]" />
              </Field>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <h1 className="font-display text-2xl font-bold">O que você procura agora?</h1>
            <p className="-mt-3 text-sm text-muted">Pode mudar depois. Ninguém é obrigado a saber o resto da vida.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {(Object.keys(GOAL_LABEL) as RelationshipGoal[]).map((g) => (
                <button
                  key={g} type="button" onClick={() => set('goal', g)}
                  className={cx(
                    'rounded-2xl border p-4 text-left transition-all',
                    d.goal === g ? 'border-brand bg-brandSoft shadow-soft' : 'border-line hover:border-brand/40',
                  )}
                >
                  <span className="text-2xl">{GOAL_EMOJI[g]}</span>
                  <p className="mt-1.5 font-display text-base font-semibold">{GOAL_LABEL[g]}</p>
                </button>
              ))}
            </div>
            {errors.goal && <p className="text-xs font-medium text-danger">{errors.goal}</p>}

            <Field label="Seu ritmo de conversa" hint="Isso entra no cálculo de compatibilidade — ritmos muito diferentes desgastam.">
              <div className="mt-1 space-y-2">
                {(Object.keys(PACE_LABEL) as (keyof typeof PACE_LABEL)[]).map((p) => (
                  <button
                    key={p} type="button" onClick={() => set('chatPace', p)}
                    className={cx(
                      'w-full rounded-2xl border p-3.5 text-left text-sm transition-colors',
                      d.chatPace === p ? 'border-brand bg-brandSoft text-brand' : 'border-line hover:bg-bg',
                    )}
                  >
                    {PACE_LABEL[p]}
                  </button>
                ))}
              </div>
            </Field>
          </div>
        )}

        {step === 3 && (
          <div>
            <h1 className="font-display text-2xl font-bold">Seus interesses</h1>
            <p className="mt-1 text-sm text-muted">
              Escolha pelo menos 5. Interesses mais específicos pesam mais quando batem com os de alguém.
            </p>
            <p className={cx('mt-3 text-[13px] font-semibold', d.interests.length >= 5 ? 'text-sage' : 'text-muted')}>
              {d.interests.length} selecionado(s)
            </p>
            {errors.interests && <p className="mt-1 text-xs font-medium text-danger">{errors.interests}</p>}
            <div className="mt-4 space-y-5">
              {INTEREST_CATEGORIES.map((cat) => (
                <div key={cat}>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{cat}</p>
                  <div className="flex flex-wrap gap-2">
                    {INTERESTS.filter((i) => i.category === cat).map((i) => (
                      <Chip
                        key={i.id} active={d.interests.includes(i.id)}
                        onClick={() => set('interests', d.interests.includes(i.id) ? d.interests.filter((x) => x !== i.id) : [...d.interests, i.id])}
                      >
                        {i.emoji} {i.label}
                      </Chip>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6">
            <div>
              <h1 className="font-display text-2xl font-bold">Bússola de Conexão</h1>
              <p className="mt-1 text-sm text-muted">
                Cinco eixos, sem resposta certa. Alguns pesam por semelhança, outros aceitam bem o contrário.
              </p>
            </div>
            <div className="space-y-1">
              {AXES.map((ax) => (
                <Slider
                  key={ax.key} label={ax.label} left={ax.left} right={ax.right} hint={ax.hint}
                  value={d.personality[ax.key]}
                  onChange={(v) => set('personality', { ...d.personality, [ax.key]: v })}
                />
              ))}
            </div>
            <div className="border-t border-line pt-5">
              <p className="mb-3 font-display text-lg font-semibold">Estilo de vida</p>
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
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-5">
            <div>
              <h1 className="font-display text-2xl font-bold">Suas palavras</h1>
              <p className="mt-1 text-sm text-muted">
                É isto que aparece primeiro no seu Cartão de Essência — antes da sua foto.
              </p>
            </div>
            <Field label="Profissão">
              <Input value={d.profession} onChange={(e) => set('profession', e.target.value)} placeholder="O que você faz" />
            </Field>
            <Field label="Bio" required error={errors.bio} hint={`${d.bio.length}/400`}>
              <Textarea value={d.bio} onChange={(e) => set('bio', e.target.value)} maxLength={400} placeholder="Duas ou três frases sobre você. O que você faz num sábado costuma dizer mais do que adjetivos." />
            </Field>
            <div>
              <p className="mb-2 text-[13px] font-semibold">Responda pelo menos 3</p>
              {errors.answers && <p className="mb-2 text-xs font-medium text-danger">{errors.answers}</p>}
              <div className="space-y-3">
                {PROFILE_PROMPTS.slice(0, 6).map((p) => (
                  <div key={p.id}>
                    <label className="mb-1 block text-[13px] font-medium text-brand">{p.label}</label>
                    <Textarea
                      value={d.answers[p.id] ?? ''} maxLength={p.maxLength} placeholder={p.placeholder}
                      onChange={(e) => set('answers', { ...d.answers, [p.id]: e.target.value })}
                      className="min-h-[70px]"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 6 && (
          <div className="space-y-5">
            <div>
              <h1 className="font-display text-2xl font-bold">Foto e termos</h1>
              <p className="mt-1 text-sm text-muted">
                Sua foto entra velada na descoberta e se revela conforme suas conversas evoluem.
              </p>
            </div>

            <div className="flex items-center gap-5">
              <Portrait seed={d.email || 'novo'} photo={d.photo} name={d.name || 'Você'} reveal={0.2} className="h-28 w-28" />
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
                  Opcional. Sem foto, geramos um retrato abstrato só seu.
                </p>
              </div>
            </div>

            {/* O selo não é mais gravável pelo cliente: o servidor congela a
                coluna `verified` (gatilho campos_privilegiados). No modo online
                o botão de simular seria uma promessa que o banco recusa. */}
            <div className="rounded-2xl border border-line p-4">
              <p className="flex items-center gap-2 text-[13px] font-semibold">
                <Icon name="shield" size={16} className="text-sage" /> Verificação de perfil
              </p>
              {supabaseEnabled ? (
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  Depois de entrar, você pode pedir a verificação no seu perfil: uma selfie
                  reproduzindo uma pose sorteada, analisada por uma pessoa da equipe. O selo é
                  concedido pelo servidor — nunca pelo aplicativo no seu aparelho.
                </p>
              ) : (
                <>
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    Esta é a demonstração local, então o selo aqui é só enfeite. No modo online ele
                    depende de uma selfie analisada por uma pessoa da equipe.
                  </p>
                  <Button
                    size="sm" variant={d.verified ? 'secondary' : 'outline'} className="mt-3"
                    icon={d.verified ? 'check' : 'shield'} onClick={() => set('verified', !d.verified)}
                  >
                    {d.verified ? 'Verificado (simulado)' : 'Simular verificação agora'}
                  </Button>
                </>
              )}
            </div>

            <div className="rounded-2xl bg-bg p-4">
              <Checkbox checked={d.acceptTerms} onChange={(v) => set('acceptTerms', v)}>
                Li e aceito os <strong className="text-ink">Termos de Uso</strong>.
              </Checkbox>
              <Checkbox checked={d.acceptPrivacy} onChange={(v) => set('acceptPrivacy', v)}>
                Li a <strong className="text-ink">Política de Privacidade</strong> e concordo com o tratamento
                dos meus dados conforme a LGPD. Posso exportar ou apagar tudo a qualquer momento.
              </Checkbox>
              <Checkbox checked={d.acceptGuidelines} onChange={(v) => set('acceptGuidelines', v)}>
                Concordo com as <strong className="text-ink">Diretrizes da Comunidade</strong> e confirmo que
                tenho {MIN_AGE} anos ou mais.
              </Checkbox>
              {errors.consent && <p className="mt-2 text-xs font-medium text-danger">{errors.consent}</p>}
            </div>

            <Banner tone="info" icon="lock">
              Guardamos apenas a cidade e uma coordenada arredondada para calcular faixas de distância.
              Sua posição exata nunca sai do seu dispositivo.
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
