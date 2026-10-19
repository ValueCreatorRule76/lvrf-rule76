import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { RunPage } from './pages/RunPage';
import { RunsIndexPage } from './pages/RunsIndexPage';
import { AccountsIndexPage } from './pages/AccountsIndexPage';
import { PacksIndexPage } from './pages/PacksIndexPage';
import { IndustryPackPage } from './pages/IndustryPackPage';
import { InstitutionPage } from './pages/InstitutionPage';
import { PovPage } from './pages/PovPage';
import { ActorProvider, useActor } from './actor/ActorContext';
import { SignInOverlay, SignInPage } from './actor/SignIn';
import { ChangePasswordPage } from './actor/ChangePassword';
import { AppHeader } from './components/AppHeader';

// Sign-in P2a. Nobody signed in: the sign-in page, in place of the routes —
// the URL is kept, so the page asked for opens once signed in. A session
// that ends mid-task: the routes stay mounted (a half-filled form keeps its
// fields) and the sign-in panel opens over them.
function SignedInRoutes() {
  const { status } = useActor();
  if (status === 'loading') return null;
  if (status === 'signed_out') return <SignInPage />;
  // Band A: a starting password is replaced before anything else is shown.
  if (status === 'must_change') return <ChangePasswordPage forced />;
  return (
    <>
      <Routes>
        <Route path="/" element={<AccountsIndexPage />} />
        <Route path="/runs" element={<RunsIndexPage />} />
        <Route path="/runs/:id" element={<RunPage />} />
        <Route path="/packs" element={<PacksIndexPage />} />
        <Route path="/packs/:slug" element={<IndustryPackPage />} />
        <Route path="/accounts/:id" element={<InstitutionPage />} />
        <Route path="/accounts/:id/pov" element={<PovPage />} />
      </Routes>
      {status === 'expired' && <SignInOverlay />}
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ActorProvider>
        {/* UX-1 slice 2: today's row from 640 px up; one "Menu" row below (AppHeader). */}
        <AppHeader />
        <SignedInRoutes />
      </ActorProvider>
    </BrowserRouter>
  );
}
