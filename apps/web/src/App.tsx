import { useEffect } from "react";
import { useLocation, useRoutes } from "react-router-dom";
import { appRoutes } from "./app/routes";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);
  return null;
}

export function App() {
  const routes = useRoutes(appRoutes);
  return <><ScrollToTop />{routes}</>;
}
