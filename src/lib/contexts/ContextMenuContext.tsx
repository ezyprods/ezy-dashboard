"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  destructive?: boolean;
}

interface ContextMenuContextType {
  showContextMenu: (e: React.MouseEvent, items: MenuItem[]) => void;
}

const ContextMenuContext = createContext<ContextMenuContextType | undefined>(undefined);

export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);

  const showContextMenu = (e: React.MouseEvent, items: MenuItem[]) => {
    e.preventDefault();
    setPosition({ x: e.clientX, y: e.clientY });
    setMenuItems(items);
    setIsOpen(true);
  };

  const closeContextMenu = () => {
    setIsOpen(false);
  };

  useEffect(() => {
    const handleClickOutside = () => {
      if (isOpen) closeContextMenu();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        closeContextMenu();
      }
    };

    document.addEventListener("click", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("click", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // Adjust menu position so it doesn't overflow the screen
  // (Simple implementation, let's keep it clean as per request)
  return (
    <ContextMenuContext.Provider value={{ showContextMenu }}>
      {children}
      {isOpen && (
        <div
          className="fixed z-[100] glass rounded-lg shadow-xl py-1 min-w-[160px] flex flex-col"
          style={{ top: position.y, left: position.x }}
          onClick={(e) => e.stopPropagation()} // Prevent close if clicking inside menu (except buttons)
        >
          {menuItems.map((item, index) => (
            <button
              key={index}
              onClick={() => {
                item.onClick();
                closeContextMenu();
              }}
              className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-white/5 dark:hover:bg-white/10 transition-colors ${
                item.destructive ? "text-error hover:text-red-400" : "text-text-primary"
              }`}
            >
              {item.icon && <span className="opacity-70">{item.icon}</span>}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </ContextMenuContext.Provider>
  );
}

export function useContextMenu() {
  const context = useContext(ContextMenuContext);
  if (!context) {
    throw new Error("useContextMenu must be used within a ContextMenuProvider");
  }
  return context;
}
