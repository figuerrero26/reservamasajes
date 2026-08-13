import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CssBaseline } from "@mui/material";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./contexts/AuthContext";
import { UsuarioAuthProvider } from "./contexts/UsuarioAuthContext";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CssBaseline />
    <BrowserRouter>
      <AuthProvider>
        <UsuarioAuthProvider>
          <App />
        </UsuarioAuthProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
