import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import {
  ChevronDown,
  ChevronRight,
  Building2,
  FileText,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router';

import { BrandMark, Button } from '@/components/ui';
import { cn } from '@/lib/cn';

export interface DashboardUser {
  id: string;
  email: string;
  displayName: string | null;
  companyName: string | null;
}

interface ShellProject {
  name: string;
  slug: string;
  role: 'owner' | 'editor' | 'viewer';
}

interface DashboardShellProps {
  user: DashboardUser;
  project?: ShellProject;
  onSignOut: () => Promise<void>;
  children: ReactNode;
}

function roleLabel(role: ShellProject['role']): string {
  return `${role[0]?.toUpperCase()}${role.slice(1)}`;
}

function RailLink({
  to,
  label,
  icon: Icon,
  end,
  ariaLabel,
}: {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  ariaLabel?: string;
}): React.JSX.Element {
  return (
    <NavLink
      aria-label={ariaLabel}
      className={({ isActive }) =>
        cn(
          'relative flex min-h-11 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-xs font-semibold tracking-normal no-underline transition-colors sm:flex-row sm:gap-2 sm:px-3 sm:py-2 sm:text-sm lg:justify-start',
          isActive
            ? 'bg-primary/8 text-primary before:absolute before:inset-y-3 before:left-0 before:w-0.5 before:rounded-full before:bg-primary'
            : 'text-muted-foreground hover:bg-surface-muted hover:text-foreground',
        )
      }
      end={end}
      to={to}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />
      <span className="max-[319px]:sr-only">{label}</span>
    </NavLink>
  );
}

export function DashboardShell({
  user,
  project,
  onSignOut,
  children,
}: DashboardShellProps): React.JSX.Element {
  const [isSigningOut, setIsSigningOut] = useState(false);
  const projectBase = project ? `/projects/${project.slug}` : null;
  const initials = (user.displayName ?? user.email)
    .split(/\s|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return (
    <div className="min-h-screen">
      <a
        className="fixed top-3 left-3 z-[100] min-h-11 -translate-y-[180%] rounded-control-ui bg-primary px-4 py-3 text-primary-foreground transition-transform focus:translate-y-0"
        href="#dashboard-content"
      >
        Skip to content
      </a>
      <aside
        aria-label="Dashboard navigation"
        className="sticky top-0 z-40 border-b border-border/40 bg-card lg:fixed lg:inset-y-0 lg:left-0 lg:flex lg:w-[var(--sidebar-width)] lg:flex-col lg:border-r lg:border-b-0 lg:bg-primary/3"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-3 px-5 py-3 lg:flex-1 lg:flex-nowrap lg:flex-col lg:items-stretch lg:gap-0 lg:px-5 lg:py-7">
          <Link
            aria-label="Harpa Pro"
            className="flex shrink-0 items-center gap-3 font-semibold text-foreground no-underline"
            to="/projects"
          >
            <BrandMark className="size-10" decorative />
            <span className="hidden font-heading text-title-sm tracking-tight sm:inline lg:inline">
              Harpa Pro
            </span>
          </Link>

          {project ? (
            <div className="min-w-0 flex-1 lg:mt-10 lg:flex-none">
              <span className="hidden text-xs font-medium tracking-wide text-muted-foreground lg:block">
                Current project
              </span>
              <Link
                className="flex min-h-11 min-w-0 items-center justify-between gap-2 rounded-control-ui border border-border/40 bg-card px-3 py-3.5 text-foreground no-underline lg:mt-2 lg:items-start"
                to="/projects"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{project.name}</span>
                  <small className="hidden text-meta text-muted-foreground lg:block">
                    {roleLabel(project.role)} · Switch project
                  </small>
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground lg:mt-0.5"
                />
              </Link>
            </div>
          ) : (
            <div className="hidden text-xs font-medium tracking-wide text-muted-foreground lg:mt-10 lg:block">
              Your workspace
            </div>
          )}

          <nav
            aria-label="Primary"
            className={cn(
              'order-3 -mx-5 mt-3 basis-[calc(100%+2.5rem)] gap-1 border-t border-border/40 px-5 pt-3 lg:order-none lg:mx-0 lg:mt-6 lg:flex lg:basis-auto lg:flex-col lg:border-0 lg:px-0 lg:pt-0',
              projectBase ? 'grid grid-cols-4' : 'flex',
            )}
          >
            {!projectBase ? (
              <RailLink icon={FolderKanban} label="Projects" to="/projects" />
            ) : (
              <>
                <RailLink end icon={LayoutDashboard} label="Overview" to={projectBase} />
                <RailLink icon={FileText} label="Reports" to={`${projectBase}/reports`} />
                <RailLink icon={Users} label="Members" to={`${projectBase}/members`} />
                <RailLink
                  ariaLabel="Project settings"
                  icon={Settings}
                  label="Settings"
                  to={`${projectBase}/settings`}
                />
              </>
            )}
          </nav>

          <Menu
            as="div"
            className="relative ml-auto shrink-0 lg:mt-auto lg:ml-0 lg:border-t lg:border-border/40 lg:pt-4"
          >
            <MenuButton
              aria-label="Open account menu"
              className="group flex min-h-11 items-center gap-3 rounded-control-ui border border-transparent p-1.5 text-left text-foreground transition-colors hover:border-border/40 hover:bg-surface-muted data-open:border-border/40 data-open:bg-surface-muted lg:w-full"
            >
              <span
                aria-hidden="true"
                className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-sm font-bold tracking-normal"
              >
                {initials}
              </span>
              <span className="hidden min-w-0 flex-1 flex-col lg:flex">
                <strong className="truncate text-sm font-semibold">
                  {user.displayName ?? user.email}
                </strong>
                <small className="truncate text-meta text-muted-foreground">
                  {user.companyName ?? 'Personal workspace'}
                </small>
              </span>
              <ChevronDown
                aria-hidden="true"
                className="hidden size-4 shrink-0 text-muted-foreground transition-transform group-data-open:rotate-180 lg:block"
              />
            </MenuButton>
            <MenuItems
              modal={false}
              transition
              className="absolute top-[calc(100%+0.75rem)] right-0 z-50 w-64 origin-top-right rounded-panel-ui border border-border/40 bg-popover p-3 text-popover-foreground shadow-floating-ui transition duration-100 ease-out focus:outline-none data-closed:scale-95 data-closed:opacity-0 lg:top-auto lg:right-0 lg:bottom-[calc(100%+0.75rem)] lg:origin-bottom-right"
            >
              <div className="min-w-0 border-b border-border/40 px-2 pb-3">
                <strong className="block truncate text-sm font-semibold">
                  {user.displayName ?? 'Harpa Pro member'}
                </strong>
                <span className="mt-1 block break-words text-meta text-muted-foreground">
                  {user.email}
                </span>
                {user.companyName ? (
                  <span className="mt-1 block break-words text-meta text-muted-foreground">
                    {user.companyName}
                  </span>
                ) : null}
              </div>
              <MenuItem>
                <Button
                  className="mt-2 w-full justify-start"
                  disabled={isSigningOut}
                  variant="quiet"
                  onClick={() => {
                    setIsSigningOut(true);
                    void onSignOut().finally(() => setIsSigningOut(false));
                  }}
                >
                  <LogOut aria-hidden="true" className="size-4" />
                  {isSigningOut ? 'Signing out…' : 'Sign out'}
                </Button>
              </MenuItem>
            </MenuItems>
          </Menu>
        </div>
      </aside>
      <main
        id="dashboard-content"
        className="min-h-screen lg:ml-[var(--sidebar-width)]"
        tabIndex={-1}
      >
        <div className="hidden min-h-18 items-center justify-between gap-4 border-b border-border/40 bg-card/70 px-5 text-meta lg:flex">
          <div className="flex min-w-0 items-center gap-3 text-muted-foreground">
            <Building2 aria-hidden="true" className="size-4 shrink-0" />
            <span className="truncate">{user.companyName ?? 'Your workspace'}</span>
            <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-border" />
            <span className="truncate font-medium text-foreground">
              {project?.name ?? 'Projects'}
            </span>
          </div>
          <span className="shrink-0 text-muted-foreground">Office workspace</span>
        </div>
        <div className="mx-auto w-full max-w-app p-5">{children}</div>
      </main>
    </div>
  );
}
