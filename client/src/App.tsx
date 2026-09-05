import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { RunPage } from './pages/RunPage';
import { RunsIndexPage } from './pages/RunsIndexPage';
import { IndustryPackPage } from './pages/IndustryPackPage';
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
        </Routes>
      </ActorProvider>
    </BrowserRouter>
  );
}
