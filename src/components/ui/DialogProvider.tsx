'use client';
import { useState, useEffect } from 'react';
import { setDialogListener, DialogOptions } from '@/lib/dialog';
import { X } from 'lucide-react';
import { Button } from './Button';
import { Input } from './Input';

export function DialogProvider() {
  const [options, setOptions] = useState<DialogOptions | null>(null);
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    setDialogListener((opts) => {
      setOptions(opts);
      if (opts.type === 'prompt') {
        setInputValue(opts.defaultValue || '');
      }
    });
  }, []);

  if (!options) return null;

  const handleConfirm = () => {
    if (options.onConfirm) {
      options.onConfirm(options.type === 'prompt' ? inputValue : undefined);
    }
    setOptions(null);
  };

  const handleCancel = () => {
    if (options.onCancel) options.onCancel();
    setOptions(null);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-fade-in" onClick={handleCancel}>
      <div className="glass bg-surface border border-border rounded-2xl w-full max-w-md p-6 shadow-2xl relative" onClick={e => e.stopPropagation()}>
        <button onClick={handleCancel} className="absolute top-4 right-4 text-text-secondary hover:text-text-primary p-1">
          <X className="w-5 h-5" />
        </button>
        
        <h3 className="text-xl font-bold text-text-primary mb-2">
          {options.title || (options.type === 'confirm' ? 'Confirmación' : 'Entrada requerida')}
        </h3>
        
        <p className="text-sm text-text-secondary mb-6 whitespace-pre-wrap">{options.message}</p>
        
        {options.type === 'prompt' && (
          <div className="mb-6">
            <Input 
              autoFocus
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirm();
                if (e.key === 'Escape') handleCancel();
              }}
            />
          </div>
        )}
        
        <div className="flex justify-end gap-3 mt-4">
          <Button variant="outline" onClick={handleCancel}>Cancelar</Button>
          <Button onClick={handleConfirm}>{options.type === 'prompt' ? 'Aceptar' : 'Confirmar'}</Button>
        </div>
      </div>
    </div>
  );
}
