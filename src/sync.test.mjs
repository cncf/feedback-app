import { expect, test } from "bun:test";
import { categoryFor, configuredCategories, planLabels, stripPrefix } from "./sync.mjs";

const P = ["area/", "kind/"];
const on = (...names) => names.map((name) => ({ id: `L_${name}`, name }));

test("only prefixed labels cross over, and the prefix is dropped", () => {
  expect(stripPrefix("area/api", P)).toBe("api");
  expect(stripPrefix("kind/bug", P)).toBe("bug");
  expect(stripPrefix("needs-rebase", P)).toBeNull();
  expect(stripPrefix("area/", P)).toBeNull();
  expect(stripPrefix("area/api", [])).toBeNull();
});

test("mirrors new labels, ignores process labels, stays put once converged", () => {
  const vocab = new Set(["api"]);
  const fresh = planLabels(["area/api", "lgtm", "do-not-merge/hold", "feedback"], [], vocab, P);
  expect(fresh).toEqual({ add: ["api"], remove: [] });

  const converged = planLabels(["area/api"], on("api"), vocab, P);
  expect(converged).toEqual({ add: [], remove: [] });
});

test("retracts a removed label but never touches hub-side curation", () => {
  const { add, remove } = planLabels([], on("api", "pinned"), new Set(["api"]), P);
  expect(add).toEqual([]);
  expect(remove).toEqual(on("api"));
});

const project = {
  hub: { categoryName: "General", categoryId: "DIC_default" },
  routes: [
    { label: "sig/network", categoryName: "Network", categoryId: "DIC_net" },
    { label: "sig/node", categoryName: "Node", categoryId: "DIC_node" },
  ],
};

test("routes by group label; config order breaks ties; no match falls back", () => {
  expect(categoryFor(project, ["feedback", "sig/node"])).toEqual({ categoryId: "DIC_node", categoryName: "Node", ambiguous: null });
  // kubernetes/enhancements#6313 shape: two SIG labels on one issue
  expect(categoryFor(project, ["sig/node", "sig/network"])).toEqual({ categoryId: "DIC_net", categoryName: "Network", ambiguous: ["sig/network", "sig/node"] });
  // #6358 shape: feedback label, no SIG label
  expect(categoryFor(project, ["feedback"])).toEqual({ categoryId: "DIC_default", categoryName: "General", ambiguous: null });
  expect(categoryFor({ hub: project.hub }, ["sig/node"]).categoryId).toBe("DIC_default");
});

test("index trusts exactly the configured categories", () => {
  expect(configuredCategories(project)).toEqual(new Set(["DIC_default", "DIC_net", "DIC_node"]));
  expect(configuredCategories({ hub: project.hub })).toEqual(new Set(["DIC_default"]));
});
