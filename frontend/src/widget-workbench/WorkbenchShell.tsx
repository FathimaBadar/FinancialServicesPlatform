import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { WIDGETS } from '../portals/shared/widgets/registry';
import { ConnectionBar } from './ConnectionBar';
import { groupByCategory } from './model';

const navClass = ({ isActive }: { isActive: boolean }) => (isActive ? 'nav on' : 'nav');

/**
 * The workbench shell (SME wb-root): widgets by category on the left, the page on the
 * right. On builder routes the nav collapses behind ☰ (§4.7) so the builder gets the
 * full width for rail + canvas.
 */
export function WorkbenchShell() {
  const groups = groupByCategory(WIDGETS);
  const inBuilder = useLocation().pathname.startsWith('/builder');
  const [navOpen, setNavOpen] = useState(false);
  useEffect(() => {
    if (!inBuilder) setNavOpen(false);
  }, [inBuilder]);

  return (
    <div className={inBuilder && !navOpen ? 'wb focus' : 'wb'}>
      <aside className="side">
        {inBuilder && (
          <button type="button" className="nav-btn" onClick={() => setNavOpen(!navOpen)} aria-expanded={navOpen}>
            {navOpen ? '✕ Hide navigation' : '☰ Navigation'}
          </button>
        )}
        <div className="brand">
          FSP <b>widget workbench</b>
        </div>
        <NavLink to="/builder" className={navClass}><span className="nav-l">Portal builder</span></NavLink>
        <NavLink to="/registry" className={navClass}><span className="nav-l">Registry</span></NavLink>
        <NavLink to="/new" className={navClass}><span className="nav-l">New widget (LLM)</span></NavLink>
        {groups.map((g) => (
          <div key={g.category} className="grid gap-1">
            <div className="grp nav-l">{g.category}</div>
            {g.items.map((w) => (
              <NavLink key={w.id} to={`/w/${w.id}`} className={navClass} title={w.label}>
                <span className="nav-ic" aria-hidden>{w.label.charAt(0)}</span>
                <span className="nav-l">{w.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
        <p className="foot dim nav-l">
          New widget: <b>New widget (LLM)</b> with an LLM, or by hand in{' '}
          <span className="mono">shared/widgets/&lt;area&gt;/&lt;name&gt;/</span> (index.tsx + widget.tsx + data.ts).
          <br />
          Theme follows <code>data-theme</code> on &lt;html&gt; (light default; dark via <code>data-theme="dark"</code>).
        </p>
      </aside>
      <main className="main">
        <ConnectionBar />
        <Outlet />
      </main>
    </div>
  );
}
