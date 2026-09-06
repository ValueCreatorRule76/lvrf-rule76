import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { RunPage } from './pages/RunPage';
import { RunsIndexPage } from './pages/RunsIndexPage';
import { AccountsIndexPage } from './pages/AccountsIndexPage';
import { PacksIndexPage } from './pages/PacksIndexPage';
import { IndustryPackPage } from './pages/IndustryPackPage';
import { InstitutionPage } from './pages/InstitutionPage';
import { ActorProvider } from './actor/ActorContext';
import { ActorBar } from './actor/ActorBar';
import { NavBar } from './components/NavBar';

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
        <Routes>
          <Route path="/" element={<AccountsIndexPage />} />
          <Route path="/runs" element={<RunsIndexPage />} />
          <Route path="/runs/:id" element={<RunPage />} />
          <Route path="/packs" element={<PacksIndexPage />} />
          <Route path="/packs/:slug" element={<IndustryPackPage />} />
          <Route path="/accounts/:id" element={<InstitutionPage />} />
        </Routes>
      </ActorProvider>
    </BrowserRouter>
  );
}
