# JR PRINTLAB

JR PRINTLAB is an event photo and video marketplace built with React, Vite, Tailwind CSS and Supabase.

## Local development

1. Run `npm install`.
2. Copy `.env.example` to `.env` and set the Supabase project URL and publishable key.
3. Run `npm run dev`. Use the local URL printed by Vite.
4. Run `npm run lint` and `npm run build` to check changes.

The public storefront uses a sample catalog. The cart and checkout preview accept sample media only. Sign-in and registration connect to the Supabase project configured in `.env`.

## Owner dashboard

The protected Supabase app metadata role super_admin opens the Owner Dashboard at /owner/dashboard. The owner creates and edits events, uploads priced originals, and views the Media Library and audit log. Existing private event and upload records are available to the owner.

## Release scope

Private R2 uploads, verified previews, manual QR payment review, entitlements, downloads, commissions, payouts, and production deployment are tracked in the [project plan](docs/JR_PRINTLAB_PROJECT_PLAN_UPDATED.md).

## Private R2 uploads

The owner can open **Owner Dashboard → Events**, select an event, and upload priced media. The uploader sends files directly to the private R2 bucket, and the confirmation function checks the object before adding it to upload history.

Apply the Supabase migrations in filename order and deploy both Edge Functions from this checkout with an authenticated Supabase CLI. The functions use the existing Supabase Edge secrets `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET_NAME` (defaults to `printlab`). Both functions validate the caller's Supabase user token internally. Keep the bucket private.

In the R2 bucket's CORS settings, allow `PUT` from the actual app origins and allow the `Content-Type` and `If-None-Match` request headers. For Vite development, use the exact origin in the address bar, such as `http://localhost:5173`. Add the production origin once known.

For a smoke test, upload a small test JPEG under an owner's draft event and check that it appears in the verified upload history. A signed-in non-owner should receive a denial. Originals remain private. Preview generation, publishing, and automatic cleanup of unconfirmed objects are future work.

