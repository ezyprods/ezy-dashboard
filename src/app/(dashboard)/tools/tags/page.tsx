import { TagEditor } from '@/components/tools/TagEditor';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

export default function TagsPage() {
  return (
    <div className="flex-1 p-6 lg:p-8 max-w-[1600px] mx-auto w-full flex flex-col gap-6">
      <Link 
        href="/tools"
        className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors w-fit group"
      >
        <div className="p-1.5 rounded-lg bg-surface-elevated border border-border/50 group-hover:border-border transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </div>
        <span className="font-medium text-sm">Volver a Herramientas</span>
      </Link>
      
      <div className="flex-1 animate-in fade-in slide-in-from-bottom-4 duration-300">
        <TagEditor />
      </div>
    </div>
  );
}
