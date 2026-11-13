export type RoleLike = {
  code: string;
  name?: string | null;
};

const roleDisplayNames: Record<string, string> = {
  super_admin: "Super Admin",
  content_admin: "Content Admin",
  administrator: "Administrator",
  academic_administrator: "Academic Administrator",
  finance_officer: "Finance Officer",
  moderator: "Moderator",
  support_staff: "Support Staff",
  tutor: "Tutor",
  judge: "Judge",
  lawyer: "Lawyer",
  student: "Student"
};

export function getRoleDisplayName(roleCode: string): string | null {
  return roleDisplayNames[roleCode] ?? null;
}

export function normalizeRoleName(role: RoleLike): string {
  const canonical = getRoleDisplayName(role.code);
  if (canonical) return canonical;
  const trimmed = role.name?.trim();
  if (trimmed) return trimmed;
  return role.code;
}


export function normalizeRoleCode(roleCode: string) {
  const trimmed = roleCode.trim().toLowerCase();
  const underscored = trimmed.replace(/[-\s]+/g, "_");
  const collapsed = underscored.replace(/_/g, "");
  if (collapsed === "superadmin") return "super_admin";
  if (collapsed === "contentadmin") return "content_admin";
  return underscored;
}
