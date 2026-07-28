import { useState, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router';

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
  children,
  end,
  ariaLabel,
}: {
  to: string;
  children: ReactNode;
  end?: boolean;
  ariaLabel?: string;
}): React.JSX.Element {
  return (
    <NavLink
      aria-label={ariaLabel}
      className={({ isActive }) => `rail-link${isActive ? ' rail-link-active' : ''}`}
      end={end}
      to={to}
    >
      {children}
    </NavLink>
  );
}

export function DashboardShell({
  user,
  project,
  onSignOut,
  children,
}: DashboardShellProps): React.JSX.Element {
  const [accountOpen, setAccountOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const projectBase = project ? `/projects/${project.slug}` : null;
  const initials = (user.displayName ?? user.email)
    .split(/\s|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return (
    <div className="dashboard-frame">
      <a className="skip-link" href="#dashboard-content">
        Skip to content
      </a>
      <aside className="dashboard-rail" aria-label="Dashboard navigation">
        <Link className="wordmark" to="/projects" aria-label="Harpa Pro">
          <span className="wordmark-mark" aria-hidden="true">
            HP
          </span>
          <span>Harpa Pro</span>
        </Link>

        {project ? (
          <div className="project-switcher">
            <span className="project-switcher-label">Current project</span>
            <Link to="/projects" className="project-switcher-link">
              <span>{project.name}</span>
              <small>{roleLabel(project.role)} · Switch project</small>
            </Link>
          </div>
        ) : (
          <div className="global-rail-label">Your workspace</div>
        )}

        <nav className="rail-nav" aria-label="Primary">
          {!projectBase ? (
            <RailLink to="/projects">Projects</RailLink>
          ) : (
            <>
              <RailLink to={projectBase} end>
                Overview
              </RailLink>
              <RailLink to={`${projectBase}/reports`}>Reports</RailLink>
              <RailLink to={`${projectBase}/members`}>Members</RailLink>
              <RailLink ariaLabel="Project settings" to={`${projectBase}/settings`}>
                <span aria-hidden="true" className="rail-label-wide">
                  Project settings
                </span>
                <span aria-hidden="true" className="rail-label-narrow">
                  Settings
                </span>
              </RailLink>
            </>
          )}
        </nav>

        <div className="account-menu-wrap">
          {accountOpen ? (
            <div className="account-popover">
              <strong>{user.displayName ?? 'Harpa Pro member'}</strong>
              <span>{user.email}</span>
              {user.companyName ? <span>{user.companyName}</span> : null}
              <button
                className="button button-quiet account-sign-out"
                disabled={isSigningOut}
                type="button"
                onClick={() => {
                  setIsSigningOut(true);
                  void onSignOut().finally(() => setIsSigningOut(false));
                }}
              >
                {isSigningOut ? 'Signing out…' : 'Sign out'}
              </button>
            </div>
          ) : null}
          <button
            aria-label="Open account menu"
            aria-expanded={accountOpen}
            className="account-trigger"
            onClick={() => setAccountOpen((current) => !current)}
            type="button"
          >
            <span className="avatar" aria-hidden="true">
              {initials}
            </span>
            <span className="account-trigger-copy">
              <strong>{user.displayName ?? user.email}</strong>
              <small>{project ? roleLabel(project.role) : 'Account'}</small>
            </span>
          </button>
        </div>
      </aside>
      <main id="dashboard-content" className="dashboard-content" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
