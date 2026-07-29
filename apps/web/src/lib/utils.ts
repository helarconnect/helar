import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const adminRoleCodes = new Set([
  'super_admin',
  'administrator',
  'academic_administrator',
  'finance_officer',
  'moderator',
  'content_admin',
])

export function hasAdminAccess(roleCodes: string[] = []) {
  return roleCodes.some((roleCode) => adminRoleCodes.has(roleCode))
}

export function hasRole(roleCodes: string[] = [], targetRoleCode: string) {
  return roleCodes.includes(targetRoleCode)
}

export function isSuperAdmin(roleCodes: string[] = []) {
  return hasRole(roleCodes, 'super_admin')
}

export function isContentAdmin(roleCodes: string[] = []) {
  return hasRole(roleCodes, 'content_admin')
}

export function hasExecutiveDashboardAccess(roleCodes: string[] = []) {
  return isSuperAdmin(roleCodes) || isContentAdmin(roleCodes)
}

export function canAccessPayments(roleCodes: string[] = []) {
  return hasAdminAccess(roleCodes) && !isContentAdmin(roleCodes)
}

export function canModerateHelarConnect(roleCodes: string[] = []) {
  return roleCodes.some((roleCode) => ['super_admin', 'moderator', 'content_admin'].includes(roleCode))
}
