# New Found Cafe on Netlify

The original homepage, menu, and account markup and styles are retained. The deployed site uses Netlify Identity for authentication, Netlify Functions for its API, and Netlify Database for persistent profiles and orders. The original Flask application remains available in `Cafe Test` for local use and is not run in production.

Netlify installs the npm dependencies, bundles the browser authentication client using the configured command, publishes `public`, and deploys the API function. Database migrations in `netlify/database/migrations` are applied automatically by the platform. Do not apply them manually.

## Customer accounts

Customers register at `/register`, confirm their email, and log in at `/login`. The homepage handles confirmation, invitation, password recovery, and email-change links. Existing local Flask/SQLite accounts and orders are not migrated into the new service; customers need to register for the deployed site.

Account details and delivery pins are saved at `/account`. Menu prices and coupons are recalculated by the API. Selecting cash, GCash, Maya, or card records the requested payment method; it does not process a payment. Arrange payment directly with the cafe. Delivery requires a saved address and map pin. Order status reflects staff updates, not live courier GPS.

## Staff setup

In the site's Netlify dashboard, open Identity, invite the staff user's email address, and have them accept the invitation. Open that user’s details, add the `admin` role in Roles, and save. If the user already registered, assign the role to that existing user instead. Sign out and sign back in after changing roles.

Staff manage orders at `/admin` or `/admin/orders`. Only a server-controlled Identity admin role grants this access; profile fields cannot grant privileges. The site displays the most recent 200 orders. The former Flask default admin credentials do not apply.

## Editing existing pages or menu data

Install the Python dependencies from `Cafe Test/requirements.txt`, then run `python scripts/export-homepage.py` to refresh the exported pages and the public menu catalogue after editing templates or menu data. The export does not start Flask or access the SQLite database. Commit the resulting public files and catalogue together. The browser client lives in `web/app.js` and is bundled automatically at deploy time.

Run `npm test` and `npm run check` for backend checks. End-to-end email delivery, Identity sign-in, and database persistence must also be verified on the deployed site with a newly confirmed customer and an admin user.
