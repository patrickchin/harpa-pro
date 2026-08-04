import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import {
  ChevronDown,
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
          'flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-card-ui px-3 py-2 text-sm font-bold no-underline transition-colors lg:justify-start',
          isActive
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-surface-muted hover:text-foreground',
        )
      }
      end={end}
      to={to}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={2} />
      <span>{label}</span>
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
      <a className="skip-link" href="#dashboard-content">
        Skip to content
      </a>
      <aside
        aria-label="Dashboard navigation"
        className="sticky top-0 z-40 border-b border-border bg-card lg:fixed lg:inset-y-0 lg:left-0 lg:flex lg:w-[var(--sidebar-width)] lg:flex-col lg:border-r lg:border-b-0 lg:bg-surface-emphasis"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-3 px-5 py-3 lg:flex-1 lg:flex-nowrap lg:flex-col lg:items-stretch lg:gap-0 lg:p-5">
          <Link
            aria-label="Harpa Pro"
            className="flex shrink-0 items-center gap-3 font-bold text-foreground no-underline"
            to="/projects"
          >
            <BrandMark className="size-10" decorative />
            <span className="hidden text-body-lg sm:inline lg:inline">Harpa Pro</span>
          </Link>

          {project ? (
            <div className="min-w-0 flex-1 lg:mt-8 lg:flex-none">
              <span className="hidden text-label font-bold tracking-label text-muted-foreground uppercase lg:block">
                Current project
              </span>
              <Link
                className="flex min-h-11 min-w-0 items-center justify-between gap-2 rounded-card-ui border border-border bg-card px-3 py-2 text-foreground no-underline shadow-raised-ui lg:mt-2 lg:items-start"
                to="/projects"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold">{project.name}</span>
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
            <div className="hidden text-label font-bold tracking-label text-muted-foreground uppercase lg:mt-8 lg:block">
              Your workspace
            </div>
          )}

          <nav
            aria-label="Primary"
            className="order-3 -mx-5 mt-3 flex basis-[calc(100%+2.5rem)] gap-1 overflow-x-auto border-t border-border px-5 pt-3 lg:order-none lg:mx-0 lg:mt-5 lg:flex lg:basis-auto lg:flex-col lg:overflow-visible lg:border-0 lg:px-0 lg:pt-0"
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

          <Menu as="div" className="relative ml-auto shrink-0 lg:mt-auto lg:ml-0">
            <MenuButton
              aria-label="Open account menu"
              className="group flex min-h-11 items-center gap-3 rounded-card-ui border border-transparent p-1.5 text-left text-foreground transition-colors hover:border-border hover:bg-surface-muted data-open:border-border data-open:bg-surface-muted lg:w-full"
            >
              <span
                aria-hidden="true"
                className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-label font-bold"
              >
                {initials}
              </span>
              <span className="hidden min-w-0 flex-1 flex-col lg:flex">
                <strong className="truncate text-sm">{user.displayName ?? user.email}</strong>
                <small className="text-meta text-muted-foreground">
                  {project ? roleLabel(project.role) : 'Account'}
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
              className="absolute top-[calc(100%+0.75rem)] right-0 z-50 w-64 origin-top-right rounded-panel-ui border border-border bg-popover p-3 text-popover-foreground shadow-floating-ui transition duration-100 ease-out focus:outline-none data-closed:scale-95 data-closed:opacity-0 lg:top-auto lg:right-0 lg:bottom-[calc(100%+0.75rem)] lg:origin-bottom-right"
            >
              <div className="min-w-0 border-b border-border px-2 pb-3">
                <strong className="block truncate text-sm">
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
        <div className="mx-auto w-full max-w-app px-5 py-5 pb-8 sm:px-6 sm:py-6 xl:px-8">
          {children}
        </div>
      </main>
    </div>
  );
}
