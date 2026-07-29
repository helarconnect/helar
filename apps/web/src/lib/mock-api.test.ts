import { describe, expect, it } from "vitest";

import { fetchDashboardSnapshot, fetchPricingPlans, marketingStats } from "@/lib/mock-api";

describe("mock-api", () => {
  it("returns pricing plans for the marketing flow", async () => {
    const plans = await fetchPricingPlans();

    expect(plans).toHaveLength(3);
    expect(plans[1].label).toBe("Most popular");
  });

  it("returns a student dashboard snapshot", async () => {
    const snapshot = await fetchDashboardSnapshot();

    expect(snapshot.activePlan).toContain("Advocate");
    expect(snapshot.courses.length).toBeGreaterThan(0);
  });

  it("keeps landing-page stats available", () => {
    expect(marketingStats.map((item) => item.label)).toContain("institution partners");
  });
});
