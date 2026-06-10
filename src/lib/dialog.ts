export type DialogOptions = {
  type: 'confirm' | 'prompt';
  title?: string;
  message: string;
  defaultValue?: string;
  onConfirm?: (value?: string) => void;
  onCancel?: () => void;
};

type DialogListener = (options: DialogOptions) => void;
let listener: DialogListener | null = null;

export const setDialogListener = (l: DialogListener) => {
  listener = l;
};

export const customConfirm = (message: string, title?: string): Promise<boolean> => {
  return new Promise((resolve) => {
    if (!listener) {
      resolve(window.confirm(message));
      return;
    }
    listener({
      type: 'confirm',
      title,
      message,
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false),
    });
  });
};

export const customPrompt = (message: string, defaultValue?: string, title?: string): Promise<string | null> => {
  return new Promise((resolve) => {
    if (!listener) {
      resolve(window.prompt(message, defaultValue));
      return;
    }
    listener({
      type: 'prompt',
      title,
      message,
      defaultValue,
      onConfirm: (val) => resolve(val || null),
      onCancel: () => resolve(null),
    });
  });
};

export const customAlert = (message: string) => {
  // Try to use toast dynamically if available
  try {
    const sonner = require('sonner');
    if (message.toLowerCase().includes('error') || message.toLowerCase().includes('inválid')) {
      sonner.toast.error(message);
    } else {
      sonner.toast.success(message);
    }
  } catch (e) {
    window.alert(message);
  }
};
