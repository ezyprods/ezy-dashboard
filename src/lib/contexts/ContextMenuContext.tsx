'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export interface MenuItem {
  label?: string;
  icon?: string; // lucide icon name
  action?: () => void;
  variant?: 'default' | 'danger';
  separator?: boolean;
  className?: string;
  iconClassName?: string;
  /** Inline color for the icon (e.g. folder color swatches) */
  iconColor?: string;
  /** Keyboard shortcut hint shown on the right (desktop only) */
  shortcut?: string;
  /** Keyboard accelerator key (e.g. 'c' for new folder) */
  hotkey?: string;
  /** Non-interactive title row (e.g. the file name the menu acts on) */
  heading?: string;
  disabled?: boolean;
  /** Shows a check mark (for option lists such as sort order) */
  checked?: boolean;
  /** Nested items shown in a flyout (desktop, on hover/click) or a sub-screen (phone sheet). Mutually exclusive with `action`. */
  submenu?: MenuItem[];
}

interface MenuState {
  x: number;
  y: number;
  items: MenuItem[];
  visible: boolean;
}

interface ContextMenuContextType {
  menuState: MenuState;
  showMenu: (x: number, y: number, items: MenuItem[]) => void;
  hideMenu: () => void;
}

const ContextMenuContext = createContext<ContextMenuContextType | undefined>(undefined);

const INITIAL_STATE: MenuState = { x: 0, y: 0, items: [], visible: false };

export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const [menuState, setMenuState] = useState<MenuState>(INITIAL_STATE);

  const showMenu = useCallback((x: number, y: number, items: MenuItem[]) => {
    setMenuState({ x, y, items, visible: true });
  }, []);

  const hideMenu = useCallback(() => {
    setMenuState((prev) => ({ ...prev, visible: false }));
  }, []);

  return (
    <ContextMenuContext.Provider value={{ menuState, showMenu, hideMenu }}>
      {children}
    </ContextMenuContext.Provider>
  );
}

export function useContextMenu() {
  const context = useContext(ContextMenuContext);
  if (!context) {
    throw new Error('useContextMenu must be used within a ContextMenuProvider');
  }
  return context;
}
