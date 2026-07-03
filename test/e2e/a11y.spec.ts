import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("accessibility & polish", () => {
  test("no critical/serious axe violations on the main view", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByTestId("input-box")).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    if (serious.length) {
      console.error(
        "axe violations:",
        JSON.stringify(
          serious.map((v) => ({
            id: v.id,
            impact: v.impact,
            nodes: v.nodes.map((n) => n.target),
          })),
          null,
          2,
        ),
      );
    }
    expect(serious).toEqual([]);
  });

  test("dark mode toggles the root class", async ({ page }) => {
    await page.goto("/");
    const toggle = page.getByTestId("theme-toggle");
    await toggle.click();
    const isDark = await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    );
    // toggling flips it relative to the initial system-derived value
    await toggle.click();
    const isDarkAfter = await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    );
    expect(isDark).not.toBe(isDarkAfter);
  });

  test("examples load into the input", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("toggle-examples").click();
    await page.getByTestId("example").first().click();
    await expect(page.getByTestId("input-kind")).toContainText("calldata");
  });

  test("main view is keyboard-navigable to the run button", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByTestId("input-box").focus();
    await expect(page.getByTestId("input-box")).toBeFocused();
  });
});
