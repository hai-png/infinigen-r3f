'use client';

import dynamic from 'next/dynamic';

const CompareEditor = dynamic(
  () => import('../../components/CompareEditor'),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-screen flex items-center justify-center bg-gray-950">
        <div className="text-center">
          <div className="animate-spin w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-sm text-gray-400 mb-1">Loading Infinigen Comparison Editor</p>
          <p className="text-xs text-gray-600">Initializing WebGL context and 3D engine...</p>
        </div>
      </div>
    ),
  },
);

export default function ComparePage() {
  return <CompareEditor />;
}
