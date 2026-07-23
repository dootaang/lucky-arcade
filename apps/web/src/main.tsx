import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { Home } from "./routes/home.tsx";
import "@lucky-arcade/ui/tokens.css";
import "./styles.css";

const router = createBrowserRouter([{ path: "*", Component: Home }]);
const root = document.getElementById("root");
if (!root) throw new Error("root_element_missing");
createRoot(root).render(<StrictMode><RouterProvider router={router} /></StrictMode>);
