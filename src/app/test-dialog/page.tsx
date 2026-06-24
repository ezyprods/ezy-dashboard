'use client';
import { Button } from '@/components/ui/Button';
import { customConfirm } from '@/lib/dialog';

export default function TestDialog() {
  return (
    <div className="p-20">
      <Button onClick={async () => { await customConfirm('Test Message'); }}>Open Dialog</Button>
    </div>
  );
}
