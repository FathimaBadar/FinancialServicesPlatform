/**
 * users.organization — wire types, validation schema and data hooks.
 * Server state rides TanStack Query (ui-std §7) on top of the widget port, so the
 * ONE network path (port → BFF → gateway → core) is preserved.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ApiError } from '../../../web-core/api';
import type { WidgetDataPortLike } from '../../core/manifest';

/* ------------------------------------------------------------------ wire */
/** PENDING = staged by a maker, awaiting a checker (USER_CREATE) — cannot sign in, holds no roles. */
export type UserStatus = 'PENDING' | 'ACTIVE' | 'DISABLED' | 'ARCHIVED';

export interface RoleRef {
  id: string;
  key: string;
  name: string;
}

export interface UserRow {
  id: string;
  tenantId: string;
  username: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  status: UserStatus;
  isApplicant: boolean;
  /** may resolve four-eyes approvals (docs/checker-flag.md) */
  checker: boolean;
  roles: RoleRef[];
  version: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

/** One page of an org's users — core's UserDtos.UserPage (AGENTS §2.7 envelope). */
export interface UserPage {
  items: UserRow[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  hasNext: boolean;
  sort: string;
  /** whole-org counts per status (+ CURRENT = not removed), independent of page / search / filter */
  counts: Record<StatusCountKey, number>;
}

export type StatusCountKey = 'CURRENT' | 'PENDING' | 'ACTIVE' | 'DISABLED' | 'ARCHIVED';

export interface RoleOption {
  id: string;
  key: string;
  name: string;
  scope: string;
  permissionCount: number;
  assignable: boolean;
}

export interface OrgRow {
  id: string;
  legalName: string;
  depth: number;
  type: string;
  parentTenantId: string | null;
}

/* ------------------------------------------------------------ validation */
/** Mirrors UserAdminService's server rules so most mistakes are caught on blur. */
export const userFormSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9._-]{2,63}$/, '3–64 characters: lowercase letters, digits, . _ or -'),
  fullName: z.string().trim().min(2, 'Enter the person’s full name').max(120, 'Keep it under 120 characters'),
  email: z
    .string()
    .trim()
    .max(254)
    .refine((v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v), 'Enter a valid email address'),
  phone: z
    .string()
    .trim()
    .refine((v) => v === '' || /^\+?[0-9][0-9 ()-]{5,19}$/.test(v), 'Enter a valid phone number, e.g. +264 81 123 4567'),
  roleIds: z.array(z.string()),
  checker: z.boolean(),
});

export type UserFormValues = z.infer<typeof userFormSchema>;
export type UserFormField = keyof UserFormValues;

/** Server problem code → the field it belongs to (otherwise a form-level message). */
export const FIELD_FOR_CODE: Record<string, UserFormField> = {
  USERNAME_INVALID: 'username',
  USERNAME_TAKEN: 'username',
  FULL_NAME_INVALID: 'fullName',
  EMAIL_INVALID: 'email',
  PHONE_INVALID: 'phone',
  ROLE_UNKNOWN: 'roleIds',
  ROLE_NOT_ASSIGNABLE: 'roleIds',
  SELF_ROLE_CHANGE: 'roleIds',
};

/* ------------------------------------------------------------- problems */
export interface Problem {
  status: number;
  code: string;
  message: string;
}

/** ApiError carries `title` = server code for 403s and `code` otherwise (web-core/api). */
export function toProblem(err: unknown): Problem {
  if (err instanceof ApiError) {
    const code = err.status === 403 ? err.title : err.code ?? `HTTP_${err.status}`;
    return { status: err.status, code, message: err.detail };
  }
  return { status: 0, code: 'NETWORK', message: err instanceof Error ? err.message : String(err) };
}

/* ------------------------------------------------------------ query keys */
export const userKeys = {
  all: ['users'] as const,
  org: (orgId: string) => ['users', 'org', orgId] as const,
  lists: (orgId: string) => ['users', 'org', orgId, 'list'] as const,
  list: (orgId: string, q: UserListQuery) => ['users', 'org', orgId, 'list', q] as const,
  user: (orgId: string, id: string) => ['users', 'org', orgId, 'user', id] as const,
  roles: (orgId: string) => ['users', 'org', orgId, 'roles'] as const,
  orgs: (rootOrgId: string) => ['users', 'orgs', rootOrgId] as const,
};

/* ------------------------------------------------------------------ reads */
/** What the list asks core for. Search, filter, sort and paging all run server-side (AGENTS §2.7). */
export interface UserListQuery {
  page: number;
  size: number;
  q: string;
  status: StatusFilter;
  sort: SortId;
}

export const PAGE_SIZES = [20, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 20;

/** `users.list` params; the source's allow-list decides what reaches the URL, blanks are dropped. */
export function listParams(orgId: string, q: UserListQuery): Record<string, string> {
  const out: Record<string, string> = {
    tenantId: orgId, page: String(q.page), size: String(q.size), status: q.status, sort: q.sort,
  };
  const text = q.q.trim();
  if (text) out.q = text;
  return out;
}

export function useUserList(port: WidgetDataPortLike, orgId: string, q: UserListQuery) {
  return useQuery({
    queryKey: userKeys.list(orgId, q),
    queryFn: () => port.request<UserPage>('users.list', listParams(orgId, q)),
    placeholderData: (prev) => prev,
  });
}

/**
 * The open user, by id — they may not be on the page being shown (an Approvals deep link,
 * a search that no longer matches). Seeded from the page row when it is there.
 */
export function useUser(port: WidgetDataPortLike, orgId: string, id: string | null, row: UserRow | undefined) {
  return useQuery({
    queryKey: userKeys.user(orgId, id ?? ''),
    queryFn: () => port.request<UserRow>('users.get', { tenantId: orgId, personId: id ?? '' }),
    enabled: Boolean(id) && id !== 'new',
    initialData: row,
    retry: false,
  });
}

export function useRoleOptions(port: WidgetDataPortLike, orgId: string, enabled: boolean) {
  return useQuery({
    queryKey: userKeys.roles(orgId),
    queryFn: () => port.request<RoleOption[]>('users.roles', { tenantId: orgId }),
    enabled,
    staleTime: 5 * 60_000,
  });
}

/**
 * The organizations this actor can administer: own org + up to two levels below
 * (Phase-0 hierarchy depth). Branches the actor cannot read are silently skipped.
 */
export function useOrgOptions(port: WidgetDataPortLike, rootOrgId: string) {
  return useQuery({
    queryKey: userKeys.orgs(rootOrgId),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<OrgRow[]> => {
      const root = await port.request<OrgRow>('users.org', { tenantId: rootOrgId });
      const children = await port
        .request<OrgRow[]>('users.org.children', { tenantId: rootOrgId })
        .catch(() => [] as OrgRow[]);
      const grand = await Promise.all(
        children.map((c) =>
          port.request<OrgRow[]>('users.org.children', { tenantId: c.id }).catch(() => [] as OrgRow[]),
        ),
      );
      const out: OrgRow[] = [root];
      children.forEach((c, i) => {
        out.push(c, ...(grand[i] ?? []));
      });
      return out;
    },
  });
}

/* ----------------------------------------------------------------- writes */
export type UserCommand =
  | { kind: 'create'; values: UserFormValues }
  | { kind: 'update'; user: UserRow; values: UserFormValues; rolesEditable: boolean }
  | { kind: 'deactivate'; user: UserRow }
  | { kind: 'activate'; user: UserRow }
  | { kind: 'remove'; user: UserRow };

const blankToEmpty = (v: string) => v.trim();

/**
 * Every user command, never optimistic, never auto-retried; on settle the org's
 * user list is invalidated explicitly (ui-std §7).
 */
export function useUserCommand(port: WidgetDataPortLike, orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cmd: UserCommand): Promise<UserRow> => {
      const base = { tenantId: orgId };
      switch (cmd.kind) {
        case 'create':
          return port.command<UserRow>(
            'user.create',
            {
              username: cmd.values.username,
              fullName: cmd.values.fullName,
              email: blankToEmpty(cmd.values.email),
              phone: blankToEmpty(cmd.values.phone),
              roleIds: cmd.values.roleIds,
              checker: cmd.values.checker,
            },
            base,
          );
        case 'update':
          return port.command<UserRow>(
            'user.update',
            {
              fullName: cmd.values.fullName,
              email: blankToEmpty(cmd.values.email),
              phone: blankToEmpty(cmd.values.phone),
              roleIds: cmd.rolesEditable ? cmd.values.roleIds : null,
              checker: cmd.rolesEditable ? cmd.values.checker : null,
              expectedVersion: cmd.user.version,
            },
            { ...base, personId: cmd.user.id },
          );
        case 'deactivate':
          return port.command<UserRow>('user.deactivate', { expectedVersion: cmd.user.version }, { ...base, personId: cmd.user.id });
        case 'activate':
          return port.command<UserRow>('user.activate', { expectedVersion: cmd.user.version }, { ...base, personId: cmd.user.id });
        case 'remove':
          return port.command<UserRow>('user.remove', undefined, {
            ...base,
            personId: cmd.user.id,
            expectedVersion: String(cmd.user.version),
          });
      }
    },
    onSuccess: (saved) => {
      // write-through the confirmed server row for the open drawer, then re-sync every page
      // (a fixture/acknowledgement response without a row only triggers the re-sync)
      if (!saved || typeof saved.id !== 'string') return;
      qc.setQueryData<UserRow>(userKeys.user(orgId, saved.id), saved);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: userKeys.org(orgId) }),
  });
}

/* ---------------------------------------------------------------- helpers */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? '?';
  const b = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (a + b).toUpperCase();
}

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  return new Date(iso).toLocaleDateString();
}

export function absoluteTime(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString() : '—';
}

export type StatusFilter = 'current' | 'PENDING' | 'ACTIVE' | 'DISABLED' | 'ARCHIVED';

export const STATUS_FILTERS: { id: StatusFilter; label: string; countKey: StatusCountKey }[] = [
  { id: 'current', label: 'All', countKey: 'CURRENT' },
  { id: 'PENDING', label: 'Awaiting approval', countKey: 'PENDING' },
  { id: 'ACTIVE', label: 'Active', countKey: 'ACTIVE' },
  { id: 'DISABLED', label: 'Deactivated', countKey: 'DISABLED' },
  { id: 'ARCHIVED', label: 'Removed', countKey: 'ARCHIVED' },
];

/** Sort choices — each is on core's safelist (UserAdminService.SORT_FIELDS). */
export const SORT_OPTIONS = [
  { id: 'username,asc', label: 'Username A–Z' },
  { id: 'fullName,asc', label: 'Name A–Z' },
  { id: 'fullName,desc', label: 'Name Z–A' },
  { id: 'updatedAt,desc', label: 'Recently updated' },
  { id: 'createdAt,desc', label: 'Newest first' },
  { id: 'createdAt,asc', label: 'Oldest first' },
] as const;

export type SortId = (typeof SORT_OPTIONS)[number]['id'];
export const DEFAULT_SORT: SortId = 'username,asc';
