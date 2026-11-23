import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Alert, Button } from '../../../ui/atoms';
import { FormField } from '../../kit/FormField';
import { CURRENCY, EMPTY_VALUES, FIELD_LABEL, isItemField, itemSchema } from './model';
import type { ItemField, ItemValues } from './model';

export interface ItemFormProps {
  initial?: ItemValues;
  submitLabel: string;
  busy: boolean;
  /** the server's message for the last attempt, shown above the buttons */
  problem?: string | null;
  /** product ids already in the list (other lines), for the duplicate check */
  takenIds: readonly string[];
  /** clear the fields after each add (manual entry, one item after another) */
  resetOnSubmit?: boolean;
  onSubmit: (values: ItemValues) => void;
  onCancel?: () => void;
}

type Errors = Partial<Record<ItemField, string>>;

function validate(values: ItemValues, takenIds: readonly string[]): Errors {
  const out: Errors = {};
  const r = itemSchema.safeParse(values);
  if (!r.success) {
    for (const issue of r.error.issues) {
      const f = issue.path[0];
      if (typeof f === 'string' && isItemField(f) && !out[f]) out[f] = issue.message;
    }
  }
  const id = values.productId.trim().toUpperCase();
  if (id && !out.productId && takenIds.some((t) => t.trim().toUpperCase() === id)) {
    out.productId = 'This product id is already in the list.';
  }
  return out;
}

const trimmed = (v: ItemValues): ItemValues => ({
  productId: v.productId.trim(),
  name: v.name.trim(),
  quantity: v.quantity.trim(),
  unitPrice: v.unitPrice.trim(),
  totalPrice: v.totalPrice.trim(),
});

/** One inventory line. Validates with zod on blur and on submit; errors sit on their field. */
export function ItemForm({ initial, submitLabel, busy, problem, takenIds, resetOnSubmit, onSubmit, onCancel }: ItemFormProps) {
  const [values, setValues] = useState<ItemValues>(initial ?? EMPTY_VALUES);
  const [touched, setTouched] = useState<Partial<Record<ItemField, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const errors = validate(values, takenIds);
  const shown = (f: ItemField) => (submitted || touched[f] ? errors[f] : undefined);

  const field = (f: ItemField) => ({
    value: values[f],
    error: shown(f),
    disabled: busy,
    onChange: (e: ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [f]: e.target.value })),
    onBlur: () => setTouched((t) => ({ ...t, [f]: true })),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0) return;
    onSubmit(trimmed(values));
    if (resetOnSubmit) {
      setValues(EMPTY_VALUES);
      setTouched({});
      setSubmitted(false);
    }
  };

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label={FIELD_LABEL.productId} placeholder="MM-10KG-001" autoComplete="off" {...field('productId')} />
        <FormField label={FIELD_LABEL.name} placeholder="Maize meal 10kg" autoComplete="off" {...field('name')} />
        <FormField label={FIELD_LABEL.quantity} inputMode="numeric" placeholder="120" hint="Whole units" {...field('quantity')} />
        <FormField label={`${FIELD_LABEL.unitPrice} (${CURRENCY})`} inputMode="decimal" placeholder="119.99" {...field('unitPrice')} />
        <FormField
          label={`${FIELD_LABEL.totalPrice} (${CURRENCY})`}
          inputMode="decimal"
          optional
          hint="Leave empty and the server calculates it. If you fill it in, it must equal quantity × unit price."
          {...field('totalPrice')}
        />
      </div>
      {problem && <Alert kind="bad">{problem}</Alert>}
      <div className="flex flex-wrap justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
        <Button type="submit" variant="primary" disabled={busy} aria-busy={busy}>
          {busy ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  );
}
