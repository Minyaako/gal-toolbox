import { Navigate, useLocation, useParams, type RouteObject } from "react-router-dom";
import { CharacterPage } from "../pages/CharacterPage";
import { HomePage } from "../pages/HomePage";
import { KnowledgeLayout } from "../pages/KnowledgeLayout";
import { NotFoundPage } from "../pages/NotFoundPage";
import { RankingPage } from "../pages/RankingPage";
import { SettingsPage } from "../pages/SettingsPage";
import { StaffPage } from "../pages/StaffPage";
import { TagPage } from "../pages/TagPage";
import { VnPage } from "../pages/VnPage";
import { AppShell } from "./AppShell";

type LegacyEntityType = "vn" | "character" | "staff" | "tag";

export function legacyRedirectContract(
  type: LegacyEntityType,
  id: string,
  search: string,
  hash: string,
) {
  return {
    replace: true,
    to: `/knowledge/${type}/${id}${search}${hash}`,
  };
}

function LegacyRedirect({ type }: { type: LegacyEntityType }) {
  const { id = "" } = useParams();
  const location = useLocation();
  return <Navigate {...legacyRedirectContract(type, id, location.search, location.hash)} />;
}

export const appRoutes: RouteObject[] = [{
  element: <AppShell />,
  children: [
    { path: "/", element: <HomePage /> },
    { path: "/knowledge", element: <KnowledgeLayout /> },
    { path: "/knowledge/vn/:id", element: <VnPage /> },
    { path: "/knowledge/character/:id", element: <CharacterPage /> },
    { path: "/knowledge/staff/:id", element: <StaffPage /> },
    { path: "/knowledge/tag/:id", element: <TagPage /> },
    { path: "/ranking", element: <RankingPage /> },
    { path: "/settings", element: <SettingsPage /> },
    { path: "/vn/:id", element: <LegacyRedirect type="vn" /> },
    { path: "/character/:id", element: <LegacyRedirect type="character" /> },
    { path: "/staff/:id", element: <LegacyRedirect type="staff" /> },
    { path: "/tag/:id", element: <LegacyRedirect type="tag" /> },
    { path: "*", element: <NotFoundPage /> },
  ],
}];

export function pageTitle(pathname: string): string {
  if (/^\/knowledge\/tag\/[^/]+$/.test(pathname)) return "Tag 图鉴";
  if (/^\/knowledge\/(vn|character|staff)\/[^/]+$/.test(pathname) || pathname === "/knowledge") return "知识图鉴";
  if (pathname === "/ranking") return "Gal 排行";
  if (pathname === "/settings") return "设置";
  if (pathname === "/") return "百宝箱大厅";
  return "页面未找到";
}
