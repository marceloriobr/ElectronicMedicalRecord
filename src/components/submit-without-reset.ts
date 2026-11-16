import { startTransition, type FormEvent } from "react";

/**
 * Envia o formulário à Server Action SEM o reset automático do React 19 (que acontece com `<form action>`).
 * Necessário em formulários com campos controlados: o reset devolveria o DOM ao valor inicial
 * enquanto o estado do React continua com o valor digitado.
 */
export function submitWithoutReset(action: (fd: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    startTransition(() => action(fd));
  };
}
