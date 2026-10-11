import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { RunPage } from './pages/RunPage';
import { RunsIndexPage } from './pages/RunsIndexPage';
import { AccountsIndexPage } from './pages/AccountsIndexPage';
import { PacksIndexPage } from './pages/PacksIndexPage';
import { IndustryPackPage } from './pages/IndustryPackPage';
import { InstitutionPage } from './pages/InstitutionPage';
import { ActorProvider, useActor } from './actor/ActorContext';
import { ActorBar } from './actor/ActorBar';
import { SignInOverlay, SignInPage } from './actor/SignIn';
import { NavBar } from './components/NavBar';

// Sign-in P2a. Nobody signed in: the sign-in page, in place of the routes —
// the URL is kept, so the page asked for opens once signed in. A session
// that ends mid-task: the routes stay mounted (a half-filled form keeps its
// fields) and the sign-in panel opens over them.
function SignedInRoutes() {
  const { status } = useActor();
  if (status === 'loading') return null;
  if (status === 'signed_out') return <SignInPage />;
  return (
    <>
      <Routes>
        <Route path="/" element={<AccountsIndexPage />} />
        <Route path="/runs" element={<RunsIndexPage />} />
        <Route path="/runs/:id" element={<RunPage />} />
        <Route path="/packs" element={<PacksIndexPage />} />
        <Route path="/packs/:slug" element={<IndustryPackPage />} />
        <Route path="/accounts/:id" element={<InstitutionPage />} />
      </Routes>
      {status === 'expired' && <SignInOverlay />}
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ActorProvider>
        {/* One row, two components that don't know about each other.
            NavBar is fixed-width content; ActorBar fills the rest, exactly
            as wide as it always was — neither file is touched to compose
            them. */}
        <div className="flex items-stretch">
          <NavBar />
          <div className="flex-1">
            <ActorBar />
          </div>
        </div>
        <SignedInRoutes />
      </ActorProvider>
    </BrowserRouter>
  );
}
