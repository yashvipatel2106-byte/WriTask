import type { ReactNode } from "react";

export default function FormLabel({ children }: { children: ReactNode }) {
  return (
    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
      {children}
    </label>
  );
}
