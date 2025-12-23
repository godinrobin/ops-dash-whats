import { useRef, createRef } from 'react';
import type { ToasterRef } from '@/components/ui/toast';

// Global ref for the toaster
let globalToasterRef: ToasterRef | null = null;

export const setGlobalToasterRef = (ref: ToasterRef | null) => {
  globalToasterRef = ref;
};

// Main toast API - use this everywhere
export const splashedToast = {
  success: (title: string, description: string = '') => {
    globalToasterRef?.show({
      title,
      message: description,
      variant: 'success',
      highlightTitle: true,
    });
  },
  error: (title: string, description: string = '') => {
    globalToasterRef?.show({
      title,
      message: description,
      variant: 'error',
      highlightTitle: true,
    });
  },
  warning: (title: string, description: string = '') => {
    globalToasterRef?.show({
      title,
      message: description,
      variant: 'warning',
      highlightTitle: true,
    });
  },
  info: (title: string, description: string = '') => {
    globalToasterRef?.show({
      title,
      message: description,
      variant: 'default',
    });
  },
  show: (props: {
    title?: string;
    message: string;
    variant?: 'default' | 'success' | 'error' | 'warning';
    duration?: number;
    actions?: { label: string; onClick: () => void };
  }) => {
    globalToasterRef?.show(props);
  },
};

// Legacy toast function for compatibility with old useToast pattern
export const toast = (options: { title?: string; description?: string; variant?: string } | string) => {
  if (typeof options === 'string') {
    globalToasterRef?.show({
      message: options,
      variant: 'success',
    });
    return;
  }
  
  const { title = '', description = '', variant } = options;
  const toastVariant = variant === 'destructive' ? 'error' : 'success';
  globalToasterRef?.show({
    title,
    message: description,
    variant: toastVariant,
    highlightTitle: true,
  });
};

// Compatibility hook for components using useToast pattern
export const useToast = () => {
  return {
    toast,
    toasts: [],
    dismiss: () => {},
  };
};

// Hook for components that need direct ref access
export const useSplashedToast = () => {
  const toastRef = useRef<ToasterRef>(null);

  return {
    toastRef,
    setRef: (ref: ToasterRef | null) => {
      if (ref) {
        setGlobalToasterRef(ref);
      }
    },
    toast: splashedToast,
  };
};
