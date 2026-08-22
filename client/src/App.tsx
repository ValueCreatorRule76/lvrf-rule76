import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { RunPage } from './pages/RunPage';
import { RunsIndexPage } from './pages/RunsIndexPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RunsIndexPage />} />
        <Route path="/runs/:id" element={<RunPage />} />
      </Routes>
    </BrowserRouter>
  );
}
