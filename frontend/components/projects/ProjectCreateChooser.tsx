"use client";

import { FolderPlus, FolderKanban } from "lucide-react";

type Props = {
  onCreateFolder: () => void;
  onCreateProject: () => void;
};

export default function ProjectCreateChooser({
  onCreateFolder,
  onCreateProject,
}: Props) {
  return (
    <div className="absolute right-0 top-full mt-1 z-30 w-52 rounded-2xl border border-slate-200 bg-white py-1.5 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
      <button
        type="button"
        onClick={onCreateFolder}
        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-slate-600 transition-colors hover:bg-cyan-50 hover:text-cyan-700 dark:text-slate-300 dark:hover:bg-cyan-400/10 dark:hover:text-cyan-400"
      >
        <FolderPlus size={15} className="shrink-0 text-amber-500" />
        Create folder
      </button>
      <button
        type="button"
        onClick={onCreateProject}
        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-slate-600 transition-colors hover:bg-cyan-50 hover:text-cyan-700 dark:text-slate-300 dark:hover:bg-cyan-400/10 dark:hover:text-cyan-400"
      >
        <FolderKanban size={15} className="shrink-0 text-cyan-600 dark:text-cyan-400" />
        Create project
      </button>
    </div>
  );
}
