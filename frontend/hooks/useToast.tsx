import { useRef, ReactNode, useCallback } from 'react';
import { Toast } from 'primereact/toast';

export type ToastSeverity = 'success' | 'info' | 'warn' | 'error';

export interface ShowToastOptions {
  severity: ToastSeverity;
  summary: string;
  detail?: string;
  life?: number;
}

export interface UseToastReturn {
  toast: ReactNode;
  toastRef: React.RefObject<Toast>;
  showToast: (options: ShowToastOptions) => void;
  showSuccess: (summary: string, detail?: string, life?: number) => void;
  showError: (summary: string, detail?: string, life?: number) => void;
  showInfo: (summary: string, detail?: string, life?: number) => void;
  showWarning: (summary: string, detail?: string, life?: number) => void;
  showWarn: (summary: string, detail?: string, life?: number) => void;
}

export function useToast(): UseToastReturn {
  const toast = useRef<Toast>(null);

  const showToast = useCallback(({
    severity,
    summary,
    detail,
    life = 3000,
  }: ShowToastOptions) => {
    toast.current?.show({
      severity,
      summary,
      detail,
      life,
    });
  }, []);

  const showSuccess = useCallback((summary: string, detail?: string, life?: number) => {
    showToast({ severity: 'success', summary, detail, life });
  }, [showToast]);

  const showError = useCallback((summary: string, detail?: string, life?: number) => {
    showToast({ severity: 'error', summary, detail, life });
  }, [showToast]);

  const showInfo = useCallback((summary: string, detail?: string, life?: number) => {
    showToast({ severity: 'info', summary, detail, life });
  }, [showToast]);

  const showWarning = useCallback((summary: string, detail?: string, life?: number) => {
    showToast({ severity: 'warn', summary, detail, life });
  }, [showToast]);

  return {
    toast: <Toast ref={toast} />,
    toastRef: toast,
    showToast,
    showSuccess,
    showError,
    showInfo,
    showWarning,
    showWarn: showWarning, // Alias for consistency
  };
}
