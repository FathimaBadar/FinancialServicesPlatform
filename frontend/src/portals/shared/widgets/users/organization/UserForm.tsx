import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Alert, Button } from '../../../ui/atoms';
import { FormField } from '../../kit/FormField';
import { RolePicker } from './RolePicker';
import { FIELD_FOR_CODE, userFormSchema } from './model';
import type { Problem, RoleOption, UserFormField, UserFormValues, UserRow } from './model';

export interface UserFormProps {
  mode: 'create' | 'edit';
  user?: UserRow;
  roles: RoleOption[] | undefined;
  rolesLoading: boolean;
  /** set when roles cannot be changed here (e.g. editing yourself) */
  rolesLockedReason?: string;
  busy: boolean;
  problem: Problem | null;
  onSubmit: (values: UserFormValues) => void;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onReload: () => void;
}

type Errors = Partial<Record<UserFormField, string>>;

function initialValues(user?: UserRow): UserFormValues {
  return {
    username: user?.username ?? '',
    fullName: user?.fullName ?? '',
    email: user?.email ?? '',
    phone: user?.phone ?? '',
    roleIds: user?.roles.map((r) => r.id) ?? [],
    checker: user?.checker ?? false,
  };
}

/**
 * Create / edit form. Validates each field on blur and everything on submit (ui-std §8);
 * server rejections land on the field they concern, anything else as a form-level alert.
 */
export function UserForm({
  mode, user, roles, rolesLoading, rolesLockedReason, busy, problem, onSubmit, onCancel, onDirtyChange, onReload,
}: UserFormProps) {
  const initial = useMemo(() => initialValues(user), [user]);
  const [values, setValues] = useState<UserFormValues>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  // server problem → field error when it maps to one
  const serverField = problem ? FIELD_FOR_CODE[problem.code] : undefined;
  useEffect(() => {
    if (problem && serverField) setErrors((e) => ({ ...e, [serverField]: problem.message }));
  }, [problem, serverField]);

  const set = <K extends UserFormField>(k: K, v: UserFormValues[K]) => {
    setValues((s) => ({ ...s, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const validateField = (k: UserFormField) => {
    if (mode === 'edit' && k === 'username') return;
    const r = userFormSchema.shape[k].safeParse(values[k]);
    setErrors((e) => ({ ...e, [k]: r.success ? undefined : r.error.issues[0]?.message }));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const candidate = mode === 'edit' ? { ...values, username: user?.username ?? values.username } : values;
    const r = userFormSchema.safeParse(candidate);
    if (!r.success) {
      const next: Errors = {};
      for (const issue of r.error.issues) {
        const k = issue.path[0] as UserFormField;
        if (!next[k]) next[k] = issue.message;
      }
      setErrors(next);
      return;
    }
    onSubmit(r.data);
  };

  const stale = problem?.code === 'STALE_WRITE';

  return (
    <form noValidate onSubmit={submit} className="flex h-full min-h-0 flex-col">
      <div className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto p-5">
        {problem && !serverField && (
          <Alert kind="bad">
            {problem.message}
            {stale && (
              <button type="button" className="ml-2 font-extrabold underline" onClick={onReload}>
                Reload user
              </button>
            )}
          </Alert>
        )}

        <FormField
          label="Full name"
          autoComplete="off"
          value={values.fullName}
          error={errors.fullName}
          onChange={(e) => set('fullName', e.target.value)}
          onBlur={() => validateField('fullName')}
          autoFocus
        />

        {mode === 'create' ? (
          <FormField
            label="Username"
            autoComplete="off"
            spellCheck={false}
            value={values.username}
            error={errors.username}
            hint="Used to sign in. Lowercase; can’t be changed later."
            onChange={(e) => set('username', e.target.value.toLowerCase())}
            onBlur={() => validateField('username')}
          />
        ) : (
          <FormField label="Username" value={`@${user?.username ?? ''}`} disabled hint="Usernames can’t be changed." />
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Email"
            type="email"
            optional
            autoComplete="off"
            value={values.email}
            error={errors.email}
            onChange={(e) => set('email', e.target.value)}
            onBlur={() => validateField('email')}
          />
          <FormField
            label="Phone"
            type="tel"
            optional
            autoComplete="off"
            placeholder="+264 81 123 4567"
            value={values.phone}
            error={errors.phone}
            onChange={(e) => set('phone', e.target.value)}
            onBlur={() => validateField('phone')}
          />
        </div>

        <RolePicker
          options={roles}
          loading={rolesLoading}
          selected={values.roleIds}
          onChange={(next) => set('roleIds', next)}
          lockedReason={rolesLockedReason}
          error={errors.roleIds}
        />

        <label className="flex items-start gap-3 rounded-xl border border-line p-3">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={values.checker}
            disabled={busy || Boolean(rolesLockedReason)}
            onChange={(e) => set('checker', e.target.checked)}
          />
          <span className="grid gap-0.5">
            <span className="text-sm font-bold">Checker</span>
            <span className="text-dim text-[12px] leading-relaxed">
              Can approve, reject or return requests other people submit (four-eyes). They still need the
              matching permission, and can never decide their own requests.
              {rolesLockedReason ? ` ${rolesLockedReason}` : ''}
            </span>
          </span>
        </label>

        {mode === 'create' && (
          <p className="text-dim rounded-xl border border-dashed border-line p-3 text-[12px] leading-relaxed">
            The new user signs in with this environment’s initial password. Share it with them through a secure channel.
          </p>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-line p-4">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={busy || (mode === 'edit' && !dirty)} aria-busy={busy}>
          {busy ? 'Saving…' : mode === 'create' ? 'Add user' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}
