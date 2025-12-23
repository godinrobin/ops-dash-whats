import { useRef, useEffect } from 'react';
import { SplashedPushNotificationsHandle, NotificationType } from '@/components/ui/splashed-push-notifications';

let globalToastRef: SplashedPushNotificationsHandle | null = null;

export const setGlobalToastRef = (ref: SplashedPushNotificationsHandle | null) => {
  globalToastRef = ref;
};

export const splashedToast = {
  success: (title: string, description: string = '') => {
    globalToastRef?.createNotification('success', title, description);
  },
  error: (title: string, description: string = '') => {
    globalToastRef?.createNotification('error', title, description);
  },
  warning: (title: string, description: string = '') => {
    globalToastRef?.createNotification('warning', title, description);
  },
  info: (title: string, description: string = '') => {
    globalToastRef?.createNotification('help', title, description);
  },
};

export const useSplashedToast = () => {
  const toastRef = useRef<SplashedPushNotificationsHandle>(null);

  useEffect(() => {
    if (toastRef.current) {
      setGlobalToastRef(toastRef.current);
    }
    return () => {
      setGlobalToastRef(null);
    };
  }, []);

  return {
    toastRef,
    toast: {
      success: (title: string, description: string = '') => {
        toastRef.current?.createNotification('success', title, description);
      },
      error: (title: string, description: string = '') => {
        toastRef.current?.createNotification('error', title, description);
      },
      warning: (title: string, description: string = '') => {
        toastRef.current?.createNotification('warning', title, description);
      },
      info: (title: string, description: string = '') => {
        toastRef.current?.createNotification('help', title, description);
      },
    },
  };
};
