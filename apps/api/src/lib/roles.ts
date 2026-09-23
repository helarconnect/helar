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

