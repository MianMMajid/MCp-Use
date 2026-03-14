import { test, expect } from '@playwright/test';

function json(body, status = 200) {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  };
}

test('creates and activates an agent firewall, schedules a task, runs it now, and deep-links back to the firewall', async ({ page }) => {
  const state = {
    agents: [{ agentId: 'agent-1', id: 'agent-1', name: 'Ops Agent' }],
    orchestrations: [],
    firewalls: [],
    tasks: [],
  };

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method().toUpperCase();
    const body = request.postDataJSON?.() ?? {};

    if (method === 'GET' && path === '/api/agents') {
      return route.fulfill(json({ items: state.agents }));
    }
    if (method === 'GET' && path === '/api/orchestrations') {
      return route.fulfill(json({ items: state.orchestrations }));
    }
    if (method === 'GET' && path === '/api/firewalls') {
      return route.fulfill(json({ ok: true, items: state.firewalls }));
    }
    if (method === 'POST' && path === '/api/firewalls') {
      const firewall = {
        id: 'fw-1',
        name: body.name,
        folder: body.folder || 'root',
        scope: body.scope,
        assignedAgentId: body.assignedAgentId || null,
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
      const task = {
        id: 'task-1',
        title: body.title,
        prompt: body.prompt,
        status: 'scheduled',
        schedule: body.schedule,
        assignment: { type: 'agent', agentId: body.assignment.agentId },
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
  await page.locator('select').first().selectOption('agent');
  await page.locator('select').nth(1).selectOption('agent-1');
  await page.getByPlaceholder(/version: 1/).fill(
    'version: 1\nrules:\n  allowedTools:\n    - status\n  blockedTargetProfiles:\n    - root'
  );
  await page.getByRole('button', { name: 'Activate Firewall' }).click();

  await expect(page.getByRole('heading', { name: 'Ops Agent Firewall' })).toBeVisible();
  await page.getByPlaceholder('Write a new YAML policy revision...').fill(
    'version: 1\nrules:\n  allowedTools:\n    - status\n    - skills\n  blockedTargetProfiles:\n    - root'
  );
  await page.getByRole('button', { name: 'Save Revision' }).click();
  await page.getByRole('button', { name: 'Activate' }).click();
  await expect(page.getByText('Compiled')).toBeVisible();

  await page.goto('/tasks');
  await page.getByPlaceholder('Weekly governance summary').fill('Nightly task');
  await page.getByPlaceholder(/Describe the full task objective/).fill('Generate a nightly status report.');
  await page.locator('select').nth(0).selectOption('agent');
  await page.locator('select').nth(1).selectOption('agent-1');
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

test('switches orgs, manages service-account keys, saves org profile fields, and reloads address/account state', async ({ page }) => {
  const state = {
    user: { email: 'owner@example.com', username: 'owner' },
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
    serviceAccounts: { 'org-2': [] },
    serviceAccountKeys: {},
  };

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method().toUpperCase();
    const body = request.postDataJSON?.() ?? {};

    if (method === 'GET' && path === '/api/org') {
      return route.fulfill(json({ ok: true, items: state.orgs }));
    }
    if (method === 'GET' && path === '/api/user/profile') {
      return route.fulfill(json({ ok: true, user: state.user }));
    }
    if (method === 'POST' && path === '/api/org/org-2/service-accounts') {
      const account = {
        id: 'svc-1',
        name: body.name,
        description: body.description || '',
        createdAt: '2026-03-13T12:20:00.000Z',
        keyCount: 0,
      };
      state.serviceAccounts['org-2'] = [account];
      state.serviceAccountKeys['svc-1'] = [];
      return route.fulfill(json({ ok: true, account }, 201));
    }
    if (method === 'GET' && path === '/api/org/org-2/service-accounts') {
      return route.fulfill(json({ items: state.serviceAccounts['org-2'] || [] }));
    }
    if (method === 'GET' && path === '/api/org/org-2/service-accounts/svc-1/keys') {
      return route.fulfill(json({ items: state.serviceAccountKeys['svc-1'] || [] }));
    }
    if (method === 'POST' && path === '/api/org/org-2/service-accounts/svc-1/keys') {
      const key = { keyId: 'key-1', id: 'key-1' };
      state.serviceAccountKeys['svc-1'] = [key];
      state.serviceAccounts['org-2'][0].keyCount = 1;
      return route.fulfill(json({ ok: true, key }, 201));
    }
    if (method === 'DELETE' && path === '/api/org/org-2/service-accounts/svc-1/keys/key-1') {
      state.serviceAccountKeys['svc-1'] = [];
      state.serviceAccounts['org-2'][0].keyCount = 0;
      return route.fulfill(json({ ok: true }));
    }
    if (method === 'PATCH' && path === '/api/org/org-2') {
      state.orgs[1] = { ...state.orgs[1], ...body };
      return route.fulfill(json({ ok: true, org: state.orgs[1] }));
    }

    return route.fulfill(json({ ok: true }));
  });

  await page.goto('/service-accounts');
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

  await page.goto('/settings/account');
  await page.getByRole('combobox').selectOption('org-2');
  await page.getByLabel('Organization Name').fill('Beta Org Updated');
  await page.getByLabel('Organization Bio').fill('Updated from Playwright.');
  await page.getByLabel('Organization Email').fill('security@beta.example.com');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Settings saved successfully.')).toBeVisible();

  await page.goto('/settings/address');
  await expect(page.getByRole('combobox').first()).toHaveValue('org-2');
  await page.getByLabel('Street Address').fill('77 Firewall Road');
  await page.getByLabel('City').fill('San Francisco');
  await page.getByLabel('Postal Code').fill('94105');
  await page.getByRole('button', { name: 'Save address' }).click();
  await expect(page.getByText('Address saved.')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('combobox').first()).toHaveValue('org-2');
  await expect(page.getByLabel('Street Address')).toHaveValue('77 Firewall Road');

  await page.goto('/settings/account');
  await expect(page.getByRole('combobox').first()).toHaveValue('org-2');
  await expect(page.getByLabel('Organization Name')).toHaveValue('Beta Org Updated');
  await expect(page.getByLabel('Organization Email')).toHaveValue('security@beta.example.com');
});
