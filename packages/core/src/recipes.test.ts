import { describe, expect, it } from "vitest";
import { applyRecipe, BUILTIN_RECIPES, type Recipe } from "./recipes";

describe("recipes", () => {
  it("ships built-in recipes with param slots", () => {
    expect(BUILTIN_RECIPES.length).toBeGreaterThan(0);
    const approveSwap = BUILTIN_RECIPES.find(
      (r) => r.id === "approve-then-swap",
    );
    expect(approveSwap).toBeDefined();
    expect(approveSwap?.params.some((p) => p.key === "token")).toBe(true);
  });

  it("substitutes params into the calldata template", () => {
    const recipe: Recipe = {
      id: "test",
      name: "test",
      description: "",
      abi: ["function approve(address spender, uint256 amount)"],
      functionName: "approve",
      params: [
        { key: "spender", type: "address", label: "Spender" },
        { key: "amount", type: "uint256", label: "Amount" },
      ],
      argTemplate: ["{{spender}}", "{{amount}}"],
    };
    const result = applyRecipe(recipe, {
      spender: "0x000000000000000000000000000000000000dEaD",
      amount: "1000",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // approve selector
      expect(result.data.startsWith("0x095ea7b3")).toBe(true);
    }
  });

  it("reports missing params", () => {
    const recipe = BUILTIN_RECIPES[0]!;
    const result = applyRecipe(recipe, {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.length).toBeGreaterThan(0);
  });
});
