'use client';

import { useFormStatus } from 'react-dom';

// Locks while its form is submitting, so a double-click can't submit twice.
export default function SubmitButton({ children, pendingText, className = 'btn', ...rest }) {
  const { pending } = useFormStatus();
  return (
    <button className={className} disabled={pending} aria-busy={pending} {...rest}>
      {pending ? pendingText ?? children : children}
    </button>
  );
}
