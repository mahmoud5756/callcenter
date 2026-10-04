import type { UserRole } from '../types';

// Which roles may open which tab. Tabs not listed are open to every logged-in user.
const TAB_ROLES: Record<string, UserRole[]> = {
  assignment: ['admin', 'manager'],
  reports: ['admin', 'manager'],
  closing: ['admin', 'manager'],
  import: ['admin', 'manager'],
  audit: ['admin'],
  settings: ['admin'],
};

export const canAccessTab = (role: UserRole | undefined, tab: string): boolean => {
  const allowed = TAB_ROLES[tab];
  if (!allowed) return Boolean(role);
  return role ? allowed.includes(role) : false;
};
