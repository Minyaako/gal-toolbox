import { SearchPage } from "./SearchPage";

export function KnowledgeLayout() {
  return <div className="knowledge-page">
    <span className="knowledge-page-emblem" aria-hidden="true">◇</span>
    <SearchPage />
  </div>;
}
