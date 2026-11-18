import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '../../../ui/atoms';
import { FormField } from '../../kit/FormField';
import { newRoleSchema } from './model';
import type { NewRoleValues } from './model';

export interface NewRoleFormProps {
  busy: boolean;
  onSubmit: (v: NewRoleValues) => void;
  onCancel: () => void;
}

type Errors = Partial<Record<keyof NewRoleValues, string>>;

/** Request a new (empty) role; permissions are added by a change request once it exists. Zod on blur/submit. */
export function NewRoleForm({ busy, onSubmit, onCancel }: NewRoleFormProps) {
  const [values, setValues] = useState<NewRoleValues>({ key: '', name: '' });
  const [errors, setErrors] = useState<Errors>({});

  const check = (only?: keyof NewRoleValues): NewRoleValues | null => {
    const r = newRoleSchema.safeParse(values);
    const next: Errors = {};
    if (!r.success) for (const issue of r.error.issues) next[issue.path[0] as keyof NewRoleValues] ??= issue.message;
    setErrors((e) => (only ? { ...e, [only]: next[only] } : next));
    return r.success ? r.data : null;
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const ok = check();
    if (ok) onSubmit(ok);
  };

  return (
    <form className="grid gap-3 rounded-xl border border-line-strong bg-raised p-3 sm:grid-cols-2" onSubmit={submit} noValidate>
      <FormField label="Role key" placeholder="AUDITOR" value={values.key} error={errors.key}
        onChange={(e) => setValues((v) => ({ ...v, key: e.target.value }))} onBlur={() => check('key')} />
      <FormField label="Name" placeholder="Auditor" value={values.name} error={errors.name}
        onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))} onBlur={() => check('name')} />
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Sending…' : 'Request new role'}</Button>
      </div>
    </form>
  );
}
