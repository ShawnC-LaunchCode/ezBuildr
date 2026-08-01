import type { Organization } from "@/lib/api/organizations";

export type AssetOwnerType = "user" | "org";
export type OrgRole = "admin" | "member";

export interface OwnedAsset {
  ownerType?: AssetOwnerType | null;
  ownerUuid?: string | null;
  ownerName?: string | null;
}

export function getOrgRoleForAsset(
  asset: OwnedAsset,
  organizations: Organization[] | undefined
): OrgRole | null {
  if (asset.ownerType !== "org" || !asset.ownerUuid) {
    return null;
  }

  return organizations?.find((organization) => organization.id === asset.ownerUuid)?.role ?? null;
}

export function getOrgRestrictedActionReason(
  asset: OwnedAsset,
  organizations: Organization[] | undefined,
  organizationsLoading = false
): string | undefined {
  if (asset.ownerType !== "org") {
    return undefined;
  }

  const role = getOrgRoleForAsset(asset, organizations);
  if (role === "admin") {
    return undefined;
  }

  return organizationsLoading ? "Checking org role" : "Org admin required";
}

export function canManageOrgRestrictedActions(
  asset: OwnedAsset,
  organizations: Organization[] | undefined,
  organizationsLoading = false
): boolean {
  return getOrgRestrictedActionReason(asset, organizations, organizationsLoading) === undefined;
}

export function getOwnerLabel(asset: OwnedAsset, currentUserId?: string | null): string {
  if (asset.ownerType === "org") {
    return asset.ownerName ?? "Organization";
  }

  if (asset.ownerType === "user" && asset.ownerUuid && currentUserId && asset.ownerUuid === currentUserId) {
    return "My account";
  }

  return "Personal";
}
