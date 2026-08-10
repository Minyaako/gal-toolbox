import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RelationRail } from "./VnPage";

describe("RelationRail", () => {
  it("keeps relation cards together in one normal-flow rail", () => {
    const markup = renderToStaticMarkup(
      <RelationRail>
        <section className="relation-rail-card">Tags</section>
        <section className="relation-rail-card">Related works</section>
      </RelationRail>,
    );

    expect(markup).toBe(
      '<div class="relation-rail"><section class="relation-rail-card">Tags</section><section class="relation-rail-card">Related works</section></div>',
    );
  });
});
