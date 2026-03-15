import { findRequestSession } from "../auth.js";
import { asString, readJsonBody } from "../helpers.js";
import { database } from "../state.js";
import { GatewayOperationsPlatformService } from "../core/operations-platform-service.js";

let _service;

function getService() {
  if (!_service) {
    _service = new GatewayOperationsPlatformService({ database });
  }
  return _service;
}

async function findSession(c) {
  return findRequestSession(database, c.req.header("cookie"));
}

async function requireSession(c) {
  const session = await findSession(c);
  if (!session) {
    return { error: c.json({ error: "Authentication required." }, 401) };
  }
  return { session };
}

function actorFromSession(session) {
  if (!session?.user?.id) {
    return null;
  }
  return {
    userId: session.user.id,
    role: session.user.role ?? "user",
  };
}

function requestScopeHeaders(c) {
  return {
    tenantId: c.req.header("x-tenant-id"),
    orgId: c.req.header("x-org-id"),
    tenantClaimSignature: c.req.header("x-tenant-claim-signature"),
  };
}

function statusForError(error) {
  const message = String(error?.message ?? error ?? "");
  if (/auth/i.test(message)) return 401;
  if (/Only admin users|Only the organization owner|not an active organization member|not authorized/i.test(message)) {
    return 403;
  }
  if (/not found/i.test(message)) return 404;
  if (/required/i.test(message)) return 400;
  return 400;
}

function jsonError(c, error) {
  const status = statusForError(error);
  return c.json({ error: String(error?.message ?? error ?? "Request failed.") }, status);
}

export function registerOperationsPlatformRoutes(app) {
  app.get("/api/operations/orchestrations/tenant-bindings", async (c) => {
    const session = await findSession(c);
    if (!session?.user?.id) {
      return c.json({ ok: true, bindings: [] });
    }
    const bindings = await getService().listBindingsForUser(session.user.id);
    return c.json({ ok: true, bindings });
  });

  app.post("/api/operations/orchestrations/tenant-bindings", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) {
      return auth.error;
    }
    try {
      const body = await readJsonBody(c);
      const result = await getService().createTenantBinding(actorFromSession(auth.session), {
        userId: body.userId,
        tenantId: body.tenantId,
        orgId: body.orgId,
        roleId: body.roleId,
        parentOrgId: body.parentOrgId,
        orgType: body.orgType,
      });
      return c.json({ ok: true, binding: result.binding, claimSignature: result.claimSignature }, 201);
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.delete("/api/operations/orchestrations/tenant-bindings", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) {
      return auth.error;
    }
    try {
      const body = await readJsonBody(c);
      const result = await getService().deleteTenantBinding(actorFromSession(auth.session), {
        userId: body.userId,
        tenantId: body.tenantId,
        orgId: body.orgId,
      });
      return c.json({ ok: true, unbound: result.unbound === true });
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.get("/api/operations/orchestrations/tenant-scope", async (c) => {
    const session = await findSession(c);
    const { scope, claimSignature } = await getService().resolveTenantScope(
      requestScopeHeaders(c),
      actorFromSession(session)
    );
    const response = { ok: true, scope };
    if (claimSignature) {
      response.claimSignature = claimSignature;
    }
    return c.json(response);
  });

  app.get("/api/operations/orchestrations/org/tree", async (c) => {
    const session = await findSession(c);
    if (!session?.user?.id) {
      return c.json({ ok: true, tree: [] });
    }
    const actor = actorFromSession(session);
    const { scope } = await getService().resolveTenantScope(requestScopeHeaders(c), actor);
    const tree = await getService().listOrganizationForest(actor, scope);
    return c.json({ ok: true, tree });
  });

  app.post("/api/operations/orchestrations/org", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) {
      return auth.error;
    }
    try {
      const body = await readJsonBody(c);
      const result = await getService().createOrganization(actorFromSession(auth.session), {
        name: body.name,
        tenantId: body.tenantId,
        parentOrgId: body.parentOrgId,
        orgType: body.orgType,
        bio: body.bio,
        email: body.email,
        email_is_public: body.email_is_public,
        currency: body.currency,
        address: body.address,
        city: body.city,
        region: body.region,
        postal_code: body.postal_code,
        country: body.country,
      });
      return c.json({ ok: true, org: result.org, binding: result.binding }, 201);
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.get("/api/operations/orchestrations/org/:orgId", async (c) => {
    const session = await findSession(c);
    if (!session?.user?.id) {
      return c.json({ ok: true, org: null });
    }
    const orgId = asString(c.req.param("orgId"));
    if (!orgId) {
      return c.json({ error: "orgId is required." }, 400);
    }
    const actor = actorFromSession(session);
    const { scope } = await getService().resolveTenantScope(requestScopeHeaders(c), actor);
    const org = await getService().getOrganizationDetails(actor, orgId, scope);
    return c.json({ ok: true, org: org ?? null });
  });

  app.delete("/api/operations/orchestrations/org/:orgId", async (c) => {
    const auth = await requireSession(c);
    if (auth.error) {
      return auth.error;
    }
    const orgId = asString(c.req.param("orgId"));
    if (!orgId) {
      return c.json({ error: "orgId is required." }, 400);
    }
    try {
      const actor = actorFromSession(auth.session);
      const { scope } = await getService().resolveTenantScope(requestScopeHeaders(c), actor);
      const result = await getService().deactivateOrganization(actor, orgId, scope);
      if (!result) {
        return c.json({ error: "Organization not found." }, 404);
      }
      return c.json({ ok: true, deactivated: true, orgId: result.orgId });
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.get("/api/operations/orchestrations/org/:orgId/lifecycle", async (c) => {
    const session = await findSession(c);
    if (!session?.user?.id) {
      return c.json({ ok: true, events: [] });
    }
    const orgId = asString(c.req.param("orgId"));
    if (!orgId) {
      return c.json({ error: "orgId is required." }, 400);
    }
    const actor = actorFromSession(session);
    const { scope } = await getService().resolveTenantScope(requestScopeHeaders(c), actor);
    const events = await getService().listOrganizationLifecycle(actor, orgId, scope);
    return c.json({ ok: true, events });
  });
}
