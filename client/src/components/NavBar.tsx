import { NavLink } from 'react-router-dom';
import { Badge } from './workbench/Card';
import { FOCUS_RING } from './GovernedForm';

// TWO links, nothing else. NO Packs link — there is no GET /api/industries
// index scoped for navigation chrome, and a link aimed at one seeded slug
// would put a stated fact (which industry) into the chrome as a constant.
// The only route to a pack is InstitutionPage's own classification link.
//
// NO user menu, no sign-out, no settings. There is no user model — the
// perimeter is basic auth and the actor is a spoofable header
// (actorContext.ts) — so a menu here would assert a permission system
// that does not exist.
//
// Renders links only; DOES NOT touch ActorBar, which has its own job.
// App.tsx composes the two into one row.
//
// Active treatment reuses Badge's own tone vocabulary — solid (bg-ink,
// text-offwhite) for the active link, neutral for the rest — rather than
// inventing a colour or token for "active" that AMENDMENT-004 never
// defined. NavLink's render-prop form supplies isActive; the router
// decides, this component only renders what it's told.
const LINKS: { to: string; label: string; end?: boolean }[] = [
  { to: '/', label: 'Accounts', end: true },
  { to: '/runs', label: 'Runs' },
];

export function NavBar() {
  return (
    <nav className="flex items-center gap-2 border-b border-rule bg-white px-[30px] py-2.5">
      {LINKS.map((link) => (
        <NavLink key={link.to} to={link.to} end={link.end} className={FOCUS_RING}>
          {({ isActive }) => <Badge tone={isActive ? 'solid' : 'neutral'}>{link.label}</Badge>}
        </NavLink>
      ))}
    </nav>
  );
}
