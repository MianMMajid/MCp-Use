import { describe, it, expect, vi, afterEach } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

// Mock SvelteKit modules
vi.mock('$app/navigation', () => ({
  goto: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/lib/api', () => ({
  invalidateCache: vi.fn(),
}));

import AuthForm from './AuthForm.svelte';
import { goto } from '$app/navigation';
import { invalidateCache } from '@/lib/api';

let instance;

function mountForm(props = {}) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  instance = mount(AuthForm, { target, props: { mode: 'login', ...props } });
  return target;
}

afterEach(() => {
  if (instance) { unmount(instance); instance = null; }
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('AuthForm', () => {
  // ─── Field visibility per mode ───

  describe('field visibility per mode', () => {
    it('login: shows email + password, no name', () => {
      const el = mountForm({ mode: 'login' });
      expect(el.querySelector('#auth-email')).toBeTruthy();
      expect(el.querySelector('#auth-password')).toBeTruthy();
      expect(el.querySelector('#auth-name')).toBeNull();
    });

    it('register: shows name + email + password', () => {
      const el = mountForm({ mode: 'register' });
      expect(el.querySelector('#auth-name')).toBeTruthy();
      expect(el.querySelector('#auth-email')).toBeTruthy();
      expect(el.querySelector('#auth-password')).toBeTruthy();
    });

    it('forgot: shows email only, no password', () => {
      const el = mountForm({ mode: 'forgot' });
      expect(el.querySelector('#auth-email')).toBeTruthy();
      expect(el.querySelector('#auth-password')).toBeNull();
    });

    it('reset: shows password only, no email', () => {
      const el = mountForm({ mode: 'reset', token: 'abc123' });
      expect(el.querySelector('#auth-email')).toBeNull();
      expect(el.querySelector('#auth-password')).toBeTruthy();
    });

    it('verify: shows no email and no password fields', () => {
      const el = mountForm({ mode: 'verify', token: 'abc123' });
      expect(el.querySelector('#auth-email')).toBeNull();
      expect(el.querySelector('#auth-password')).toBeNull();
    });
  });

  // ─── Titles and button labels ───

  describe('titles and button labels', () => {
    const cases = [
      ['login', 'Sign in', 'Sign in'],
      ['register', 'Create account', 'Create account'],
      ['forgot', 'Reset your password', 'Send reset link'],
      ['reset', 'Set new password', 'Update password'],
      ['verify', 'Verify email', 'Verify email'],
    ];

    for (const [mode, title, btnLabel] of cases) {
      it(`${mode}: title="${title}", button="${btnLabel}"`, () => {
        const el = mountForm({ mode, token: mode === 'reset' || mode === 'verify' ? 'tok' : '' });
        expect(el.querySelector('h1').textContent).toBe(title);
        expect(el.querySelector('.submit-btn').textContent.trim()).toBe(btnLabel);
      });
    }
  });

  // ─── Accessibility: labels, autocomplete, ARIA ───

  describe('accessibility', () => {
    it('login email: label for="auth-email", autocomplete="username"', () => {
      const el = mountForm({ mode: 'login' });
      expect(el.querySelector('label[for="auth-email"]').textContent.trim()).toBe('Email address');
      expect(el.querySelector('#auth-email').getAttribute('autocomplete')).toBe('username');
    });

    it('login password: autocomplete="current-password"', () => {
      const el = mountForm({ mode: 'login' });
      expect(el.querySelector('#auth-password').getAttribute('autocomplete')).toBe('current-password');
    });

    it('register email: autocomplete="email"', () => {
      const el = mountForm({ mode: 'register' });
      expect(el.querySelector('#auth-email').getAttribute('autocomplete')).toBe('email');
    });

    it('register password: autocomplete="new-password", minlength=8', () => {
      const el = mountForm({ mode: 'register' });
      const pw = el.querySelector('#auth-password');
      expect(pw.getAttribute('autocomplete')).toBe('new-password');
      expect(pw.getAttribute('minlength')).toBe('8');
    });

    it('register name: autocomplete="name"', () => {
      const el = mountForm({ mode: 'register' });
      expect(el.querySelector('#auth-name').getAttribute('autocomplete')).toBe('name');
    });

    it('reset password: autocomplete="new-password", label "New password", minlength=8', () => {
      const el = mountForm({ mode: 'reset', token: 'tok' });
      const pw = el.querySelector('#auth-password');
      expect(pw.getAttribute('autocomplete')).toBe('new-password');
      expect(pw.getAttribute('minlength')).toBe('8');
      expect(el.querySelector('label[for="auth-password"]').textContent.trim()).toBe('New password');
    });

    it('password toggle has aria-label', () => {
      const el = mountForm({ mode: 'login' });
      const toggle = el.querySelector('.toggle-pw');
      expect(toggle.getAttribute('aria-label')).toBe('Show password');
    });

    it('all required inputs have .field class (min-height 44px)', () => {
      const el = mountForm({ mode: 'register' });
      for (const input of el.querySelectorAll('input[required]')) {
        expect(input.classList.contains('field')).toBe(true);
      }
    });

    it('error messages use role="alert" aria-live="assertive"', () => {
      const el = mountForm({ mode: 'reset', token: '' });
      const alert = el.querySelector('[role="alert"]');
      expect(alert).toBeTruthy();
      expect(alert.getAttribute('aria-live')).toBe('assertive');
    });
  });

  // ─── Password toggle ───

  describe('password toggle', () => {
    it('toggles password input type between password and text', () => {
      const el = mountForm({ mode: 'login' });
      const input = el.querySelector('#auth-password');
      const toggle = el.querySelector('.toggle-pw');
      expect(input.type).toBe('password');

      toggle.click();
      flushSync();
      expect(input.type).toBe('text');

      toggle.click();
      flushSync();
      expect(input.type).toBe('password');
    });

    it('toggle aria-label updates on click', () => {
      const el = mountForm({ mode: 'login' });
      const toggle = el.querySelector('.toggle-pw');
      expect(toggle.getAttribute('aria-label')).toBe('Show password');

      toggle.click();
      flushSync();
      expect(toggle.getAttribute('aria-label')).toBe('Hide password');
    });
  });

  // ─── Token validation ───

  describe('token handling', () => {
    it('reset without token: error shown, submit disabled', () => {
      const el = mountForm({ mode: 'reset', token: '' });
      expect(el.querySelector('[role="alert"]').textContent).toContain('Invalid or missing link');
      expect(el.querySelector('.submit-btn').disabled).toBe(true);
    });

    it('verify without token: error shown, submit disabled', () => {
      const el = mountForm({ mode: 'verify', token: '' });
      expect(el.querySelector('[role="alert"]').textContent).toContain('Invalid or missing link');
      expect(el.querySelector('.submit-btn').disabled).toBe(true);
    });

    it('reset with token: no error, submit enabled', () => {
      const el = mountForm({ mode: 'reset', token: 'valid-token' });
      expect(el.querySelector('[role="alert"]')).toBeNull();
      expect(el.querySelector('.submit-btn').disabled).toBe(false);
    });

    it('verify with token: no error, submit enabled', () => {
      const el = mountForm({ mode: 'verify', token: 'valid-token' });
      expect(el.querySelector('[role="alert"]')).toBeNull();
      expect(el.querySelector('.submit-btn').disabled).toBe(false);
    });
  });

  // ─── Navigation links ───

  describe('navigation links', () => {
    it('login: links to /register and /forgot-password', () => {
      const el = mountForm({ mode: 'login' });
      const hrefs = [...el.querySelectorAll('a')].map((a) => a.getAttribute('href'));
      expect(hrefs).toContain('/register');
      expect(hrefs).toContain('/forgot-password');
    });

    it('register: links to /login', () => {
      const el = mountForm({ mode: 'register' });
      const hrefs = [...el.querySelectorAll('.nav-links a')].map((a) => a.getAttribute('href'));
      expect(hrefs).toContain('/login');
    });

    it('forgot: links to /login', () => {
      const el = mountForm({ mode: 'forgot' });
      const hrefs = [...el.querySelectorAll('.nav-links a')].map((a) => a.getAttribute('href'));
      expect(hrefs).toContain('/login');
    });

    it('reset: links to /login', () => {
      const el = mountForm({ mode: 'reset', token: 'tok' });
      const hrefs = [...el.querySelectorAll('.nav-links a')].map((a) => a.getAttribute('href'));
      expect(hrefs).toContain('/login');
    });

    it('verify: links to /login', () => {
      const el = mountForm({ mode: 'verify', token: 'tok' });
      const hrefs = [...el.querySelectorAll('.nav-links a')].map((a) => a.getAttribute('href'));
      expect(hrefs).toContain('/login');
    });
  });

  // ─── Forgot password link in login mode ───

  describe('forgot password link', () => {
    it('login: has forgot-password link', () => {
      const el = mountForm({ mode: 'login' });
      const link = el.querySelector('.forgot-link');
      expect(link.getAttribute('href')).toBe('/forgot-password');
      expect(link.textContent).toContain('Forgot password');
    });

    it('register: no forgot-password link', () => {
      const el = mountForm({ mode: 'register' });
      expect(el.querySelector('.forgot-link')).toBeNull();
    });
  });

  // ─── Branding ───

  describe('branding', () => {
    it('renders MaypleCharacter mascot SVG', () => {
      const el = mountForm({ mode: 'login' });
      expect(el.querySelector('.mayple-char')).toBeTruthy();
    });
  });

  // ─── Submit payloads (via fetch spy) ───

  describe('submit payloads', () => {
    let fetchSpy;

    function mockFetch(status = 200, body = { ok: true, authenticated: true }) {
      fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
      );
    }

    function setInput(el, selector, value) {
      const input = el.querySelector(selector);
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    async function submitAndWait(el) {
      el.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled());
      return JSON.parse(fetchSpy.mock.calls[0][1].body);
    }

    it('login → POST /api/auth/login with { username, email, password }', async () => {
      mockFetch();
      const el = mountForm({ mode: 'login' });
      setInput(el, '#auth-email', 'user@test.com');
      setInput(el, '#auth-password', 'secret123');

      const body = await submitAndWait(el);
      expect(fetchSpy.mock.calls[0][0]).toBe('/api/auth/login');
      expect(body).toEqual({ username: 'user@test.com', email: 'user@test.com', password: 'secret123' });
    });

    it('register → POST /api/auth/register with { username, email, password, name }', async () => {
      mockFetch();
      const el = mountForm({ mode: 'register' });
      setInput(el, '#auth-name', 'Test User');
      setInput(el, '#auth-email', 'new@test.com');
      setInput(el, '#auth-password', 'Pass1234!');

      const body = await submitAndWait(el);
      expect(fetchSpy.mock.calls[0][0]).toBe('/api/auth/register');
      expect(body).toEqual({ username: 'new@test.com', email: 'new@test.com', password: 'Pass1234!', name: 'Test User' });
    });

    it('forgot → POST /api/auth/forgot-password with { email } only', async () => {
      mockFetch();
      const el = mountForm({ mode: 'forgot' });
      setInput(el, '#auth-email', 'forgot@test.com');

      const body = await submitAndWait(el);
      expect(fetchSpy.mock.calls[0][0]).toBe('/api/auth/forgot-password');
      expect(body).toEqual({ email: 'forgot@test.com' });
    });

    it('reset → POST /api/auth/reset-password with { token, newPassword }', async () => {
      mockFetch();
      const el = mountForm({ mode: 'reset', token: 'reset-token-xyz' });
      setInput(el, '#auth-password', 'NewPass1!');

      const body = await submitAndWait(el);
      expect(fetchSpy.mock.calls[0][0]).toBe('/api/auth/reset-password');
      expect(body).toEqual({ token: 'reset-token-xyz', newPassword: 'NewPass1!' });
    });

    it('verify → POST /api/auth/verify-email/confirm with { token }', async () => {
      mockFetch();
      const el = mountForm({ mode: 'verify', token: 'verify-token-abc' });

      const body = await submitAndWait(el);
      expect(fetchSpy.mock.calls[0][0]).toBe('/api/auth/verify-email/confirm');
      expect(body).toEqual({ token: 'verify-token-abc' });
    });
  });

  // ─── Error messages per HTTP status ───

  describe('error handling per status code', () => {
    function mockFetchError(status, body = {}) {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
      );
    }

    async function submitAndGetError(el) {
      el.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await vi.waitFor(() => {
        const alert = el.querySelector('.error-msg');
        expect(alert).toBeTruthy();
      }, { timeout: 2000 });
      return el.querySelector('.error-msg').textContent;
    }

    it('401 → "Invalid email or password."', async () => {
      mockFetchError(401);
      const el = mountForm({ mode: 'login' });
      expect(await submitAndGetError(el)).toContain('Invalid email or password');
    });

    it('409 → "Account already exists"', async () => {
      mockFetchError(409);
      const el = mountForm({ mode: 'register' });
      expect(await submitAndGetError(el)).toContain('already exists');
    });

    it('429 → "Too many attempts"', async () => {
      mockFetchError(429);
      const el = mountForm({ mode: 'login' });
      expect(await submitAndGetError(el)).toContain('Too many attempts');
    });

    it('410 → "link has expired"', async () => {
      mockFetchError(410);
      const el = mountForm({ mode: 'reset', token: 'expired-tok' });
      el.querySelector('#auth-password').value = 'NewPass1!';
      el.querySelector('#auth-password').dispatchEvent(new Event('input', { bubbles: true }));
      expect(await submitAndGetError(el)).toContain('expired');
    });
  });

  // ─── Success flows ───

  describe('success flows', () => {
    it('login success → invalidateCache + goto("/")', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ ok: true, authenticated: true }), { status: 200 })
      );
      const el = mountForm({ mode: 'login' });
      el.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

      await vi.waitFor(() => expect(goto).toHaveBeenCalled());
      expect(invalidateCache).toHaveBeenCalled();
      expect(goto).toHaveBeenCalledWith('/');
    });

    it('forgot success → shows "Reset link sent"', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 })
      );
      const el = mountForm({ mode: 'forgot' });
      el.querySelector('#auth-email').value = 'test@test.com';
      el.querySelector('#auth-email').dispatchEvent(new Event('input', { bubbles: true }));
      el.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

      await vi.waitFor(() => {
        expect(el.querySelector('.success-msg')).toBeTruthy();
      }, { timeout: 2000 });
      expect(el.querySelector('.success-msg').textContent).toContain('Reset link sent');
    });

    it('reset success → shows "Password updated"', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 })
      );
      const el = mountForm({ mode: 'reset', token: 'good-tok' });
      el.querySelector('#auth-password').value = 'NewSecure1!';
      el.querySelector('#auth-password').dispatchEvent(new Event('input', { bubbles: true }));
      el.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

      await vi.waitFor(() => {
        expect(el.querySelector('.success-msg')).toBeTruthy();
      }, { timeout: 2000 });
      expect(el.querySelector('.success-msg').textContent).toContain('Password updated');
    });
  });
});
