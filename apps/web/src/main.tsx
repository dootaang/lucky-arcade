import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { Home } from "./routes/home.tsx";
import "@lucky-arcade/ui/tokens.css";
import "./styles.css";

const router = createBrowserRouter([
  {
    path: "/review/temerosa",
    lazy: async () => {
      const module = await import("./features/temerosa-review/temerosa-review-page.tsx");
      return { Component: module.TemerosaReviewPage };
    },
  },
  { path: "*", Component: Home },
]);
const root = document.getElementById("root");
if (!root) throw new Error("root_element_missing");
createRoot(root).render(<StrictMode><RouterProvider router={router} /></StrictMode>);
