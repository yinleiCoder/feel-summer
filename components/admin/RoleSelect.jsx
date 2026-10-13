'use client';

import { useState, useTransition } from 'react';

import { setUserRole } from '@/app/(site)/admin/actions';
import { ROLES, ROLE_LABELS } from '@/lib/roles';

// A native <select> rather than the shadcn Select: one control, no extra
// dependency, and it is keyboard- and screen-reader-correct for free.
const RoleSelect = ({ userId, role }) => {
  const [value, setValue] = useState(role);
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();

  function handleChange(event) {
    const next = event.target.value;
    const previous = value;
    setValue(next);
    setError(null);

    startTransition(async () => {
      const result = await setUserRole(userId, next);
      if (result?.error) {
        // Put the control back where it was, so the UI never shows a role the
        // database rejected.
        setValue(previous);
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <select
        value={value}
        onChange={handleChange}
        disabled={pending}
        aria-label="角色"
        className="h-8 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        {ROLES.map((r) => (
          <option key={r} value={r} className="bg-card text-foreground">
            {ROLE_LABELS[r]}
          </option>
        ))}
      </select>
      {pending && <span className="text-[11px] text-muted-foreground">保存中…</span>}
      {error && <span className="text-[11px] text-destructive">{error}</span>}
    </div>
  );
};

export default RoleSelect;
