import React, { useCallback, useRef, useState } from 'react';
import { Modal } from './Modal';
import { AppButton } from './AppButton';

/**
 * Controlled confirmation dialog built on <Modal>. Replaces the native,
 * unstyled window.confirm(). For the common imperative case, prefer the
 * useConfirm() hook below.
 */
export function ConfirmDialog({
  open,
  onConfirm,
  onCancel,
  title = 'Are you sure?',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  loading = false,
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <AppButton variant="ghost" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </AppButton>
          <AppButton
            variant={variant === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Working…' : confirmLabel}
          </AppButton>
        </>
      }
    >
      {message && <p className="body-text" style={{ margin: 0 }}>{message}</p>}
    </Modal>
  );
}

/**
 * Promise-based confirmation. Drop-in replacement for window.confirm():
 *
 *   const { confirm, confirmDialog } = useConfirm();
 *   ...
 *   if (!(await confirm({ message: 'Delete this?' }))) return;
 *   ...
 *   return (<>{confirmDialog}{/* rest of tree *\/}</>);
 */
export function useConfirm() {
  const [state, setState] = useState({ open: false, options: {} });
  const resolverRef = useRef(null);

  const confirm = useCallback(
    (options = {}) =>
      new Promise((resolve) => {
        resolverRef.current = resolve;
        setState({ open: true, options });
      }),
    []
  );

  const settle = useCallback((result) => {
    setState((s) => ({ open: false, options: s.options }));
    if (resolverRef.current) {
      resolverRef.current(result);
      resolverRef.current = null;
    }
  }, []);

  const confirmDialog = (
    <ConfirmDialog
      open={state.open}
      title={state.options.title}
      message={state.options.message}
      confirmLabel={state.options.confirmLabel}
      cancelLabel={state.options.cancelLabel}
      variant={state.options.variant}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  );

  return { confirm, confirmDialog };
}

export default ConfirmDialog;
