# JR PRINTLAB — Complete Development Plan

**Version:** 2.0 | **Updated:** 2026-11-22  
**Product:** Multi-photographer event photo & video marketplace  
**Frontend:** React + Vite + JavaScript (JSX) + React Router + Tailwind CSS v4 + shadcn/ui  
**Backend:** Supabase (Auth, PostgreSQL, RLS, Edge Functions, Realtime where helpful)  
**Media storage:** Cloudflare R2 (`printlab` bucket; original photos/videos and preview assets)  
**Payment:** **Manual merchant QR only** — customer uploads proof; **Super Admin verifies actual funds**, then unlocks downloads  
**Explicit exclusions:** No Laravel, no MySQL backend, no PayMongo, no automatic QR/bank payment detection.

> This document is the source-of-truth implementation brief. UI screenshots are **design references only**, with fictional sample numbers/events. A feature is not implemented just because a mockup illustrates it. Deployment, pricing, quota, and SDK behaviors must be checked against current official documentation before release.

---

## 1. Project purpose & scope

JR PRINTLAB enables approved photographers to register, create event galleries, bulk upload photos/videos, set selling prices, and earn from digital purchases. Customers search by event name, date, category, and manually tagged race **BIB number**, add media to cart, pay a QR code manually, submit proof/reference, wait for admin verification, and then securely download purchased originals.

### MVP goals
- Public storefront featuring **Photobooth**, **Photoman**, and **Fun Run**.
- Photographer account onboarding and separate **Photographer Admin Dashboard**.
- Super Admin for photographer approval, event oversight, manual QR payment verification, media moderation, and earnings/payout ledger.
- Private media upload/storage on **Cloudflare R2**.
- Watermarked/low-res previews and restricted originals.
- Customer cart, order creation, QR display, proof upload, payment statuses, and downloads after verification.
- Mobile-responsive dark branded UI.

### Later phases (not MVP)
- AI selfie/face search; auto BIB OCR; automatic video transcoding/large multipart pipeline; automatic photographer payouts; coupons; subscriptions; banking/payment-gateway integration; real-time payment detection; native mobile app.

### Key operating decisions
- **Multi-photographer** marketplace; each photographer can manage *only* their permitted events and media.
- **Shared events supported:** more than one photographer per event, using event membership records; each media item retains its seller/owner.
- **One platform-controlled merchant QR for the MVP.** Photographer payouts are handled as a separate offline/manual process.
- Photographer cannot approve their own customer's payments. Super Admin alone approves/rejects proofs.
- No claims of automated payment checking. A submitted screenshot does not prove payment.

---

## 2. Brand & UI system

### Approved brand direction
| Token | Hex | Usage |
|---|---|---|
| Background | `#09090B` | App/page background |
| Surface | `#14141B` | Panels, cards, sidebar |
| Primary | `#EC008C` | Primary CTA, active nav, important badges |
| Cyan | `#00C8F8` | Secondary interactions, limited highlights |
| Purple | `#A855F7` | Rare gradients and marketing accents |
| White | `#FFFFFF` | Primary text |
| Muted gray | `#A1A1AA` | Supporting text; neutral UI color |
| Border | `#27272A` | Panels / form borders |

**Rule:** Dark/clean first. Hero/banner may use pink→purple→cyan gradients; do not use loud gradients on every table or dashboard card. Use pink as the main interactive color; accessible focus rings, sufficient contrast, consistent status labels, Inter or similar readable font, rounded-xl cards, responsive spacing.

### Included visual references

**Customer E-Commerce UI — latest dark-theme mockup:**

![Customer UI](assets/customer-ecommerce-ui.png)

**Super Admin — latest dark-theme mockup:**

![Super Admin UI](assets/super-admin-ui.png)

**Photographer Dashboard — earlier layout reference (recolor to latest dark brand):**

![Photographer Dashboard](assets/photographer-dashboard-reference.png)

**Existing JR PRINTLAB brand screenshot:**

![Existing brand](assets/current-brand-screenshot.png)

**Landing/marketing inspiration:**

![Landing concept](assets/brand-style-reference.png)

**Original QR reference screenshot (change automatic detection to manual review):**

![Payment reference](assets/qr-payment-original-reference.png)

### Layout conventions
- **Customer:** wide image-first storefront, event cards, event gallery masonry/grid, clear category/BIB search, cart badge.
- **Photographer admin:** sidebar + page heading + compact KPI cards + event management + upload queue + sales table.
- **Super Admin:** sidebar + KPI overview + prominent **Pending Payment Verification** queue + events/photographers/payouts.
- **Manual QR:** high-contrast white QR panel for scanning, clearly stated merchant name, exact amount/order reference, input for transaction reference, proof attachment, and **Pending Verification** notice.
- Support loading, empty, error, success, retry, and upload progress states; keyboard navigation and responsive mobile/desktop layout.

---

## 3. Roles & permissions

| Role | Can do | Must not do |
|---|---|---|
| Guest customer | Browse events; search gallery; build cart; enter email to checkout | Access originals or private proof records |
| Authenticated customer (optional initially) | See own orders/downloads and account info | Access other customers' orders |
| Photographer (pending) | Register, edit basic profile, see approval status | Publish/upload commercially before approval |
| Photographer (approved) | Create/manage assigned events, upload media, set pricing, BIB tags, see own sales/earnings | Approve QR proofs, read other sellers' records, access master QR configuration |
| Super Admin | Approve/suspend photographers; all events; QR settings; verify payments; payouts; audit trails | Bypass the need to confirm money has actually arrived |

**Enforcement:** Supabase Auth JWT + PostgreSQL Row Level Security (RLS) + server-side checks in Edge Functions/RPC. Never rely on hidden buttons, client-supplied user IDs, or editable `role` values. Admin roles granted only via protected administrative process, not self-registration.

---

## 4. Pages, routes & navigation

### Public / customer
| Route | Page / function |
|---|---|
| `/` | Home hero, search, featured events, categories |
| `/events` | All events; category/date/name filters |
| `/events/:slug` | Event detail + photo/video gallery |
| `/events/:slug?bib=1234` | Fun Run BIB-number search (manual tags in MVP) |
| `/cart` | Selected digital media, totals |
| `/checkout` | Server-created order + merchant QR payment form |
| `/orders/:accessToken` | Limited-scope guest order status with secure token (or customer login) |
| `/downloads/:accessToken` | Download list (server rechecks access on every request) |
| `/login` / `/register` | Authentication |
| `/photographers/apply` | Photographer signup/onboarding |
| `/how-it-works` | Buyer / seller instructions |

### Photographer Admin `/photographer/*`
- `/dashboard`: events, media count, purchases, net earnings; latest orders.
- `/events`: own/assigned events; create, edit, draft, publish, archive.
- `/events/:id/media`: uploads, previews, prices, BIB tags, availability.
- `/orders`: only order line-items involving their own media; protected customer info.
- `/earnings`: gross/net/commission, payout statuses.
- `/settings`: profile, display name, optional watermarks, payout details (sensitive).

### Super Admin `/admin/*`
- `/dashboard`: platform overview.
- `/photographers`: approve, suspend, restore, and profile review.
- `/events`: manage events/categories; assign member photographers.
- `/media`: moderation and failed upload processing.
- `/orders`: all order records.
- `/payments`: **manual payment verification** queue.
- `/payment-settings`: active merchant name, accepted payment instructions and QR file.
- `/commissions` and `/payouts`: commission/payout ledger and manual marking.
- `/audit-logs`: critical changes and who performed them.
- `/settings`: platform configuration.

---

## 5. User experience flows

### 5A. Photographer
1. Register with email/password using Supabase Auth.
2. Fill photographer profile, status `pending`.
3. Super Admin approves; server-controlled role/access becomes `approved`.
4. Create event with category, name, date, cover, slug, description, optional location.
5. Upload photos/videos to private R2 via temporary signed URLs; show per-file progress and retry.
6. Confirm uploaded objects, generate/assign previews, set individual price or event default, optionally tag BIB number(s).
7. Publish only after all required media is ready and has a preview.
8. Monitor sales and earnings (order lines attributed to photographer, not total platform sales).

### 5B. Customer
1. Discover event; browse safe preview images/videos.
2. Fun Run: enter BIB number; return manually tagged matching assets.
3. Select files → cart; optional bundles later.
4. Checkout: server recalculates price and creates order (never trusts browser totals).
5. Show **static configured merchant QR** and exact due amount; customer pays externally.
6. Enter transaction/reference number, optional sender information, upload screenshot/receipt.
7. Order moves to **Pending Verification**; no download yet.
8. Admin compares actual merchant account transfer with order data and proof.
9. On approval, show paid status and issue authorized short-lived download URLs per purchased media.

### 5C. Super Admin payment review
1. View pending verification queue (order ID, amount, timestamp, reference, proof thumbnail).
2. Inspect proof **privately** and compare with *actual bank/e-wallet transaction history*.
3. Verify exact amount, receiving account, time/reference, and absence of duplicate approval.
4. Approve or reject with reason; record reviewer, timestamp, and immutable audit entry.
5. Approval updates order + payment + entitlement **atomically** via protected database function/transaction; never from a direct browser table update.
6. If rejected, customer sees reason/resubmit instructions; if paid, purchased items unlock.

---

## 6. Manual QR payment — approved implementation

### What it is
A single QR image set by JR PRINTLAB admin (supported merchant/bank/wallet QR), **not** a dynamically generated per-order provider-integrated QR. The displayed total is an order label on our website; the QR itself might **not encode that amount**. The customer must pay the correct amount manually.

### What it is NOT
- No PayMongo or payment-provider integration.
- No bank webhook or automatic successful-payment detection.
- No immediate unlock merely from screenshot submission.
- No presumption that a transfer happened because a user typed a reference.

### Manual QR checkout mock wireframe
```text
┌───────────────────────────────────────────────────────┐
│ JR PRINTLAB   •   Complete Your Payment          [×] │
│ Order: JRP-2026-000125                               │
│ Amount due:                               ₱250.00    │
├───────────────────────────────────────────────────────┤
│ [ WHITE SCANNABLE MERCHANT QR ]                       │
│ Merchant/recipient: JR PRINTLAB                       │
│ Pay using a compatible app; send the exact amount.   │
│                                                       │
│ Payment reference / transaction ID *                 │
│ [__________________________________________]          │
│ Proof of payment (JPG/PNG/PDF) *                      │
│ [ Drag/drop or select file                 ]          │
│                                                       │
│ [ Submit for Verification ]                          │
│ Status: Pending Review — no download access yet       │
└───────────────────────────────────────────────────────┘
```

### Order statuses
| Status | Description | Access |
|---|---|---|
| `awaiting_payment` | Order placed but proof not submitted | No |
| `pending_verification` | Customer submitted payment details; admin reviewing | No |
| `paid` | Admin matched and confirmed actual funds | Purchased originals only |
| `rejected` | Proof/transaction not accepted; resubmission policy applies | No |
| `cancelled` | Order cancelled/expired, with manual reconciliation of late payments | No |
| `refunded` | Refunded; entitlements revoked according to policy | No |

### Safeguards
- Merchant QR image and payment instructions editable only by Super Admin.
- Customer proof stored in **private Supabase Storage**, small size/type limit; signed or proxied access for authorized reviewers only.
- Require reference/receipt; rate-limit repeated submissions and order creation.
- Avoid duplicate payment reference reuse where distinguishable; flag suspicious repeats.
- Admin approval is idempotent, transaction-safe, and audited; no double payouts/credits.
- Keep order subtotal, item prices, and commission **snapshots** at time of checkout.
- Clarify payment cutoff/expiry and handling of late or over/underpayments.
- Handle financial/receipt personal information under a published privacy/retention policy.
- Manual QR merchant account receives the full incoming payment; revenue split and photographer payout are separate manual ledger tasks.

---

## 7. Technical architecture

```text
React + Vite + Tailwind v4 + shadcn/ui (Vercel optional)
       │
       ├─ Supabase Auth — sessions and approved roles
       ├─ Supabase Postgres + RLS — events, media metadata, orders, payouts
       ├─ Supabase Edge Functions — privileged workflows and R2 URL signing
       │      ├─ create-upload-url (authenticated + event membership check)
       │      ├─ confirm-upload (R2 HEAD + metadata/size/type verification)
       │      ├─ create-order (server-side pricing + order lines)
       │      ├─ submit-payment-proof (authorize order, link private receipt)
       │      ├─ review-payment (admin-only transaction-safe verification)
       │      └─ get-download-url (paid entitlement check + short-lived R2 URL)
       ├─ Supabase Storage (PRIVATE) — QR image, payment receipts
       └─ Cloudflare R2 `printlab` (PRIVATE) — originals, previews, thumbnails, videos
                          └─ Browser PUT directly to short-lived pre-signed R2 URL
```

### Critical separation
- **Supabase Database** stores only metadata, prices, ownership, and opaque `r2_key`s — never R2 secret keys or blobs.
- **R2** stores original media; bucket public access remains disabled. Do not embed original file URLs in public HTML.
- **Supabase Edge Function Secrets** hold `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME=printlab`.
- **React `.env.local`** may contain only public Supabase URL/publishable (anon) key, not R2 secrets or Supabase secret/service-role credentials.
- The R2 S3 endpoint follows `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`, while the bucket name is supplied separately.
- Current project setup: R2 bucket **created** and Edge Function **named** `create-upload-url`; prior conversation does **not** establish a successful full upload, verified database policies, or the final function implementation. Treat these as unfinished.

### Example R2 keys (prefixes are logical, not actual folders)
```text
printlab (bucket)
  events/<event-uuid>/originals/<random-uuid>.jpg
  events/<event-uuid>/originals/<random-uuid>.mp4
  events/<event-uuid>/previews/<random-uuid>.webp
  events/<event-uuid>/thumbnails/<random-uuid>.webp
```

### Upload flow (MVP)
1. Logged-in approved photographer chooses an event and local files.
2. React calls `create-upload-url(event_id, MIME type, declared size)` with Supabase session.
3. Server verifies user identity, approval, event membership and allowed file type/size; generates unpredictable object key and **5-minute signed PUT URL**.
4. Browser PUTs binary directly to R2 with correctly signed `Content-Type` header.
5. React calls `confirm-upload` with server-issued upload ID/object key.
6. Server calls R2 `HEAD`, checks actual size/type, marks object uploaded, records media metadata, queues/records preview creation as needed.
7. Media becomes sellable **only after** safe preview is available and owner sets a valid price.

**Limits to understand:** A URL signer that accepts declared `fileSize` does *not* enforce the actual size on a direct PUT. Confirm server-side, apply stronger upload restrictions where supported, rate-limit/limit signed URLs, clean abandoned objects, and use multipart/resumable upload for large videos later. R2 CORS is required for direct browser PUT; CORS does not grant authorization.

### Suggested R2 CORS policy (adjust origin to actual site)
```json
[
  {
    "AllowedOrigins": ["http://localhost:5173", "https://your-actual-domain.example"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type"],
    "MaxAgeSeconds": 3600
  }
]
```
Remove placeholder domain. Add only deployed trusted app origins; never add secrets to client code.

### Download security
1. Browser requests purchased item download from Edge Function.
2. Server authenticates customer via signed-in user or strong opaque guest token (scope + expiry + anti-abuse measures).
3. Check `order.status = paid`, entitlement exists for **specific** media, not refunded/revoked, media object belongs to order item.
4. Generate short-lived R2 **GET** signed URL only for that exact key.
5. Optionally record downloads and apply rate limits.

### Preview pipeline
- Public gallery shows only **derived** lower-resolution previews with watermark (no direct access to private original).
- For MVP: either upload pre-generated safe previews from a trusted process, or build a server-side image processing job/worker; never blindly trust a photographer's claimed preview as harmless production output.
- Video thumbnails/short preview clips require processing; defer heavy transcoding if hosting/compute constrained.
- Remove EXIF/location metadata from public previews when appropriate.

---

## 8. Database design (Supabase Postgres)

**Money:** store integer **centavos** (`price_centavos`, `amount_centavos`) in PHP; avoid floating-point money. **IDs:** UUID primary keys. **Timestamps:** `timestamptz` UTC. Add indexes for foreign keys, status, dates, slugs, and BIB search. All sensitive tables require RLS.

| Table | Essential columns | Notes |
|---|---|---|
| `profiles` | `id` FK auth.users, `display_name`, `role`, `created_at` | Role changes server/admin-controlled |
| `photographer_profiles` | `user_id`, `approval_status`, `display_name`, `bio`, `approved_at` | pending/approved/suspended |
| `event_categories` | `id`, `slug`, `name` | seed `photobooth`, `photoman`, `fun-run` |
| `events` | `id`, `slug`, `title`, `category_id`, `owner_id`, `event_date`, `description`, `cover_key`, `status` | draft/published/archived |
| `event_photographers` | `event_id`, `photographer_id`, `membership_status` | shared events, uniqueness on pair |
| `media` | `id`, `event_id`, `owner_id`, `media_type`, `original_key`, `preview_key`, `thumbnail_key`, `mime_type`, `size_bytes`, `price_centavos`, `status` | never expose originals freely |
| `media_bib_numbers` | `media_id`, `bib_number` | normalized searchable BIB strings |
| `upload_intents` | `id`, `user_id`, `event_id`, `r2_key`, `declared_size`, `status`, `expires_at` | prevent key spoofing and cleanup |
| `carts` / `cart_items` | `customer_id` or session ID, `media_id`, timestamps | Cart UI can begin client-side; prices server-reviewed |
| `orders` | `id`, `order_number`, `customer_id?`, `buyer_email`, `status`, `total_centavos`, `access_token_hash`, `expires_at` | secure guest lookup |
| `order_items` | `order_id`, `media_id`, `seller_id`, `unit_price_centavos`, `commission_centavos` | immutable price/ownership snapshot |
| `payment_settings` | `merchant_name`, `qr_storage_key`, `instructions`, `updated_by` | admin-owned global config |
| `payment_submissions` | `id`, `order_id`, `reference_no`, `proof_key`, `status`, `submitted_at`, `reviewed_by`, `reviewed_at`, `rejection_reason` | private financial records |
| `download_entitlements` | `id`, `order_item_id`, `order_id`, `media_id`, `active`, `created_at` | create only after paid |
| `commissions` | `order_item_id`, `seller_id`, `gross_centavos`, `fee_centavos`, `net_centavos` | ledger derived from paid purchase |
| `payouts` / `payout_items` | `seller_id`, `amount_centavos`, `status`, `paid_at`, ledger links | manual bank payouts |
| `audit_logs` | `actor_id`, `action`, `entity_type`, `entity_id`, `metadata`, `created_at` | payment/admin actions |

### Database constraints & behavior
- One unique `(event_id, photographer_id)` membership.
- `price_centavos >= 0` for draft; published saleable items need `> 0`.
- Unique `orders.order_number`; order-level price snapshots preserved.
- Verify BIB strings normalization and indexes; same BIB may appear in many photos.
- Media owner must be an assigned photographer on that event, validated server-side.
- Do not allow photographer/customer direct UPDATE of `orders.status`, `payment_submissions.reviewed_by`, `commissions`, `payouts`, or entitlements.
- RLS select: only public `published` events and ready preview metadata; buyers only own secure order records; sellers only their own sales lines; admins restricted to trusted roles.
- Payment approval implemented in one protected transaction-safe database operation, with row locking/idempotency and audit logging.

### Suggested initial SQL migration order
1. Roles/profiles + role management policies.
2. Categories, events, memberships + RLS.
3. Media, BIB tags, upload intents + RLS.
4. Orders, order items + server order creation.
5. Payment settings, payment submissions, admin verification function.
6. Entitlements, commissions, payout ledger, audit logs.

**Note:** This is a schema plan, **not yet a tested SQL migration**. Write and test migration scripts before deployment, rather than manually creating partial tables and assuming policy correctness.

---

## 9. Supabase Edge Functions inventory

| Function | Authentication | Responsibilities |
|---|---|---|
| `create-upload-url` | approved logged-in photographer | validate membership and file request, create short-lived signed PUT URL + upload intent |
| `confirm-upload` | upload owner | R2 HEAD, verify object, mark upload completed, save metadata |
| `create-order` | signed-in or constrained guest flow | calculate totals server-side, reserve ordered items, issue order reference |
| `submit-payment-proof` | authorized order holder | validate reference, proof attachment, set pending verification |
| `review-payment` | **Super Admin only** | compare/reconcile manually; atomically approve/reject and record audit |
| `get-download-url` | paid order holder | verify exact entitlement then create short-lived signed GET URL |
| `get-public-gallery` (optional) | public | expose only preview metadata, never original keys or secrets |

**Auth caveat:** Supabase supports more than one JWT/API-key mode. Configure the actual deployed function according to the current Supabase SDK and signing-key mode, and verify auth inside the function. Turning off the legacy JWT gateway toggle is **not authorization** by itself. Test unauthorized, expired, suspended, wrong-event and wrong-role requests. Never use a `publishable` or `secret` API key alone as proof of a logged-in photographer.

**Cloudflare secrets:** If any key was visible in a screenshot/log, rotate/revoke it. R2 token permissions should be Object Read & Write, scoped to **only** `printlab` bucket. Do not paste credentials into issue trackers, screenshots, Git, chat, or browser bundles.

---

## 10. Frontend folder structure

```text
jr-printlab/
├── public/
│   └── brand/
├── src/
│   ├── components/
│   │   ├── ui/                    # shadcn generated components
│   │   ├── layout/                # navbar, sidebars, footer
│   │   ├── events/                # EventCard, EventFilters
│   │   ├── gallery/               # MediaGrid, BibSearch, PreviewModal
│   │   ├── cart/                  # CartItem, OrderSummary
│   │   ├── checkout/              # ManualQrModal, ProofUpload
│   │   ├── uploads/               # Dropzone, UploadProgress
│   │   └── shared/                # PageHeading, StatCard, StatusBadge
│   ├── pages/
│   │   ├── public/                # Home, Events, EventGallery, Cart, Checkout
│   │   ├── photographer/          # Dashboard, MyEvents, UploadMedia, Orders, Earnings
│   │   ├── admin/                 # Dashboard, Photographers, Payments, Reports
│   │   └── auth/                  # Login, Register
│   ├── layouts/                   # CustomerLayout, PhotographerLayout, AdminLayout
│   ├── routes/                    # Router, protected route wrappers
│   ├── contexts/                  # Auth/session and cart state
│   ├── lib/                       # supabase.js, utils.js, constants.js
│   ├── services/                  # upload.js, events.js, checkout.js, downloads.js
│   ├── hooks/
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── .env.local
├── jsconfig.json
├── vite.config.js
└── package.json
```

### Client-side environment example (public only)
```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_PUBLISHABLE_KEY
```
Use `import.meta.env.VITE_SUPABASE_URL` and `import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY` in the browser. **Never** create `VITE_R2_SECRET_ACCESS_KEY`, `VITE_SUPABASE_SERVICE_ROLE_KEY`, or expose any admin secret.

---

## 11. Initial project setup (Windows / VS Code)

Use Node.js version supported by current Vite/shadcn releases (confirm `node -v`). From the desired parent folder:

```bash
npm create vite@latest jr-printlab -- --template react
cd jr-printlab
npm install
npm install tailwindcss @tailwindcss/vite
npm install @supabase/supabase-js react-router-dom lucide-react
npm install motion
```

### `vite.config.js`
```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
```

### `jsconfig.json`
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src"]
}
```

### Tailwind and shadcn
1. Set `src/index.css` initially to `@import "tailwindcss";`.
2. Run `npx shadcn@latest init` and follow Vite/JavaScript options; preserve generated CSS tokens.
3. Install as needed:

```bash
npx shadcn@latest add button card input dialog table badge dropdown-menu tabs select textarea separator skeleton sheet sidebar sonner alert-dialog progress
npm run dev
```

4. After shadcn initialization, adapt its dark theme tokens to the JR PRINTLAB brand; add custom tokens rather than overwriting its functional base styles.
5. Open `http://localhost:5173` (or the port printed by Vite).

### Recommended component build order
- Navigation + homepage + event listing.
- Event gallery with dummy data; photo preview and BIB search.
- Cart + QR modal with sample data; pending status.
- Photographer Dashboard + event editor + mock upload progress.
- Super Admin payment review UI.
- Then connect live Supabase queries and R2 functions behind these working screens.

---

## 12. Development phases & acceptance criteria

### Phase 0 — Bootstrap & infrastructure
- [ ] React/Vite JSX project runs locally.
- [ ] Tailwind v4 + shadcn/ui working and brand tokens defined.
- [ ] Supabase project configured and public client variables added.
- [ ] R2 `printlab` bucket private; scoped API token and secrets configured.
- [ ] Verify R2 account ID matches Cloudflare R2 endpoint (not Secret Key).
- [ ] CORS allows localhost and actual production origin only.
- [ ] Database migrations and RLS tests checked into Git.

### Phase 1 — Customer marketplace UI
- [ ] Homepage, category cards, event index and event details.
- [ ] Photo/video grid, preview dialog, filters, search.
- [ ] Manual BIB search on Fun Run event.
- [ ] Cart, checkout and QR modal states (mock data).
- [ ] Mobile responsive + no inaccessible contrast.

### Phase 2 — Auth, photographer and event management
- [ ] Supabase email login/signup, session refresh, logout.
- [ ] Photographer application and admin approval.
- [ ] Authenticated routes and enforced RLS.
- [ ] CRUD events/categories/memberships.
- [ ] Photographer dashboard metrics sourced from authorized data.

### Phase 3 — R2 upload & secure preview
- [ ] `create-upload-url` checks approved status + event membership.
- [ ] Browser direct PUT to R2; progress/retry; CORS test.
- [ ] `confirm-upload` verifies actual R2 object and stores metadata.
- [ ] Image preview/thumbnail strategy tested; no public originals.
- [ ] Prices, media status, BIB tags, publish flow.
- [ ] File cleanup, upload quota, bad MIME/type/oversize rejection.

### Phase 4 — Manual QR checkout
- [ ] Admin uploads/configures official merchant QR.
- [ ] Server-side order totals + immutable line item snapshots.
- [ ] Customer payment reference and proof upload.
- [ ] Payment queue defaults to **Pending Verification**.
- [ ] Admin confirms incoming money before approve.
- [ ] Approval/rejection idempotent and audited.
- [ ] Paid status creates exact purchased-media entitlements.
- [ ] Secure R2 signed GET only after entitlement check.

### Phase 5 — Earnings, QA and release
- [ ] Commission rate configuration and immutable fee snapshots.
- [ ] Seller-only earnings and manual payout reconciliation.
- [ ] Audit trails and error reporting.
- [ ] E2E tests: buyer, photographer, admin, unpaid access denial.
- [ ] Upload/video size and bandwidth tests; storage cost monitoring.
- [ ] Privacy/terms/copyright/takedown and refund policy published.
- [ ] Vercel frontend deployed with production CORS and secrets checked.

---

## 13. Important security / QA tests

**Must fail:**
- Guest directly requests R2 upload presigned URL.
- Pending/suspended photographer requests a signed upload URL.
- Photographer uploads into another seller's event.
- Browser modifies price/commission/role or directly marks an order paid.
- Customer uses another customer's order ID/token.
- Customer downloads original before real manual approval.
- Signed download URL for one asset accesses another asset.
- Duplicate payment approval credits an order twice.
- Uploaded proof becomes public by URL guessing.
- Frontend bundle contains R2 access keys or Supabase secret key.

**Must pass:**
- Approved seller uploads a normal image into assigned event.
- Actual upload matches allowed type and size; preview created.
- Fun Run BIB search finds tagged images.
- Admin sees proof, checks actual funds, and approves exactly once.
- Only correct buyer gets short-lived original download URL.
- Photographer earnings reflect paid orders and configured fee snapshots.

---

## 14. Free-tier testing plan & deployment

Use a **small** development dataset: example 3 events, 2 photographers, 20–100 photos, and a few small test videos. Keep photo originals small enough for storage quotas; note that previews and thumbnails add storage. R2 and Supabase quotas, request limits, and pricing can change; verify in official pricing dashboards before production, and set cost alerts where available. R2 free allowance does **not** mean an absolute spending cap.

### Suggested environments
- **Local:** React/Vite on `localhost:5173`, dedicated Supabase dev project if possible, private R2 test prefix.
- **Staging:** Separate test accounts and sample files, test QR image, never real customers.
- **Production:** Custom domain/Vercel, production Supabase, private production media, monitored billing and secured admin roles.

### Operational items before launch
- Configure business-recipient display and validate merchant QR scan compatibility.
- Agree commission and payout handling (including refunds, disputes and chargebacks/manual corrections).
- Obtain permission from event organizer/photographer to sell depicted content; respect privacy and takedown requests.
- Customer support contact, terms, privacy policy, refund and retention policy.
- Incident response: token rotation, event suspension, object cleanup, payment reconciliation, and backups.

---

## 15. Immediate next actions (current state)

**Known progress from setup discussion:** A Cloudflare R2 bucket `printlab` has been created; R2 S3 credentials were issued; Supabase Edge Function Secrets were added; a function named `create-upload-url` was created. This does **not** mean the upload integration is fully tested. The React project is the **current next build step**.

1. Create `jr-printlab` Vite React JavaScript project; install Tailwind v4/shadcn.
2. Add dark JR PRINTLAB theme and build customer homepage from provided mockup.
3. Build photographer and admin route layouts with static data.
4. Create and test Supabase schema/RLS; verify function auth configuration with chosen Supabase SDK.
5. Implement/test `create-upload-url`, `confirm-upload`, R2 CORS, and signed downloads.
6. Implement manual QR proof submission and protected verification transaction.
7. Complete end-to-end paid-photo purchase test with sample images only.

---

## 16. Official technical reference links

- Vite: https://vite.dev/guide/
- Tailwind CSS for Vite: https://tailwindcss.com/docs/installation/using-vite
- shadcn/ui Vite: https://ui.shadcn.com/docs/installation/vite
- Supabase Auth: https://supabase.com/docs/guides/auth
- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Edge Functions: https://supabase.com/docs/guides/functions
- Cloudflare R2 docs: https://developers.cloudflare.com/r2/
- Cloudflare R2 CORS: https://developers.cloudflare.com/r2/buckets/cors/
- Cloudflare R2 presigned URLs: https://developers.cloudflare.com/r2/api/s3/presigned-urls/

**Bottom line:** JR PRINTLAB's MVP is a React + shadcn/ui photography marketplace backed by Supabase, with Cloudflare R2 holding private media and a **manual QR + Super Admin verification** checkout. Never unlock downloadable originals before a trusted server-side payment approval.
