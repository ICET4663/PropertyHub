# Accounts and roles

PropertyHub uses Supabase Auth for passwords/sessions and `public.profiles` for roles. Database row-level security enforces property access.

## Demo logins

All use password `demo1234` and password sign-in. Their inboxes are fictional, so emailed codes and password resets cannot work for these addresses. The seed script disables the extra email step for these demo profiles.

| Role | Email |
| --- | --- |
| Super Admin | femi@adewaleproperties.ng |
| Manager | grace@adewaleproperties.ng |
| Accountant | accounts@adewaleproperties.ng |
| Caretaker | john.eze@adewaleproperties.ng |
| Tenant | chidinma.okafor@mail.com |

## Create accounts and assign access

- Tenants use **Create an account** on the sign-in screen with their real email. The database creates a tenant profile; after confirmation, sign-in links their existing tenancy by email or creates a pending tenant for review.
- Super Admins use **Users & Permissions > Create user** to create an account, choose its role, and select properties for managers/caretakers. The signup client keeps the administrator signed in. The initial password is never stored in a profile.
- For an existing account, open **All accounts**, refresh the list, and use its menu > **Edit role and access**. Ask the user to sign out and sign back in afterward.
- Roles are Super Admin, Property Manager, Accountant, Caretaker, and Tenant. Only Super Admins may assign roles. Users cannot change their own role through this screen.
- If account creation succeeds but role/property setup fails, refresh All accounts and use Edit role and access to finish setup. Errors remain visible in the dialog.

## Email delivery setup

The connected project requires email confirmation. Real-account creation must be tested with a real inbox; placeholder domains can be rejected by Supabase Auth.

In Supabase Authentication:

1. Configure SMTP for delivery to your users. The default email sender has recipient restrictions and rate limits.
2. Set Site URL and allowed redirect URLs to your app URL (currently `http://localhost:8082` for local web).
3. This UI accepts a six-digit email OTP. Set email OTP length to six and include `{{ .Token }}` in confirmation, sign-in, and password-recovery email templates. Supabase defaults may send links instead of showing a code.

Do not disable confirmation to make fictional inboxes appear to work for real users.

## Verify database access

With `.env.local` configured, run:

```sh
node --env-file=.env.local scripts/verify-access.mjs
```

This checks seeded logins and every table the app loads. It creates and removes a temporary confirmed test account to check the signup profile trigger, blocked self-promotion, admin role assignment, manager property scope, and accountant write restrictions. It does not verify delivery to a real inbox or the browser UI. Keep `SUPABASE_SECRET_KEY` local; it is used only for creating/removing the test fixture.
