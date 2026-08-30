import { useState } from 'react';
import type { ReportReason, User } from '../types';
import { REPORT_REASON_LABEL } from '../constants';
import { useApp } from '../state/AppContext';
import { Banner, Button, Checkbox, Modal, Textarea } from './ui';
import { firstName } from '../services/utils';

const REASONS = Object.keys(REPORT_REASON_LABEL) as ReportReason[];

export function ReportDialog({ open, onClose, target }: {
  open: boolean; onClose: () => void; target: User;
}) {
  const { reportUser, blockUser } = useApp();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [description, setDescription] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(true);

  const submit = () => {
    if (!reason) return;
    reportUser(target.id, reason, description);
    if (alsoBlock) blockUser(target.id);
    setReason(null); setDescription(''); onClose();
  };

  return (
    <Modal
      open={open} onClose={onClose} title={`Denunciar ${firstName(target.name)}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="danger" onClick={submit} disabled={!reason}>Enviar denúncia</Button>
        </>
      }
    >
      <Banner tone="info" icon="shield">
        Denúncias são analisadas por uma pessoa da equipe. Nenhuma conta é banida automaticamente por
        um algoritmo — mas conteúdo de risco é ocultado enquanto a análise acontece.
      </Banner>

      <fieldset className="mt-4">
        <legend className="mb-2 text-[13px] font-semibold">O que aconteceu?</legend>
        <div className="space-y-1">
          {REASONS.map((r) => (
            <label
              key={r}
              className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-2.5 text-sm transition-colors ${
                reason === r ? 'border-brand bg-brandSoft text-brand' : 'border-line hover:bg-bg'
              }`}
            >
              <input
                type="radio" name="reason" value={r} checked={reason === r}
                onChange={() => setReason(r)} className="text-brand focus:ring-brand/30"
              />
              {REPORT_REASON_LABEL[r]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-4">
        <label className="mb-1.5 block text-[13px] font-semibold">Conte o que houve (opcional)</label>
        <Textarea
          value={description} onChange={(e) => setDescription(e.target.value)}
          maxLength={600} placeholder="Quanto mais específico, mais rápido conseguimos agir."
        />
      </div>

      <div className="mt-3">
        <Checkbox checked={alsoBlock} onChange={setAlsoBlock}>
          Bloquear esta pessoa também. Ela deixa de aparecer para você e não consegue mais te contatar.
        </Checkbox>
      </div>
    </Modal>
  );
}
