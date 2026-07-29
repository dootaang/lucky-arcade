import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { Home } from "./routes/home.tsx";
import { CabinetRoute } from "./routes/cabinet-route.tsx";
import { AdminPreviewRoute } from "./routes/admin-preview-route.tsx";
import "@lucky-arcade/ui/tokens.css";
import "@lucky-arcade/ui/casino.css";
import "./styles.css";

const router = createBrowserRouter([
  { path: "/", Component: Home },
  { path: "/venues/:venueId", Component: Home },
  { path: "/play/:cabinetId", Component: CabinetRoute },
  { path: "/preview/:cabinetId", Component: AdminPreviewRoute },
  {
    path: "/review/temerosa",
    lazy: async () => {
      const module = await import("./features/temerosa-review/temerosa-review-page.tsx");
      return { Component: module.TemerosaReviewPage };
    },
  },
  ...(import.meta.env.DEV ? [
    { path: "/dev", element: <Home privatePreview /> },
    { path: "/dev/cabinets/:cabinetId", element: <CabinetRoute privatePreview /> },
  ] : []),
  { path: "*", Component: Home },
]);
const root = document.getElementById("root");
if (!root) throw new Error("root_element_missing");
createRoot(root).render(<StrictMode><RouterProvider router={router} /></StrictMode>);
