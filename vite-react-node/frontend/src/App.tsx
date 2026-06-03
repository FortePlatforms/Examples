import { Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";

// Client-side routes. This is a single-page application: the browser loads one HTML document and
// react-router swaps the view as you navigate, with no round-trip to a server. Forte's website
// hosting serves index.html for unknown paths, so a deep link like /dashboard also loads on a
// fresh visit or refresh — no _redirects file or 404.html needed. See the README.
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
