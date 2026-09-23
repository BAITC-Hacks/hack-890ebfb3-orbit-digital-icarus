import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/app.css";
import "./styles/journey.css"; // Journey styles extend the original interface palette.
import "./styles/brand.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
