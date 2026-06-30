import { StemsSplitter } from '@/components/tools/StemsSplitter';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

export default function StemsPage() {
  return (
    <div className="flex-1 p-6 lg:p-8 max-w-[1600px] mx-auto w-full flex flex-col gap-6">
      <div className="flex-1 animate-in fade-in slide-in-from-bottom-4 duration-300">
        <StemsSplitter />
      </div>
    </div>
  );
}
