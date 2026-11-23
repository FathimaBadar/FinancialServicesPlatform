import { useState } from 'react';
import type { FormEvent } from 'react';
import { Alert, Button } from '../../../ui/atoms';
import { FormField } from '../../kit/FormField';
import { branchFormSchema, isSameName, NAME_MAX, nameError } from './model';
import type { BranchFormValues, BranchRow } from './model';

export interface BranchFormProps {
  /** null = a new branch; otherwise the branch being renamed */
  branch: BranchRow | null;
  busy: boolean;
  /** the server's refusal, already in words; `onName` puts it on the field (e.g. name taken) */
  serverError: { text: string; onName: boolean } | null;
  onSubmit: (values: BranchFormValues) => void;
  onCancel: () => void;
}

/**
 * Maker surface (ui-std §5.2 / §8): the name, validated on blur and on submit, error on the
 * field. Submitting files a request — a checker approves it before anything changes.
 */
export function BranchForm({ branch, busy, serverError, onSubmit, onCancel }: BranchFormProps) {
  const [name, setName] = useState(branch?.name ?? '');
  const [touched, setTouched] = useState(false);
  const localError = touched ? nameError(name) : null;
  const unchanged = branch !== null && isSameName(name, branch.name);
  const fieldError = localError ?? (serverError?.onName ? serverError.text : undefined);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    const parsed = branchFormSchema.safeParse({ name });
    if (!parsed.success || unchanged) return;
    onSubmit(parsed.data);
  };

  return (
    // Drawer layout (same as users.organization UserForm): padded scrolling body, buttons in a footer bar
    <form className="flex h-full min-h-0 flex-col" noValidate onSubmit={submit} data-testid="branch-form">
      <div className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto p-5">
        <p className="text-dim text-[13px]">
          {branch
            ? 'The new name is sent for approval. The branch keeps its current name until a checker approves it.'
            : 'The new branch is sent for approval. It can be used once a different person approves it.'}
        </p>
        <FormField
          label="Branch name"
          value={name}
          maxLength={NAME_MAX + 20}
          autoComplete="off"
          placeholder="e.g. Windhoek Maerua Mall"
          data-testid="branch-name"
          aria-invalid={Boolean(fieldError)}
          error={fieldError ?? undefined}
          hint={branch ? `Current name: ${branch.name}` : `2–${NAME_MAX} characters`}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setTouched(true)}
        />
        {unchanged && touched && <p className="text-dim text-[12px]">That is the current name — change it to send a rename.</p>}
        {serverError && !serverError.onName && <Alert kind="bad">{serverError.text}</Alert>}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-4">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button
          type="submit"
          variant="primary"
          data-action={branch ? 'branch.edit' : 'branch.create'}
          data-testid="branch-submit"
          disabled={busy || unchanged}
          aria-busy={busy}
        >
          {busy ? 'Sending…' : 'Send for approval'}
        </Button>
      </div>
    </form>
  );
}
