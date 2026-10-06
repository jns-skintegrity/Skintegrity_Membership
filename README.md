# Skintegrity Membership

Static Firebase Authentication and Firestore membership portal.

## Access model

- Verified `@skintegritypartners.com` accounts receive Admin access, including the dashboard's aggregate usage view and clinical-tool shortcuts.
- Other accounts remain on the standard portal. Premium/Full Membership signup is paused until payment and entitlement verification are available.
- New accounts are created with the `free` tier. Users cannot change their own tier or role in Firestore.
- The dashboard reads `membershipTier`, `tier`, or `role` from the user's Firestore profile. Premium/member profiles and verified company-domain Admins can launch the clinical tools; Free profiles see an upgrade prompt on the main workflow buttons. Only verified company-domain Admins can open the Data view.
- Dashboard appearance cycles through dark, light, and console themes; the selected theme is saved in browser local storage.

## Admin usage data

The Admin dashboard's Data view reads daily aggregate documents from Firestore's `toolUsage` collection. It displays assessment attempts, completed reviews, completion rate, daily trends, and broad outcome categories for the last 30 days. It supports CSV export.

## Personal recent results

The Results Summary reads each signed-in user's last five completed uses per tool from `users/{uid}/toolHistory/{tool}`. Each entry contains only a completion timestamp and an allowlisted broad result category. Assessment answers, free text, patient identifiers, names, and case details are not stored. Only the authenticated owner can read their history; the server-side clinical tool routes write it.

The separate `toolUsage` collection remains aggregate-only and read-only to verified company-domain users from the browser.

Deploy the Firestore rules in `firestore.rules` when deploying this dashboard.
