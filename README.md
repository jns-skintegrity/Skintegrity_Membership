# Skintegrity Membership

Static Firebase Authentication and Firestore membership portal.

## Access model

- Verified `@skintegritypartners.com` accounts receive the Admin dashboard and clinical-tool shortcuts.
- Other accounts remain on the standard portal. Premium/Full Membership signup is paused until payment and entitlement verification are available.
- New accounts are created with the `free` tier. Users cannot change their own tier or role in Firestore.

## Admin usage data

The Admin dashboard's Data view reads daily aggregate documents from Firestore's `toolUsage` collection. It displays assessment attempts, completed reviews, completion rate, daily trends, and broad outcome categories for the last 30 days. It supports CSV export.

The clinical tools write only daily counters and allowlisted broad categories through authenticated server routes. They do not send assessment answers, patient identifiers, names, or case details to this collection. The collection is read-only to verified company-domain users from the browser; only the server-side tool routes can write it.

Deploy the Firestore rules in `firestore.rules` when deploying this dashboard.
