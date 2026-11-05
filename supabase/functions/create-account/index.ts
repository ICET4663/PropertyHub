// POST { name, email, phone?, password, role, access?, propertyIds?, tenantId? } with a staff session → { id }.
//
// Creates a sign-in that works straight away (email already confirmed), so the person who created it can
// share the email and temporary password by WhatsApp or email. Public sign-up is closed in the app.
//   Super Admin       any role; may link a tenant login to any tenant record.
//   Property manager  tenant logins only, and only for a tenant record on a property they manage.
// Deploy: npx supabase functions deploy create-account --no-verify-jwt   (it checks the session itself)
import { admin, caller, json, cors } from '../_shared/paystack.ts';

const ROLES = ['super_admin', 'manager', 'accountant', 'caretaker', 'tenant'] as const;
type Role = (typeof ROLES)[number];

function strongEnough(p: string) {
  return p.length >= 8 && /\d/.test(p) && /[^A-Za-z0-9]/.test(p) && /[A-Za-z]/.test(p);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  try {
    const user = await caller(req);
    if (!user) return json({ error: 'Sign in again to create accounts.' }, 401);
    const db = admin();

    const { data: me } = await db.from('profiles').select('id, role, status').eq('id', user.id).single();
    if (!me || me.status === 'suspended' || (me.role !== 'super_admin' && me.role !== 'manager')) {
      return json({ error: 'Only a Super Admin or property manager can create accounts.' }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const name = String(body.name ?? '').trim();
    const email = String(body.email ?? '').trim().toLowerCase();
    const phone = String(body.phone ?? '').trim();
    const password = String(body.password ?? '');
    const role = String(body.role ?? '') as Role;
    const tenantId = body.tenantId ? String(body.tenantId) : null;
    const propertyIds: string[] = Array.isArray(body.propertyIds) ? body.propertyIds.map(String) : [];
    let access = String(body.access ?? '').trim();

    if (!name) return json({ error: 'Enter a full name.' }, 400);
    if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: 'Enter a valid email address.' }, 400);
    if (!strongEnough(password)) return json({ error: 'The password needs at least 8 characters with a letter, a number and a symbol.' }, 400);
    if (!ROLES.includes(role)) return json({ error: 'Choose a role.' }, 400);

    if (me.role === 'manager') {
      if (role !== 'tenant') return json({ error: 'Property managers can only create tenant accounts.' }, 403);
      if (!tenantId) return json({ error: 'Choose the tenant this login is for.' }, 400);
    }

    if (tenantId) {
      if (role !== 'tenant') return json({ error: 'Only tenant accounts can be linked to a tenancy.' }, 400);
      const { data: t } = await db.from('tenants').select('id, property_id').eq('id', tenantId).single();
      if (!t) return json({ error: 'That tenant record was not found.' }, 404);
      if (me.role === 'manager') {
        const { data: link } = await db.from('profile_properties').select('property_id')
          .eq('profile_id', me.id).eq('property_id', t.property_id ?? '').maybeSingle();
        if (!link) return json({ error: 'You can only create logins for tenants on properties you manage.' }, 403);
      }
      const { data: taken } = await db.from('profiles').select('id').eq('tenant_id', tenantId).maybeSingle();
      if (taken) return json({ error: 'This tenant already has a login. Use Reset password instead.' }, 409);
    }

    const { data: created, error } = await db.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { name, phone },
    });
    if (error || !created.user) {
      const msg = error?.message ?? 'Could not create the account.';
      return json({ error: /already|registered|exists/i.test(msg) ? 'This email already has an account. Use Reset password, or edit its role from All accounts.' : msg }, 400);
    }
    const id = created.user.id;

    try {
      // The sign-up trigger has made a tenant profile; set the real role, access and tenancy.
      if (!access) access = role === 'tenant' ? 'Own tenancy' : role === 'super_admin' ? 'All locations' : role === 'accountant' ? 'All locations, read only' : 'None yet';
      const patch: Record<string, unknown> = { name, role, access, status: 'active' };
      if (phone) patch.phone = phone;
      if (tenantId) patch.tenant_id = tenantId;
      const { error: pErr } = await db.from('profiles').update(patch).eq('id', id);
      if (pErr) throw pErr;
      if (propertyIds.length && (role === 'manager' || role === 'caretaker')) {
        const { error: lErr } = await db.from('profile_properties').insert(propertyIds.map((property_id) => ({ profile_id: id, property_id })));
        if (lErr) throw lErr;
      }
      if (tenantId) await db.from('tenants').update({ email }).eq('id', tenantId).eq('email', '');
    } catch (e) {
      // Don't leave a half-made login that nobody can use.
      await db.auth.admin.deleteUser(id).catch(() => undefined);
      throw e;
    }
    return json({ id });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String((e as { message?: string }).message ?? e) }, 500);
  }
});
