import { NavLink, Route, Routes } from "react-router-dom";
import { ModelProvider, SettingsLink } from "./components/models";
import Dashboard from "./pages/Dashboard";
import NewAnalysis from "./pages/NewAnalysis";
import MatchPage from "./pages/MatchPage";
import VersionsPage from "./pages/VersionsPage";
import VersionPage from "./pages/VersionPage";
import LibraryPage from "./pages/LibraryPage";
import SettingsPage from "./pages/SettingsPage";

export default function App() {
  return (
    <ModelProvider>
      <div className="app">
        <header className="topbar">
          <NavLink to="/" className="brand">JobJury</NavLink>
          <nav aria-label="Main">
            <NavLink to="/" end>Analyses</NavLink>
            <NavLink to="/versions">Tailored resumes</NavLink>
            <NavLink to="/library">Library</NavLink>
          </nav>
          <div className="topbar-right">
            <SettingsLink />
            <NavLink to="/new" className="btn btn-primary">New analysis</NavLink>
          </div>
        </header>
        <main>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/new" element={<NewAnalysis />} />
            <Route path="/matches/:id" element={<MatchPage />} />
            <Route path="/versions" element={<VersionsPage />} />
            <Route path="/versions/:id" element={<VersionPage />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<div className="page"><p className="empty">Page not found.</p></div>} />
          </Routes>
        </main>
      </div>
    </ModelProvider>
  );
}
