import { describe, expect, it } from "vitest";

import { normalizeRoleName } from "../src/lib/roles.js";

describe("role name normalization", () => {
  it("uses canonical labels for built-in role codes", () => {
    expect(normalizeRoleName({ code: "student", name: "Super Admin" })).toBe("Student");
    expect(normalizeRoleName({ code: "super_admin", name: "Student" })).toBe("Super Admin");
  });

  it("falls back to the stored name for unknown role codes", () => {
    expect(normalizeRoleName({ code: "custom_role", name: "Custom Role" })).toBe("Custom Role");
  });

  it("falls back to the code when no name is available", () => {
    expect(normalizeRoleName({ code: "custom_role", name: "" })).toBe("custom_role");
  });
});

