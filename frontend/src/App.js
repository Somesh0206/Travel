import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Home from "@/pages/Home";
import AdminDashboard from "@/pages/AdminDashboard";
import Offline from "@/pages/Offline";

function ThemedToaster() {
  const { theme } = useAuth();
  return <Toaster theme={theme === "light" ? "light" : "dark"} position="top-right" richColors closeButton />;
}

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/offline" element={<Offline />} />
            <Route path="/" element={
              <ProtectedRoute><Home /></ProtectedRoute>
            } />
            <Route path="/admin" element={
              <ProtectedRoute admin><AdminDashboard /></ProtectedRoute>
            } />
          </Routes>
        </BrowserRouter>
        <ThemedToaster />
      </AuthProvider>
    </div>
  );
}

export default App;
