import { test, expect } from '@playwright/test';

function json(body, status = 200) {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  };
}

function resolvedBaseUrl() {
  return String(test.info().project.use.baseURL || 'http://127.0.0.1:4173');
}

async function authenticate(page) {
  await page.context().addCookies([
    { name: 'maple_session', value: 'playwright-session', url: resolvedBaseUrl() },
  ]);
}

function selectForLabel(page, label) {
  return page.locator(`xpath=//label[./span[normalize-space()="${label}"]]//select`);
}

test('creates and activates a firewall, schedules a task, runs it now, and deep-links back to the firewall', async ({ page }) => {
  const state = {
    agents: [{ agentId: 'agent-1', id: 'agent-1', name: 'Ops Agent' }],
    orchestrations: [{ id: 'orch-1', name: 'Ops Flow' }],
    firewalls: [],
    tasks: [],
  };

  await authenticate(page);

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method().toUpperCase();
    const body = request.postDataJSON?.() ?? {};

    if (method === 'GET' && path === '/api/auth/me') {
      return route.fulfill(json({ user: { id: 'user-1', email: 'owner@example.com' } }));
    }
    if (method === 'GET' && path === '/api/agents') {
      return route.fulfill(json({ items: state.agents }));
    }
    if (method === 'GET' && path === '/api/orchestrations') {
      return route.fulfill(json({ items: state.orchestrations }));
    }
    if (method === 'GET' && path === '/api/firewalls') {
      return route.fulfill(json({ ok: true, items: state.firewalls }));
    }
    if (method === 'POST' && path === '/api/firewalls/preview') {
      return route.fulfill(json({ ok: true, valid: true, errors: [], warnings: [], ruleCount: 2, compiledAt: '2026-03-13T12:00:00.000Z' }));
    }
    if (method === 'POST' && path === '/api/firewalls') {
      const firewall = {
        id: 'fw-1',
        name: body.name,
        folder: body.folder || 'root',
        scope: body.scope,
        assignedAgentId: body.assignedAgentId || null,
        description: body.description || '',
        enforcementLevel: body.enforcementLevel || 'hard-mandatory',
        policyText: body.policyText,
        archived: false,
        status: 'monitoring',
        createdAt: '2026-03-13T12:00:00.000Z',
        policyVersions: [
          {
            id: 'fwv-1',
            timestamp: '2026-03-13T12:00:00.000Z',
            text: body.policyText,
            actor: 'playwright',
            active: true,
            compiled: true,
            compileErrors: [],
            compileWarnings: [],
          },
        ],
        entries: [],
        auditLog: [],
        blockedPackets: [],
      };
      state.firewalls = [firewall];
      return route.fulfill(json({ ok: true, firewall }));
    }
    if (method === 'POST' && path === '/api/firewalls/fw-1/versions') {
      const version = {
        id: 'fwv-2',
        timestamp: '2026-03-13T12:05:00.000Z',
        text: body.policyText,
        actor: 'playwright',
        active: false,
        compiled: true,
        compileErrors: [],
        compileWarnings: [],
      };
      state.firewalls[0].policyVersions.unshift(version);
      return route.fulfill(json({ ok: true, version }, 201));
    }
    if (method === 'POST' && path === '/api/firewalls/fw-1/versions/fwv-2/activate') {
      state.firewalls[0].policyVersions = state.firewalls[0].policyVersions.map((version) => ({
        ...version,
        active: version.id === 'fwv-2',
      }));
      state.firewalls[0].policyText = state.firewalls[0].policyVersions.find((item) => item.active)?.text || '';
      state.firewalls[0].auditLog = [
        { message: 'Firewall version activated.', timestamp: '2026-03-13T12:05:00.000Z', level: 'safe' },
      ];
      return route.fulfill(json({ ok: true, firewall: state.firewalls[0] }));
    }
    if (method === 'GET' && path === '/api/tasks') {
      return route.fulfill(json({ ok: true, items: state.tasks }));
    }
    if (method === 'POST' && path === '/api/tasks') {
      const assignment = body.assignment?.agentId
        ? { type: 'agent', agentId: body.assignment.agentId }
        : { type: 'orchestration', orchestrationId: body.assignment?.orchestrationId || 'orch-1' };
      const task = {
        id: 'task-1',
        title: body.title,
        prompt: body.prompt,
        status: 'scheduled',
        schedule: body.schedule,
        assignment,
        createdAt: '2026-03-13T12:10:00.000Z',
        updatedAt: '2026-03-13T12:10:00.000Z',
        lastRunAt: null,
        nextRunAt: body.schedule.startAt,
      };
      state.tasks = [task];
      return route.fulfill(json({ ok: true, task }, 201));
    }
    if (method === 'POST' && path === '/api/tasks/task-1/run-now') {
      state.tasks[0] = {
        ...state.tasks[0],
        status: 'scheduled',
        lastRunAt: '2026-03-13T12:11:00.000Z',
        nextRunAt: '2026-03-13T13:11:00.000Z',
        updatedAt: '2026-03-13T12:11:00.000Z',
      };
      return route.fulfill(json({ ok: true, task: state.tasks[0] }));
    }

    return route.fulfill(json({ ok: true }));
  });

  await page.goto('/firewalls');
  await page.getByPlaceholder('Payroll Policy').fill('Ops Agent Firewall');
  await page.getByPlaceholder('Finance').fill('Operations');
  await page.getByRole('button', { name: 'Next: Define Policy' }).click();
  await page.getByPlaceholder(/version: 1/).fill(
    'version: 1\nrules:\n  allowedTools:\n    - status\n  blockedTargetProfiles:\n    - root'
  );
  await page.getByRole('button', { name: 'Next: Review' }).click();
  await page.getByRole('button', { name: 'Deploy Firewall' }).click();

  await expect(page.getByRole('heading', { name: 'Ops Agent Firewall' })).toBeVisible();
  await page.getByRole('button', { name: 'Versions' }).click();
  await page.getByPlaceholder('Write a new YAML policy revision...').fill(
    'version: 1\nrules:\n  allowedTools:\n    - status\n    - skills\n  blockedTargetProfiles:\n    - root'
  );
  await page.getByRole('button', { name: 'Save Revision' }).click();
  await page.locator('.version-list').getByRole('button', { name: 'Activate' }).click();
  await expect(page.locator('.version-list').getByText('Compiled').first()).toBeVisible();

  await page.goto('/tasks');
  await page.getByPlaceholder('Weekly governance summary').fill('Nightly task');
  await page.getByPlaceholder(/Describe the full task objective/).fill('Generate a nightly status report.');
  await page.getByRole('button', { name: 'Schedule Task' }).click();

  await expect(page.getByText('Nightly task')).toBeVisible();
  await page.getByRole('button', { name: '⋯' }).click();
  await page.getByRole('button', { name: 'Run Now' }).click();
  await expect(page.getByText(/Next run in/)).toBeVisible();
  await expect(page.getByText('🛡 Firewall')).toBeVisible();

  await page.getByRole('button', { name: '🛡 Firewall' }).click();
  await expect(page).toHaveURL(/\/firewalls\?firewallId=fw-1/);
  await expect(page.getByRole('heading', { name: 'Ops Agent Firewall' })).toBeVisible();
});

test('switches orgs, manages service-account keys, follows the unified settings redirect, and saves notification preferences', async ({ page }) => {
  const state = {
    user: { email: 'owner@example.com', username: 'owner', createdAt: '2026-03-01T12:00:00.000Z' },
    subscription: { plan: 'Pro' },
    usage: { runs: 12, toolExecutions: 48, modelTokens: 2048 },
    orgs: [
      {
        orgId: 'org-1',
        name: 'Alpha Org',
        bio: '',
        email: 'alpha@example.com',
        email_is_public: true,
        currency: 'usd',
        address: '1 Alpha Way',
        city: 'Seattle',
        region: 'Washington',
        postal_code: '98101',
        country: 'United States',
      },
      {
        orgId: 'org-2',
        name: 'Beta Org',
        bio: '',
        email: 'beta@example.com',
        email_is_public: false,
        currency: 'usd',
        address: '2 Beta Way',
        city: 'Portland',
        region: 'Oregon',
        postal_code: '97201',
        country: 'United States',
      },
    ],
    notifications: {
      categories: {
        approvals: false,
        escalations: false,
        run_failures: true,
        system_alerts: false,
      },
      channels: {
        email: false,
        inApp: true,
      },
    },
    apiKeys: [],
    serviceAccounts: { 'org-1': [], 'org-2': [] },
    serviceAccountKeys: {},
  };

  await authenticate(page);

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method().toUpperCase();
    const body = request.postDataJSON?.() ?? {};

    if (method === 'GET' && path === '/api/auth/me') {
      return route.fulfill(json({ user: { id: 'user-1', email: state.user.email } }));
    }
    if (method === 'GET' && path === '/api/org') {
      return route.fulfill(json({ ok: true, items: state.orgs }));
    }
    if (method === 'GET' && path === '/api/user/profile') {
      return route.fulfill(json({ ok: true, user: state.user, subscription: state.subscription }));
    }
    if (method === 'GET' && path === '/api/usage/summary') {
      return route.fulfill(json({ summary: state.usage }));
    }
    if (method === 'GET' && path === '/api/user/api-keys') {
      return route.fulfill(json({ items: state.apiKeys }));
    }
    if (method === 'GET' && path === '/api/notifications/preferences') {
      return route.fulfill(json(state.notifications));
    }
    if (method === 'POST' && path === '/api/notifications/preferences') {
      state.notifications = {
        categories: { ...body.categories },
        channels: { ...body.channels },
      };
      return route.fulfill(json({ ok: true }));
    }
    const orgAccountsMatch = path.match(/^\/api\/org\/([^/]+)\/service-accounts$/);
    if (method === 'POST' && orgAccountsMatch) {
      const orgId = orgAccountsMatch[1];
      const account = {
        id: 'svc-1',
        name: body.name,
        description: body.description || '',
        createdAt: '2026-03-13T12:20:00.000Z',
        keyCount: 0,
      };
      state.serviceAccounts[orgId] = [account];
      state.serviceAccountKeys['svc-1'] = [];
      return route.fulfill(json({ ok: true, account }, 201));
    }
    if (method === 'GET' && orgAccountsMatch) {
      return route.fulfill(json({ items: state.serviceAccounts[orgAccountsMatch[1]] || [] }));
    }
    const keyListMatch = path.match(/^\/api\/org\/([^/]+)\/service-accounts\/([^/]+)\/keys$/);
    if (method === 'GET' && keyListMatch) {
      return route.fulfill(json({ items: state.serviceAccountKeys[keyListMatch[2]] || [] }));
    }
    if (method === 'POST' && keyListMatch) {
      const [, orgId, accountId] = keyListMatch;
      const key = { keyId: 'key-1', id: 'key-1' };
      state.serviceAccountKeys[accountId] = [key];
      state.serviceAccounts[orgId][0].keyCount = 1;
      return route.fulfill(json({ ok: true, key }, 201));
    }
    const deleteKeyMatch = path.match(/^\/api\/org\/([^/]+)\/service-accounts\/([^/]+)\/keys\/([^/]+)$/);
    if (method === 'DELETE' && deleteKeyMatch) {
      const [, orgId, accountId] = deleteKeyMatch;
      state.serviceAccountKeys[accountId] = [];
      state.serviceAccounts[orgId][0].keyCount = 0;
      return route.fulfill(json({ ok: true }));
    }

    return route.fulfill(json({ ok: true }));
  });

  await page.goto('/service-accounts');
  await expect(page.getByRole('heading', { name: 'Service Accounts' })).toBeVisible();
  await expect(page.getByRole('combobox')).toHaveValue('org-1');
  await page.getByRole('combobox').selectOption('org-2');
  await page.getByRole('button', { name: 'New Service Account' }).click();
  await page.getByPlaceholder('Name').fill('Deploy Bot');
  await page.getByPlaceholder('Description').fill('Release automation');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByText('Deploy Bot')).toBeVisible();

  await page.getByRole('button', { name: 'Manage Keys' }).click();
  await page.getByRole('button', { name: 'Generate Key' }).click();
  await expect(page.getByText('key-1')).toBeVisible();
  await page.getByRole('button', { name: 'Revoke' }).click();
  await expect(page.getByText('No keys found.')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('combobox')).toHaveValue('org-2');
  await expect(page.getByText('Deploy Bot')).toBeVisible();

  await page.goto('/settings/account');
  await page.waitForURL(/\/profile\?tab=account/);
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
  await expect(page.locator('header').getByText('owner@example.com')).toBeVisible();

  await page.getByRole('button', { name: 'Notifications' }).click();
  await expect(page.getByRole('heading', { name: 'Notification Preferences' })).toBeVisible();
  await page.locator('label:has-text("Approvals") input[type="checkbox"]').check();
  await page.locator('label:has-text("Email") input[type="checkbox"]').check();
  await page.getByRole('button', { name: 'Save Preferences' }).click();
  await expect.poll(() => state.notifications.categories.approvals).toBe(true);
  await expect.poll(() => state.notifications.channels.email).toBe(true);

  await page.goto('/profile?tab=notifications');
  await expect(page.locator('label:has-text("Approvals") input[type="checkbox"]')).toBeChecked();
  await expect(page.locator('label:has-text("Email") input[type="checkbox"]')).toBeChecked();
});
