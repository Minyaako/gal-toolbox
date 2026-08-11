import type { EntitySummary } from "../api";

export type AppSection = "home" | "knowledge" | "ranking" | "settings";

export type NavigationItem = {
  section: AppSection;
  to: string;
  label: string;
  description: string;
  marker: string;
};

export const mainNavigation: readonly NavigationItem[] = [
  { section: "home", to: "/", label: "首页", description: "Gal 百宝箱", marker: "01" },
  { section: "knowledge", to: "/knowledge", label: "知识图鉴", description: "作品、角色、声优与 Tag", marker: "02" },
  { section: "ranking", to: "/ranking", label: "排行榜", description: "等待整理的收藏柜", marker: "03" },
  { section: "settings", to: "/settings", label: "设置", description: "浏览与显示偏好", marker: "04" },
] as const;

export function knowledgeEntityPath(entity: Pick<EntitySummary, "id" | "type">): string {
  return `/knowledge/${entity.type}/${entity.id}`;
}

export function artistPath(id: string): string {
  return `/knowledge/artist/${id}`;
}
