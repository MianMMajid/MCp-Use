import { authContextStorage } from "../auth-context.js";
import { asString } from "../helpers.js";
import { PlatformStore } from "./platform-store.js";
import {
  bindUserToTenant,
  listUserTenantBindings,
  resolveVerifiedTenantScope,
  signTenantClaim,
  unbindAllUsersFromTenantOrg,
  unbindUserFromTenant,
} from "./tenant-claim-resolver.js";
import {
  deactivateOrg,
  findOrgNodeByOrgId,
  getOrgLifecycleEvents,
  getOrgNode,
  getOrgTree,
  upsertOrgNode,
} from "./org-hierarchy.js";

function normalizeRole(value, fallback = "member") {
  const role = String(value ?? "").trim().toLowerCase();
  if (role === "owner" || role === "admin" || role === "member") {
    return role;
  }
  return fallback;
}

function normalizeOrgType(value) {
  return String(value ?? "").trim() || "team";
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (normalized) {
      return normalized;
    }
  }
  return "";
}

function sortByBoundAtDesc(bindings) {
  return [...bindings].sort((a, b) => String(b.boundAt ?? "").localeCompare(String(a.boundAt ?? "")));
}

function hierarchyMetadataFromOrg(org) {
  return {
    ownerUserId: org.ownerUserId,
    bio: org.bio ?? "",
    email: org.email ?? "",
    email_is_public: org.email_is_public ?? true,
    currency: org.currency ?? "usd",
    address: org.address ?? "",
    city: org.city ?? "",
    region: org.region ?? "",
    postal_code: org.postal_code ?? "",
    country: org.country ?? "",
  };
}

function toOperationsOrg(org, options = {}) {
  return {
    orgId: org.orgId,
    name: org.name,
    ownerUserId: org.ownerUserId,
    bio: org.bio ?? "",
    email: org.email ?? "",
    email_is_public: org.email_is_public ?? true,
    currency: org.currency ?? "usd",
    address: org.address ?? "",
    city: org.city ?? "",
    region: org.region ?? "",
    postal_code: org.postal_code ?? "",
    country: org.country ?? "",
    status: org.status ?? "active",
    createdAt: org.createdAt,
    updatedAt: org.updatedAt,
    membersCount: org.membersCount ?? 0,
    tenantId: options.tenantId ?? "",
    parentOrgId: options.parentOrgId ?? null,
    orgType: options.orgType ?? "team",
    callerRole: options.callerRole ?? "",
    metadata: options.metadata ?? {},
  };
}

function toTreeNode(node) {
  return {
    tenantId: node.tenantId,
    orgId: node.orgId,
    parentOrgId: node.parentOrgId ?? null,
    name: node.orgName,
    orgType: node.orgType,
    status: node.status,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    createdBy: node.createdBy,
    metadata: node.metadata ?? {},
    children: [],
  };
}

function buildForest(records) {
  const nodes = new Map();
  const roots = [];

  for (const record of records) {
    nodes.set(`${record.tenantId}:${record.orgId}`, toTreeNode(record));
  }

  for (const record of records) {
    const key = `${record.tenantId}:${record.orgId}`;
    const node = nodes.get(key);
    if (!node) continue;
    const parentKey = record.parentOrgId ? `${record.tenantId}:${record.parentOrgId}` : "";
    const parent = parentKey ? nodes.get(parentKey) : null;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortNodes = (items) => {
    items.sort((left, right) => String(left.name).localeCompare(String(right.name)));
    for (const item of items) {
      sortNodes(item.children);
    }
  };
  sortNodes(roots);
  return roots;
}

export class GatewayOperationsPlatformService {
  constructor(options = {}) {
    this.database = options.database;
    this.platformStore = options.platformStore ?? new PlatformStore({ database: options.database });
  }

  getStore() {
    return this.platformStore;
  }

  async listBindingsForUser(userId) {
    const normalizedUserId = String(userId ?? "").trim();
    if (!normalizedUserId) {
      return [];
    }
    return listUserTenantBindings(normalizedUserId, { database: this.database });
  }

  async resolveTenantScope(headers = {}, actor = null) {
    const scope = await resolveVerifiedTenantScope(headers, {
      userId: actor?.userId,
      method: actor?.userId ? "session" : undefined,
    });
    const authContext = authContextStorage.getStore();
    const claimSignature =
      scope.verified && (actor?.userId || authContext?.method === "session") && scope.userId
        ? signTenantClaim(scope.userId, scope.tenantId, scope.orgId)
        : undefined;
    return { scope, claimSignature };
  }

  async createTenantBinding(actor, input = {}) {
    const actorUserId = String(actor?.userId ?? "").trim();
    const actorRole = normalizeRole(actor?.role, "user");
    if (!actorUserId) {
      throw new Error("Authenticated session user is required.");
    }

    const targetUserId = String(input.userId ?? actorUserId).trim();
    if (!targetUserId) {
      throw new Error("userId is required.");
    }
    if (actorRole !== "admin" && targetUserId !== actorUserId) {
      throw new Error("Only admin users can bind other users.");
    }

    const tenantId = String(input.tenantId ?? "").trim();
    const orgId = String(input.orgId ?? "").trim();
    if (!tenantId || !orgId) {
      throw new Error("tenantId and orgId are required.");
    }

    const user = await this.database.findUserById(targetUserId);
    if (!user) {
      throw new Error("Target user not found.");
    }

    const org = await this.platformStore.getOrganizationById(orgId);
    if (!org) {
      throw new Error("Organization not found.");
    }
    const targetMemberRole = await this.platformStore.getMemberRole(orgId, targetUserId);
    if (!targetMemberRole) {
      throw new Error("Target user is not an active organization member.");
    }
    const roleId =
      input.roleId !== undefined
        ? normalizeRole(input.roleId, "member")
        : normalizeRole(targetMemberRole, "member");

    await this.ensureHierarchySync({
      tenantId,
      org,
      actorUserId,
      orgType: normalizeOrgType(input.orgType),
      parentOrgId: asString(input.parentOrgId) ?? null,
    });

    const binding = await bindUserToTenant(targetUserId, tenantId, orgId, {
      roleId,
      boundBy: actorUserId,
      database: this.database,
    });

    return {
      binding,
      claimSignature: signTenantClaim(targetUserId, tenantId, orgId),
    };
  }

  async deleteTenantBinding(actor, input = {}) {
    const actorUserId = String(actor?.userId ?? "").trim();
    const actorRole = normalizeRole(actor?.role, "user");
    if (!actorUserId) {
      throw new Error("Authenticated session user is required.");
    }

    const targetUserId = String(input.userId ?? actorUserId).trim();
    if (!targetUserId) {
      throw new Error("userId is required.");
    }
    if (actorRole !== "admin" && targetUserId !== actorUserId) {
      throw new Error("Only admin users can unbind other users.");
    }

    const tenantId = String(input.tenantId ?? "").trim();
    const orgId = String(input.orgId ?? "").trim();
    if (!tenantId || !orgId) {
      throw new Error("tenantId and orgId are required.");
    }

    await unbindUserFromTenant(targetUserId, tenantId, orgId, {
      database: this.database,
    });
    return { unbound: true };
  }

  async createOrganization(actor, input = {}) {
    const actorUserId = String(actor?.userId ?? "").trim();
    if (!actorUserId) {
      throw new Error("Authenticated session user is required.");
    }

    const org = await this.platformStore.createOrganization({
      ownerUserId: actorUserId,
      name: asString(input.name) ?? "New Organization",
      bio: input.bio,
      email: input.email,
      email_is_public: input.email_is_public,
      currency: input.currency,
      address: input.address,
      city: input.city,
      region: input.region,
      postal_code: input.postal_code,
      country: input.country,
      status: "active",
    });
    const tenantId = asString(input.tenantId) ?? `tenant:${org.orgId}`;
    const node = await this.ensureHierarchySync({
      tenantId,
      org,
      actorUserId,
      parentOrgId: asString(input.parentOrgId) ?? null,
      orgType: normalizeOrgType(input.orgType),
    });
    const binding = await bindUserToTenant(actorUserId, tenantId, org.orgId, {
      roleId: "owner",
      boundBy: actorUserId,
      database: this.database,
    });
    return {
      org: toOperationsOrg(org, {
        tenantId,
        parentOrgId: node?.parentOrgId ?? null,
        orgType: node?.orgType ?? "team",
        callerRole: binding.roleId,
        metadata: node?.metadata ?? hierarchyMetadataFromOrg(org),
      }),
      binding,
    };
  }

  async updateOrganization(actor, orgId, input = {}) {
    const actorUserId = String(actor?.userId ?? "").trim();
    if (!actorUserId) {
      throw new Error("Authenticated session user is required.");
    }
    const existing = await this.platformStore.getOrganizationForUser(orgId, actorUserId);
    if (!existing) {
      return null;
    }
    const updated = await this.platformStore.updateOrganizationProfile(orgId, {
      name: input.name,
      bio: input.bio,
      email: input.email,
      email_is_public: input.email_is_public,
      currency: input.currency,
      address: input.address,
      city: input.city,
      region: input.region,
      postal_code: input.postal_code,
      country: input.country,
    });
    if (!updated) {
      return null;
    }

    const binding = await this.findPreferredBinding(actorUserId, orgId);
    const tenantId = asString(binding?.tenantId) ?? `tenant:${orgId}`;
    const node = await this.ensureHierarchySync({
      tenantId,
      org: updated,
      actorUserId,
      parentOrgId: input.parentOrgId !== undefined ? asString(input.parentOrgId) ?? null : undefined,
      orgType: input.orgType !== undefined ? normalizeOrgType(input.orgType) : undefined,
    });

    return toOperationsOrg(updated, {
      tenantId,
      parentOrgId: node?.parentOrgId ?? null,
      orgType: node?.orgType ?? "team",
      callerRole: normalizeRole(binding?.roleId, await this.platformStore.getMemberRole(orgId, actorUserId)),
      metadata: node?.metadata ?? hierarchyMetadataFromOrg(updated),
    });
  }

  async listOrganizationForest(actor, scope) {
    const actorUserId = String(actor?.userId ?? "").trim();
    if (!actorUserId) {
      return [];
    }
    const bindings = await this.listBindingsForUser(actorUserId);
    const scopedTenantId =
      scope?.verified && scope.userId === actorUserId && scope.tenantId ? scope.tenantId : "";
    const tenantIds = scopedTenantId
      ? [scopedTenantId]
      : unique(bindings.map((binding) => String(binding.tenantId ?? "").trim()));
    if (tenantIds.length === 0) {
      return [];
    }

    const forest = [];
    for (const tenantId of tenantIds) {
      const tenantBindings = bindings.filter((binding) => binding.tenantId === tenantId);
      for (const binding of tenantBindings) {
        const org = await this.platformStore.getOrganizationById(binding.orgId);
        if (org) {
          await this.ensureHierarchySync({
            tenantId,
            org,
            actorUserId,
          });
        }
      }
      const tree = await getOrgTree(tenantId, { database: this.database });
      forest.push(...buildForest(tree));
    }
    return forest;
  }

  async getOrganizationDetails(actor, orgId, scope) {
    const context = await this.resolveBoundOrgContext(actor, orgId, scope);
    if (!context) {
      return null;
    }
    return toOperationsOrg(context.org, {
      tenantId: context.tenantId,
      parentOrgId: context.node?.parentOrgId ?? null,
      orgType: context.node?.orgType ?? "team",
      callerRole: context.binding?.roleId ?? context.memberRole ?? "",
      metadata: context.node?.metadata ?? hierarchyMetadataFromOrg(context.org),
    });
  }

  async deactivateOrganization(actor, orgId, scope) {
    const context = await this.resolveBoundOrgContext(actor, orgId, scope);
    if (!context) {
      return null;
    }
    if (String(context.org.ownerUserId) !== String(actor?.userId ?? "")) {
      throw new Error("Only the organization owner can deactivate an organization.");
    }

    const updated = await this.platformStore.deactivateOrganization(orgId);
    if (!updated) {
      return null;
    }
    await deactivateOrg(context.tenantId, orgId, actor.userId, {
      database: this.database,
    });
    await unbindAllUsersFromTenantOrg(context.tenantId, orgId, {
      database: this.database,
    });
    return { orgId, org: updated };
  }

  async listOrganizationLifecycle(actor, orgId, scope) {
    const context = await this.resolveBoundOrgContext(actor, orgId, scope, {
      includeInactive: true,
      requireBinding: false,
    });
    if (!context) {
      return [];
    }
    return getOrgLifecycleEvents(context.tenantId, orgId, {
      database: this.database,
    });
  }

  async ensureHierarchySync({ tenantId, org, actorUserId, parentOrgId, orgType } = {}) {
    if (!tenantId || !org?.orgId) {
      return null;
    }
    const currentNode = await getOrgNode(tenantId, org.orgId, {
      database: this.database,
    });
    await upsertOrgNode(
      {
        tenantId,
        orgId: org.orgId,
        parentOrgId:
          parentOrgId !== undefined ? parentOrgId : (currentNode?.parentOrgId ?? null),
        orgName: org.name,
        orgType: orgType ?? currentNode?.orgType ?? "team",
        status: org.status ?? currentNode?.status ?? "active",
        createdBy: actorUserId ?? org.ownerUserId ?? "system",
        metadata: hierarchyMetadataFromOrg(org),
      },
      { database: this.database }
    );
    return getOrgNode(tenantId, org.orgId, { database: this.database });
  }

  async findPreferredBinding(userId, orgId, scope) {
    const bindings = sortByBoundAtDesc(
      (await this.listBindingsForUser(userId)).filter((binding) => binding.orgId === orgId)
    );
    if (scope?.verified && scope.orgId === orgId) {
      return bindings.find((binding) => binding.tenantId === scope.tenantId) ?? null;
    }
    return bindings[0] ?? null;
  }

  async resolveBoundOrgContext(actor, orgId, scope, options = {}) {
    const actorUserId = String(actor?.userId ?? "").trim();
    const normalizedOrgId = String(orgId ?? "").trim();
    if (!actorUserId || !normalizedOrgId) {
      return null;
    }

    const binding = await this.findPreferredBinding(actorUserId, normalizedOrgId, scope);
    const requireBinding = options.requireBinding !== false;
    const discoveredNode =
      scope?.verified && scope.orgId === normalizedOrgId
        ? null
        : await findOrgNodeByOrgId(normalizedOrgId, {
            database: this.database,
            includeInactive: options.includeInactive === true,
          });
    const tenantId = firstNonEmpty(
      binding?.tenantId,
      scope?.verified && scope.orgId === normalizedOrgId ? scope.tenantId : "",
      discoveredNode?.tenantId,
      `tenant:${normalizedOrgId}`
    );
    if (!binding && requireBinding && !discoveredNode) {
      return null;
    }

    const org = binding
      ? await this.platformStore.getOrganizationById(normalizedOrgId, {
          includeInactive: options.includeInactive === true,
        })
      : await this.platformStore.getOrganizationForUser(normalizedOrgId, actorUserId, {
          includeInactive: options.includeInactive === true,
        });
    if (!org) {
      return null;
    }

    const node =
      tenantId && org.status !== "inactive"
        ? await this.ensureHierarchySync({
            tenantId,
            org,
            actorUserId,
          })
        : (discoveredNode ?? null);
    const memberRole = await this.platformStore.getMemberRole(normalizedOrgId, actorUserId);
    const ownerAccess =
      options.includeInactive === true && String(org.ownerUserId) === actorUserId;
    if (!binding && !memberRole && !ownerAccess) {
      return null;
    }

    return {
      binding,
      memberRole,
      org,
      tenantId,
      node,
    };
  }
}
