import { ToolsHub } from '@/components/tools/ToolsHub';

export default function ToolsPage() {
  return (
    <div className="flex-1 max-w-[1600px] mx-auto w-full space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-text-primary tracking-tight">Herramientas</h1>
        <p className="text-xs sm:text-sm text-text-secondary mt-0.5 sm:mt-1">
          Utilidades locales para descarga y conversión de audio.
        </p>
      </div>

      <ToolsHub />
    </div>
  );
}
