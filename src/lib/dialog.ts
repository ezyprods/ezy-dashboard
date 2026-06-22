'use client';
import { toast } from 'sonner';

export type DialogOptions = {
  type: 'confirm' | 'prompt';
  title?: string;
  message: string;
  defaultValue?: string;
  onConfirm?: (value?: string) => void;
  onCancel?: () => void;
};

type DialogListener = (options: DialogOptions) => void;

export const setDialogListener = (l: DialogListener) => {
  // Not used directly anymore, keeping signature for backwards compatibility
};

export const customConfirm = (message: string, title?: string): Promise<boolean> => {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(false);
      return;
    }
    
    // Fallback to window.confirm if DialogProvider is missing after 1s
    let handled = false;
    const fallbackTimeout = setTimeout(() => {
      if (!handled) {
        handled = true;
        resolve(window.confirm(message));
      }
    }, 500);

    const event = new CustomEvent('custom-dialog', {
      detail: {
        type: 'confirm',
        title,
        message,
        onConfirm: () => {
          if (handled) return;
          handled = true;
          clearTimeout(fallbackTimeout);
          resolve(true);
        },
        onCancel: () => {
          if (handled) return;
          handled = true;
          clearTimeout(fallbackTimeout);
          resolve(false);
        },
      }
    });
    window.dispatchEvent(event);
  });
};

export const customPrompt = (message: string, defaultValue?: string, title?: string): Promise<string | null> => {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(null);
      return;
    }
    
    let handled = false;
    const fallbackTimeout = setTimeout(() => {
      if (!handled) {
        handled = true;
        resolve(window.prompt(message, defaultValue));
      }
    }, 500);

    const event = new CustomEvent('custom-dialog', {
      detail: {
        type: 'prompt',
        title,
        message,
        defaultValue,
        onConfirm: (val: string | undefined) => {
          if (handled) return;
          handled = true;
          clearTimeout(fallbackTimeout);
          resolve(val || null);
        },
        onCancel: () => {
          if (handled) return;
          handled = true;
          clearTimeout(fallbackTimeout);
          resolve(null);
        },
      }
    });
    window.dispatchEvent(event);
  });
};



export const customAlert = (message: string) => {
  if (message.toLowerCase().includes('error') || message.toLowerCase().includes('inválid')) {
    toast.error(message);
  } else {
    toast.success(message);
  }
};
