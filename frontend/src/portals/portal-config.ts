/**
 * Build-time portal identities — the FSP equivalent of the SME
 * `portal.config.ts` + fileReplacements. Each HTML entry boots the right
 * app with THIS config; the org portals share one app source
 * (src/portals/org/OrgApp.tsx) and differ only by this identity:
 *   admin.html        → AdminApp (platform staff)
 *   manufacturer.html → OrgApp port=portals.portal.manufacturer
 *   distributor.html  → OrgApp port=portals.portal.distributor
 *   wholesaler.html   → OrgApp port=portals.portal.wholesaler
 *   merchant.html     → OrgApp port=portals.portal.merchant (leaf of the supply chain)
 */
export interface PortalConfig {
  /** The tenant subType whose members may sign in here (PLATFORM for the admin console). */
  tenantSubType: 'PLATFORM' | 'MANUFACTURER' | 'DISTRIBUTOR' | 'WHOLESALER' | 'MERCHANT';
  /**
   * Tenant TYPES also admitted when the tenant row carries no sub-type yet (legacy rows from
   * before sub-type stamping). PSPs are manufacturers: core stamps MANUFACTURER on creation
   * and V19 back-fills old rows, so this is a belt-and-braces fallback, never a widening.
   */
  admitsTypes?: readonly string[];
  /** The browser route base for this portal entry ('' for admin). */
  basePath: string;
  label: string;
  /** CSS color — the shell sets --portal-accent from this. */
  accent: string;
  /** distinct localStorage key so sessions never bleed across portals. */
  storageKey: string;
  /** Signed-delivery enforcement (plans/signed-portal-delivery-plan.md §3): true → the
   *  SignedMenuGate refuses a missing/tampered bundle (fail closed, no downgrade). */
  signedDelivery: boolean;
  /** The portal name signed bundles are published under (core `ui_bundles.portal`, the
   *  portal builder's publish target) — NOT the menu PortalId ('platform' | 'org'). */
  deliveryKey: string;
}

export const ADMIN_PORTAL: PortalConfig = {
  tenantSubType: 'PLATFORM',
  basePath: '/admin',
  label: 'Admin Console',
  accent: '#f0a10e',
  storageKey: 'fsp.platform.session',
  signedDelivery: true,
  deliveryKey: 'admin',
};

export const PORTAL_MANUFACTURER: PortalConfig = {
  tenantSubType: 'MANUFACTURER',
  admitsTypes: ['PSP'],
  basePath: '/manufacturer',
  label: 'Manufacturer',
  accent: '#f0a35e',
  storageKey: 'fsp.manufacturer.session',
  signedDelivery: false,
  deliveryKey: 'manufacturer',
};

export const PORTAL_DISTRIBUTOR: PortalConfig = {
  tenantSubType: 'DISTRIBUTOR',
  basePath: '/distributor',
  label: 'Distributor',
  accent: '#a78bfa',
  storageKey: 'fsp.distributor.session',
  signedDelivery: false,
  deliveryKey: 'distributor',
};

export const PORTAL_WHOLESALER: PortalConfig = {
  tenantSubType: 'WHOLESALER',
  basePath: '/wholesaler',
  label: 'Wholesaler',
  accent: '#7cecff',
  storageKey: 'fsp.wholesaler.session',
  signedDelivery: false,
  deliveryKey: 'wholesaler',
};

export const PORTAL_MERCHANT: PortalConfig = {
  tenantSubType: 'MERCHANT',
  basePath: '/merchant',
  label: 'Merchant',
  accent: '#f2c94c',
  storageKey: 'fsp.merchant.session',
  signedDelivery: false,
  deliveryKey: 'merchant',
};

/** The widget workbench (SME projects/widget-workbench): widget frames, registry, portal
 *  builder. Fixture views work signed out; live data and publishing need a platform-staff
 *  session. Its own storageKey so workbench sign-out never touches a portal session (FAPI2
 *  per-portal isolation). It PRODUCES signed bundles, so it is not itself gated on one. */
export const WORKBENCH_PORTAL: PortalConfig = {
  tenantSubType: 'PLATFORM',
  basePath: '/widget-workbench',
  label: 'Widget workbench',
  accent: '#f0a10e',
  storageKey: 'fsp.widget-workbench.session',
  signedDelivery: false,
  deliveryKey: 'widget-workbench',
};
