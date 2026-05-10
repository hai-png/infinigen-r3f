'use client';

import dynamic from 'next/dynamic';

const SystemsTestApp = dynamic(() => import('@/components/SystemsTestApp'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center w-screen h-screen bg-zinc-900">
      <div className="text-zinc-500 text-lg">Loading Systems Test...</div>
    </div>
  ),
});

export default function SystemsPage() {
  return <SystemsTestApp />;
}
