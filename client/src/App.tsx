import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { RunPage } from './pages/RunPage';
import { RunsIndexPage } from './pages/RunsIndexPage';
import { IndustryPackPage } from './pages/IndustryPackPage';
import { InstitutionPage } from './pages/InstitutionPage';
import { ActorProvider } from './actor/ActorContext';
import { ActorBar } from './actor/ActorBar';

export default function App() {
  return (
    <BrowserRouter>
      <ActorProvider>
        <ActorBar />
        <Routes>
          <Route path="/" element={<RunsIndexPage />} />
          <Route path="/runs/:id" element={<RunPage />} />
          <Route path="/packs/:slug" element={<IndustryPackPage />} />
          <Route path="/accounts/:id" element={<InstitutionPage />} />
        </Routes>
      </ActorProvider>
    </BrowserRouter>
  );
}
