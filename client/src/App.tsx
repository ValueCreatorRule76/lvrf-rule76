import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { RunPage } from './pages/RunPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/runs/:id" element={<RunPage />} />
      </Routes>
    </BrowserRouter>
  );
}
