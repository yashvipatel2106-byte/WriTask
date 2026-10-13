"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderKanban,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Trash2,
} from "lucide-react";
import type { TreeFolder, TreeProject } from "@/lib/projectTree";
import { flattenTreeFolders } from "@/lib/projectTree";
import {
  isPinned,
  type ProjectPin,
} from "@/lib/projectPins";

type MenuId = string;

export type FolderCreateOpts = {
  parentFolderId?: string;
  parentProjectId?: string;
};

type Props = {
  folders: TreeFolder[];
  projects: TreeProject[];
  activePath: string;
  canCreate: boolean;
  accessibleProjectIds: Set<string>;
  /** Project ids the current user has project:update permission on — gates the "Edit" menu item. */
  editableProjectIds: Set<string>;
  pins: ProjectPin[];
  onTogglePin: (entry: ProjectPin) => void;
  onCreateFolder: (opts?: FolderCreateOpts) => void;
  onCreateProject: (opts: {
    folderId?: string;
    parentProjectId?: string;
  }) => void;
  onDeleteFolder?: (folderId: string, folderName: string) => void;
  onDeleteProject?: (projectId: string, projectTitle: string) => void;
  onEditProject?: (projectId: string) => void;
};

function isProjectActive(pathname: string, projectId: string) {
  return (
    pathname === `/projects/${projectId}` ||
    pathname.startsWith(`/projects/${projectId}/`)
  );
}

function TreeItemMenu({
  menuId,
  openMenuId,
  setOpenMenuId,
  canCreate,
  onCreateFolder,
  onCreateProject,
  onDelete,
  showDelete,
  onEdit,
  showEdit,
}: {
  menuId: MenuId;
  openMenuId: MenuId | null;
  setOpenMenuId: (id: MenuId | null) => void;
  canCreate: boolean;
  onCreateFolder: () => void;
  onCreateProject: () => void;
  onDelete?: () => void;
  showDelete: boolean;
  onEdit?: () => void;
  showEdit?: boolean;
}) {
  const open = openMenuId === menuId;
  const hasAnyAction = canCreate || showEdit || (showDelete && Boolean(onDelete));

  if (!hasAnyAction) return null;

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-label="More options"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpenMenuId(open ? null : menuId);
        }}
        className="rounded-md p-1 text-slate-400 opacity-0 transition-all group-hover:opacity-100 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
      >
        <MoreHorizontal size={14} />
      </button>
      {open && (
        <div
          className="absolute right-0 top-7 z-40 w-44 rounded-2xl border border-slate-200 bg-white py-1.5 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
          onClick={(e) => e.stopPropagation()}
        >
          {showEdit && onEdit && (
            <button
              type="button"
              onClick={() => {
                setOpenMenuId(null);
                onEdit();
              }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-slate-600 transition-colors hover:bg-cyan-50 hover:text-cyan-700 dark:text-slate-300 dark:hover:bg-cyan-400/10 dark:hover:text-cyan-400"
            >
              <Pencil size={13} />
              Edit
            </button>
          )}
          {canCreate && (
            <>
              {showEdit && onEdit && (
                <div className="my-1 border-t border-slate-200 dark:border-slate-800" />
              )}
              <button
                type="button"
                onClick={() => {
                  setOpenMenuId(null);
                  onCreateFolder();
                }}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-slate-600 transition-colors hover:bg-cyan-50 hover:text-cyan-700 dark:text-slate-300 dark:hover:bg-cyan-400/10 dark:hover:text-cyan-400"
              >
                <FolderPlus size={13} />
                Create folder
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpenMenuId(null);
                  onCreateProject();
                }}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-slate-600 transition-colors hover:bg-cyan-50 hover:text-cyan-700 dark:text-slate-300 dark:hover:bg-cyan-400/10 dark:hover:text-cyan-400"
              >
                <FolderKanban size={13} />
                Create project
              </button>
            </>
          )}
          {showDelete && onDelete && (
            <>
              {(canCreate || (showEdit && onEdit)) && (
                <div className="my-1 border-t border-slate-200 dark:border-slate-800" />
              )}
              <button
                type="button"
                onClick={() => {
                  setOpenMenuId(null);
                  onDelete();
                }}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-red-500 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
              >
                <Trash2 size={13} />
                Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function PinButton({
  pinned,
  onToggle,
  label,
}: {
  pinned: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={pinned ? `Unpin ${label}` : `Pin ${label}`}
      title={pinned ? "Unpin" : "Pin"}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={`shrink-0 rounded-md p-1 transition-all ${
        pinned
          ? "text-amber-500 opacity-100"
          : "text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-slate-100 hover:text-amber-500 dark:hover:bg-slate-800"
      }`}
    >
      {pinned ? <Pin size={13} className="fill-current" /> : <PinOff size={13} />}
    </button>
  );
}

type TreeContext = {
  activePath: string;
  canCreate: boolean;
  accessibleProjectIds: Set<string>;
  editableProjectIds: Set<string>;
  pins: ProjectPin[];
  openMenuId: MenuId | null;
  setOpenMenuId: (id: MenuId | null) => void;
  onTogglePin: Props["onTogglePin"];
  onCreateFolder: Props["onCreateFolder"];
  onCreateProject: Props["onCreateProject"];
  onDeleteFolder?: Props["onDeleteFolder"];
  onDeleteProject?: Props["onDeleteProject"];
  onEditProject?: Props["onEditProject"];
};

function ProjectBranch({
  nodes,
  depth,
  ctx,
}: {
  nodes: TreeProject[];
  depth: number;
  ctx: TreeContext;
}) {
  return (
    <>
      {nodes.map((node) => (
        <ProjectNode key={node._id} node={node} depth={depth} ctx={ctx} />
      ))}
    </>
  );
}

function FolderBranch({
  folders,
  depth,
  ctx,
}: {
  folders: TreeFolder[];
  depth: number;
  ctx: TreeContext;
}) {
  return (
    <>
      {folders.map((folder) => (
        <FolderBlock key={folder._id} folder={folder} depth={depth} ctx={ctx} />
      ))}
    </>
  );
}

function ContainerContents({
  folders,
  projects,
  depth,
  ctx,
  emptyLabel = "No items",
}: {
  folders: TreeFolder[];
  projects: TreeProject[];
  depth: number;
  ctx: TreeContext;
  emptyLabel?: string;
}) {
  const hasContent = folders.length > 0 || projects.length > 0;

  if (!hasContent) {
    return (
      <p className="px-2 py-1 text-[11px] text-slate-400 dark:text-slate-500">
        {emptyLabel}
      </p>
    );
  }

  return (
    <>
      <FolderBranch folders={folders} depth={depth} ctx={ctx} />
      <ProjectBranch nodes={projects} depth={depth} ctx={ctx} />
    </>
  );
}

function ProjectNode({
  node,
  depth,
  ctx,
}: {
  node: TreeProject;
  depth: number;
  ctx: TreeContext;
}) {
  const [open, setOpen] = useState(true);
  const childFolders = node.folders || [];
  const childProjects = node.children || [];
  const hasChildren = childFolders.length > 0 || childProjects.length > 0;
  const active = isProjectActive(ctx.activePath, node._id);
  const pinEntry: ProjectPin = { type: "project", id: node._id };
  const pinned = isPinned(ctx.pins, pinEntry);
  const canOpen = ctx.accessibleProjectIds.has(node._id);
  const canEdit = ctx.editableProjectIds.has(node._id);
  // Only render the 3-dot button when there's at least one real action
  // behind it — merely being able to open/view the project isn't one.
  const canManage = ctx.canCreate || canEdit;

  const titleClass = `min-w-0 flex-1 truncate rounded-lg px-1.5 py-1 text-[13px] transition-colors ${
    active
      ? "bg-cyan-50 font-medium text-cyan-700 dark:bg-cyan-400/10 dark:text-cyan-400"
      : canOpen
        ? "text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        : "cursor-default text-slate-400 dark:text-slate-500"
  }`;

  return (
    <div>
      <div
        className="group flex items-center gap-0.5"
        style={{ paddingLeft: depth * 10 }}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={open ? "Collapse" : "Expand"}
            onClick={() => setOpen((v) => !v)}
            className="shrink-0 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        {canOpen ? (
          <Link href={`/projects/${node._id}`} title={node.title} className={titleClass}>
            {node.title}
          </Link>
        ) : (
          <span title={`${node.title} (structure only)`} className={titleClass}>
            {node.title}
          </span>
        )}
        <PinButton
          pinned={pinned}
          label={node.title}
          onToggle={() => ctx.onTogglePin(pinEntry)}
        />
        {canManage && (
          <TreeItemMenu
            menuId={`project:${node._id}`}
            openMenuId={ctx.openMenuId}
            setOpenMenuId={ctx.setOpenMenuId}
            canCreate={ctx.canCreate}
            onCreateFolder={() =>
              ctx.onCreateFolder({ parentProjectId: node._id })
            }
            onCreateProject={() =>
              ctx.onCreateProject({
                parentProjectId: node._id,
              })
            }
            onEdit={
              ctx.onEditProject
                ? () => ctx.onEditProject!(node._id)
                : undefined
            }
            showEdit={canEdit}
            onDelete={
              ctx.onDeleteProject
                ? () => ctx.onDeleteProject!(node._id, node.title)
                : undefined
            }
            showDelete={Boolean(ctx.onDeleteProject)}
          />
        )}
      </div>
      {open && hasChildren && (
        <div className="ml-2 border-l border-slate-200 pl-2 dark:border-slate-800">
          <ContainerContents
            folders={childFolders}
            projects={childProjects}
            depth={0}
            ctx={ctx}
            emptyLabel="No items"
          />
        </div>
      )}
    </div>
  );
}

function FolderBlock({
  folder,
  depth,
  ctx,
}: {
  folder: TreeFolder;
  depth: number;
  ctx: TreeContext;
}) {
  const [open, setOpen] = useState(true);
  const childFolders = folder.folders || [];
  const childProjects = folder.projects || [];
  const hasChildren = childFolders.length > 0 || childProjects.length > 0;
  const pinEntry: ProjectPin = { type: "folder", id: folder._id };
  const pinned = isPinned(ctx.pins, pinEntry);

  return (
    <div className="mb-0.5">
      <div
        className="group flex items-center gap-0.5"
        style={{ paddingLeft: depth * 10 }}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 p-0.5 text-slate-400"
          aria-label={open ? `Collapse ${folder.name}` : `Expand ${folder.name}`}
        >
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate px-1 py-1 text-[13px] font-medium text-slate-600 dark:text-slate-300">
          <Folder size={13} className="shrink-0 text-amber-500" />
          <span className="truncate">{folder.name}</span>
        </span>
        <PinButton
          pinned={pinned}
          label={folder.name}
          onToggle={() => ctx.onTogglePin(pinEntry)}
        />
        <TreeItemMenu
          menuId={`folder:${folder._id}`}
          openMenuId={ctx.openMenuId}
          setOpenMenuId={ctx.setOpenMenuId}
          canCreate={ctx.canCreate}
          onCreateFolder={() =>
            ctx.onCreateFolder({ parentFolderId: folder._id })
          }
          onCreateProject={() =>
            ctx.onCreateProject({ folderId: folder._id })
          }
          onDelete={
            ctx.onDeleteFolder
              ? () => ctx.onDeleteFolder!(folder._id, folder.name)
              : undefined
          }
          showDelete={Boolean(ctx.onDeleteFolder)}
        />
      </div>
      {open && (
        <div
          className="ml-2 border-l border-slate-200 pl-2 dark:border-slate-800"
          style={{ marginLeft: depth * 10 + 8 }}
        >
          {hasChildren ? (
            <ContainerContents
              folders={childFolders}
              projects={childProjects}
              depth={0}
              ctx={ctx}
              emptyLabel="No projects"
            />
          ) : (
            <p className="px-2 py-1 text-[11px] text-slate-400 dark:text-slate-500">
              No projects
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function PinnedRow({
  icon,
  label,
  href,
  onTogglePin,
}: {
  icon: ReactNode;
  label: string;
  href?: string;
  onTogglePin: () => void;
}) {
  const content = (
    <>
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <button
        type="button"
        aria-label={`Unpin ${label}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onTogglePin();
        }}
        className="shrink-0 rounded-md p-0.5 text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/10"
      >
        <Pin size={12} className="fill-current" />
      </button>
    </>
  );

  const className =
    "group mb-0.5 flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] text-slate-600 transition-colors hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800";

  if (href) {
    return (
      <Link href={href} className={className} title={label}>
        {content}
      </Link>
    );
  }

  return (
    <div className={className} title={label}>
      {content}
    </div>
  );
}

export default function ProjectTreeNav({
  folders,
  projects,
  activePath,
  canCreate,
  accessibleProjectIds,
  editableProjectIds,
  pins,
  onTogglePin,
  onCreateFolder,
  onCreateProject,
  onDeleteFolder,
  onDeleteProject,
  onEditProject,
}: Props) {
  const [openMenuId, setOpenMenuId] = useState<MenuId | null>(null);

  useEffect(() => {
    const close = () => setOpenMenuId(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  const ctx: TreeContext = {
    activePath,
    canCreate,
    accessibleProjectIds,
    editableProjectIds,
    pins,
    openMenuId,
    setOpenMenuId,
    onTogglePin,
    onCreateFolder,
    onCreateProject,
    onDeleteFolder,
    onDeleteProject,
    onEditProject,
  };

  const allFolders = useMemo(() => flattenTreeFolders(folders), [folders]);

  const folderMap = useMemo(
    () => new Map(allFolders.map((f) => [f._id, f])),
    [allFolders]
  );

  const projectMap = useMemo(() => {
    const map = new Map<string, TreeProject>();
    const walk = (nodes: TreeProject[]) => {
      for (const node of nodes) {
        map.set(node._id, node);
        if (node.folders?.length) {
          for (const folder of node.folders) {
            walk(folder.projects);
          }
        }
        if (node.children?.length) walk(node.children);
      }
    };
    for (const folder of allFolders) walk(folder.projects);
    walk(projects);
    return map;
  }, [allFolders, projects]);

  const resolvedPins = useMemo(() => {
    return pins
      .map((pin) => {
        if (pin.type === "folder") {
          const folder = folderMap.get(pin.id);
          if (!folder) return null;
          return {
            pin,
            label: folder.name,
            href: undefined,
            icon: <Folder size={12} className="shrink-0 text-amber-500" />,
          };
        }
        const project = projectMap.get(pin.id);
        if (!project) return null;
        return {
          pin,
          label: project.title,
          href: `/projects/${project._id}`,
          icon: (
            <FolderKanban
              size={12}
              className="shrink-0 text-cyan-600 dark:text-cyan-400"
            />
          ),
        };
      })
      .filter(Boolean) as Array<{
      pin: ProjectPin;
      label: string;
      href?: string;
      icon: ReactNode;
    }>;
  }, [pins, folderMap, projectMap]);

  const empty = folders.length === 0 && projects.length === 0;

  return (
    <div className="space-y-1">
      {resolvedPins.length > 0 && (
        <div className="mb-2 border-b border-slate-200 pb-2 dark:border-slate-800">
          <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Pinned
          </p>
          {resolvedPins.map(({ pin, label, href, icon }) => (
            <PinnedRow
              key={`${pin.type}:${pin.id}`}
              icon={icon}
              label={label}
              href={href}
              onTogglePin={() => onTogglePin(pin)}
            />
          ))}
        </div>
      )}

      {empty ? (
        <p className="px-2.5 py-1.5 text-xs text-slate-400 dark:text-slate-500">
          No projects yet
        </p>
      ) : (
        <div className="space-y-0.5">
          <FolderBranch folders={folders} depth={0} ctx={ctx} />

          {projects.length > 0 && (
            <div>
              {folders.length > 0 && (
                <p className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  <FolderKanban size={12} />
                  Projects
                </p>
              )}
              <ProjectBranch nodes={projects} depth={0} ctx={ctx} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
