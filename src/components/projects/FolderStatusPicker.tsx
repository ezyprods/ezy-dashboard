'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FolderStatusPickerProps {
  currentStatus: string;
  onStatusChange: (status: string) => void;
  statusConfig: Record<string, { label: string; color: string; bgColor: string }>;
}

export function FolderStatusPicker({ currentStatus, onStatusChange, statusConfig }: FolderStatusPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeConfig = currentStatus ? statusConfig[currentStatus] : null;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 border",
          activeConfig 
            ? "border-transparent hover:brightness-110" 
            : "bg-surface-elevated text-text-secondary border-border hover:border-accent hover:text-text-primary"
        )}
        style={activeConfig ? {
          backgroundColor: activeConfig.bgColor,
          color: activeConfig.color,
          boxShadow: `0 0 10px ${activeConfig.bgColor}40`
        } : {}}
      >
        <span>{activeConfig ? activeConfig.label : 'Sin estado'}</span>
        <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-200", isOpen && "rotate-180")} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-48 py-1 rounded-xl glass border border-border/60 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-100">
          
          <button
            onClick={() => {
              onStatusChange('');
              setIsOpen(false);
            }}
            className={cn(
              "w-full text-left px-4 py-2 text-xs hover:bg-surface flex items-center justify-between",
              !currentStatus ? "text-text-primary font-bold bg-surface-elevated/50" : "text-text-secondary"
            )}
          >
            <span>Sin estado</span>
            {!currentStatus && <Check className="w-3.5 h-3.5 text-text-primary" />}
          </button>
          
          <div className="h-px bg-border/50 my-1 mx-2" />

          {Object.entries(statusConfig).map(([key, config]) => {
            const isActive = currentStatus === key;
            return (
              <button
                key={key}
                onClick={() => {
                  onStatusChange(key);
                  setIsOpen(false);
                }}
                className={cn(
                  "w-full text-left px-4 py-2 text-xs flex items-center justify-between transition-colors",
                  isActive ? "bg-surface-elevated" : "hover:bg-surface"
                )}
              >
                <div className="flex items-center gap-2">
                  <div 
                    className="w-2 h-2 rounded-full shadow-sm" 
                    style={{ backgroundColor: config.color }} 
                  />
                  <span className={isActive ? "font-bold text-text-primary" : "text-text-secondary"}>
                    {config.label}
                  </span>
                </div>
                {isActive && <Check className="w-3.5 h-3.5" style={{ color: config.color }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
