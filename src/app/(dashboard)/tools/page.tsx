import { ToolsHub } from '@/components/tools/ToolsHub';

export default function ToolsPage() {
  return (
    <div className="flex-1 p-6 lg:p-8 max-w-[1600px] mx-auto w-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary tracking-tight">Herramientas</h1>
        <p className="text-text-secondary mt-1">
          Utilidades locales para descarga y conversión de audio.
        </p>
      </div>

      <ToolsHub />
    </div>
  );
}
