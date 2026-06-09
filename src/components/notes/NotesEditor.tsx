'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { useState, useEffect, useCallback } from 'react';
import { Loader2, Save, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export function NotesEditor({ endpoint }: { endpoint: string }) {
  const [isSaving, setIsSaving] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: 'Escribe aquí tus notas, referencias, acordes...',
      }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'prose prose-invert prose-sm sm:prose-base focus:outline-none min-h-[300px] max-w-none',
      },
    },
    onUpdate: () => {
      setSaveSuccess(false);
    }
  });

  useEffect(() => {
    async function loadNotes() {
      try {
        const res = await fetch(endpoint);
        const data = await res.json();
        if (data.notes && data.notes.content && editor) {
          editor.commands.setContent(data.notes.content);
        }
      } catch (err) {
        console.error('Error loading notes:', err);
      } finally {
        setIsLoaded(true);
      }
    }
    if (editor && !isLoaded) {
      loadNotes();
    }
  }, [endpoint, editor, isLoaded]);

  const handleSave = async () => {
    if (!editor) return;
    setIsSaving(true);
    try {
      await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editor.getHTML() }),
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Error saving notes:', err);
    } finally {
      setIsSaving(false);
    }
  };

  if (!editor || !isLoaded) {
    return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>;
  }

  return (
    <div className="glass rounded-xl border border-border overflow-hidden flex flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 p-2 border-b border-border bg-surface/50">
        <button
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`p-2 rounded hover:bg-surface-elevated transition-colors ${editor.isActive('bold') ? 'bg-surface-elevated text-accent-light' : 'text-text-secondary'}`}
        >
          <span className="font-bold">B</span>
        </button>
        <button
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`p-2 rounded hover:bg-surface-elevated transition-colors ${editor.isActive('italic') ? 'bg-surface-elevated text-accent-light' : 'text-text-secondary'}`}
        >
          <span className="italic font-serif">I</span>
        </button>
        <div className="w-px h-6 bg-border mx-2" />
        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={`p-2 rounded text-sm font-bold hover:bg-surface-elevated transition-colors ${editor.isActive('heading', { level: 2 }) ? 'bg-surface-elevated text-accent-light' : 'text-text-secondary'}`}
        >
          H2
        </button>
        <button
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`p-2 rounded hover:bg-surface-elevated transition-colors ${editor.isActive('bulletList') ? 'bg-surface-elevated text-accent-light' : 'text-text-secondary'}`}
        >
          • List
        </button>
        
        <div className="flex-1" />
        
        <Button onClick={handleSave} disabled={isSaving} size="sm" variant={saveSuccess ? 'secondary' : 'default'} className={saveSuccess ? 'bg-success/20 text-success hover:bg-success/30' : ''}>
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : saveSuccess ? <><CheckCircle2 className="w-4 h-4 mr-2" /> Guardado</> : <><Save className="w-4 h-4 mr-2" /> Guardar</>}
        </Button>
      </div>
      
      {/* Editor Area */}
      <div className="p-6 bg-surface/20">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
