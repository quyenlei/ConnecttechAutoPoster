import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

export interface ConfirmOptions {
  /** Text of the button that agrees. */
  okLabel?: string;
  /** Red agree button, for deleting. */
  danger?: boolean;
}

type Confirm = (message: string, options?: ConfirmOptions) => Promise<boolean>;

interface Pending extends Required<ConfirmOptions> {
  message: string;
  resolve: (ok: boolean) => void;
}

const ConfirmContext = createContext<Confirm | null>(null);

/**
 * Asks for confirmation in a dialog drawn by the extension page itself. `window.confirm` is not used: the
 * dashboard and chat box are framed inside Facebook pages, where the browser may block its dialogs, and a
 * blocked dialog silently answers "no", so buttons looked dead.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const current = useRef<Pending | null>(null);

  const confirm = useCallback<Confirm>((message, options = {}) => new Promise<boolean>((resolve) => {
    current.current?.resolve(false); // a newer question replaces an unanswered one
    const next: Pending = { message, okLabel: options.okLabel ?? 'Đồng ý', danger: options.danger ?? false, resolve };
    current.current = next;
    setPending(next);
  }), []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (pending && !dialog.open) dialog.showModal();
    if (!pending && dialog.open) dialog.close();
  }, [pending]);

  function answer(ok: boolean) {
    current.current?.resolve(ok);
    current.current = null;
    setPending(null);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <dialog
        ref={dialogRef}
        className="confirm"
        aria-labelledby="confirm-message"
        onCancel={(event) => {
          event.preventDefault();
          answer(false);
        }}
      >
        {pending && (
          <form
            className="confirm__body"
            onSubmit={(event) => {
              event.preventDefault();
              answer(true);
            }}
          >
            <p id="confirm-message" className="confirm__message">{pending.message}</p>
            <div className="confirm__actions">
              <button className="button" type="button" onClick={() => answer(false)}>Hủy</button>
              <button className={pending.danger ? 'button button--danger' : 'button button--primary'} type="submit" autoFocus>
                {pending.okLabel}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirm needs a ConfirmProvider');
  return confirm;
}
