![CodeRabbit Pull Request Reviews](https://img.shields.io/coderabbit/prs/github/NickNort/domain-sublease?utm_source=oss&utm_medium=github&utm_campaign=NickNort%2Fdomain-sublease&labelColor=171717&color=FF570A&link=https%3A%2F%2Fcoderabbit.ai&label=CodeRabbit+Reviews)

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

# Domain Sublease Platform

A Next.js application for renting and managing subdomains. Domain owners can list their domains for subdomain rentals, and users can rent subdomains with automated DNS configuration and Stripe payment processing.

## Features

- **Domain Listings**: Domain owners can list domains for subdomain rentals
- **Subdomain Rentals**: Users can rent subdomains with flexible DNS record configuration
- **Stripe Integration**: Secure payment processing with Stripe Checkout
- **PostgreSQL Database**: Robust data storage with Prisma ORM
- **API Credentials Encryption**: Secure storage of domain registrar API credentials
- **Multi-Registrar Support**: Cloudflare, Route53, and Namecheap

## Tech Stack

- **Framework**: Next.js 16
- **Database**: PostgreSQL with Prisma ORM
- **Payments**: Stripe
- **Authentication**: (To be implemented)
- **Styling**: Tailwind CSS

## Prerequisites

- Node.js 18+ and pnpm
- PostgreSQL database
- Stripe account

## Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd domain-sublease
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Set up environment variables**

   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

   Update the following variables:
   - `DATABASE_URL`: Your PostgreSQL connection string
   - `STRIPE_SECRET_KEY`: Your Stripe secret key
   - `STRIPE_PUBLISHABLE_KEY`: Your Stripe publishable key
   - `STRIPE_WEBHOOK_SECRET`: Your Stripe webhook secret
   - `ENCRYPTION_KEY`: A 32+ character encryption key for API credentials
   - `NEXT_PUBLIC_APP_URL`: Your application URL

4. **Set up the database**
   ```bash
   # Generate Prisma client
   pnpm prisma generate

   # Run migrations
   pnpm prisma migrate dev --name init
   ```

5. **Run the development server**
   ```bash
   pnpm dev
   ```

   Open [http://localhost:3000](http://localhost:3000) to see the application.

## Database Schema

### Users
- id, email, stripe_customer_id, created_at

### Domain Listings
- id, user_id, domain_name, price_per_subdomain, pricing_period
- registrar (Cloudflare, Route53, Namecheap)
- api_credentials_encrypted, max_subdomains_allowed, status

### Subdomain Rentals
- id, listing_id, renter_user_id, subdomain, full_domain
- dns_record_type, dns_record_value
- rental_period_start, rental_period_end, status
- stripe_subscription_id

### Transactions
- id, rental_id, amount, stripe_payment_intent_id, status

## API Endpoints

### Domain Listings

**GET /api/listings**
- Browse available domains
- Query params: `status`, `registrar`
- Returns: Array of domain listings with availability info

**GET /api/listings/:id**
- Get specific listing details
- Returns: Listing object with available subdomains count

**POST /api/listings**
- Create new listing (domain owner)
- Body: `{ userId, domainName, pricePerSubdomain, pricingPeriod, registrar, apiCredentials, maxSubdomainsAllowed }`
- Returns: Created listing

**PUT /api/listings/:id**
- Update listing
- Body: `{ pricePerSubdomain?, pricingPeriod?, apiCredentials?, maxSubdomainsAllowed?, status? }`
- Returns: Updated listing

**DELETE /api/listings/:id**
- Remove listing (only if no active rentals)
- Returns: Success message

### Subdomain Rentals

**POST /api/check-availability**
- Check if subdomain is available
- Body: `{ listingId, subdomain }`
- Returns: `{ available: boolean, reason?: string, fullDomain?, price?, pricingPeriod? }`

**POST /api/rentals**
- Initiate rental (creates Stripe checkout session)
- Body: `{ listingId, renterUserId, subdomain, dnsRecordType, dnsRecordValue, rentalPeriodMonths? }`
- Returns: `{ sessionId, sessionUrl }`

**GET /api/rentals/my-rentals**
- Get user's rentals
- Query params: `userId`
- Returns: Array of user's rentals with listing details

**PUT /api/rentals/:id**
- Update DNS records for a rental
- Body: `{ dnsRecordType?, dnsRecordValue? }`
- Returns: Updated rental

**DELETE /api/rentals/:id**
- Cancel rental (cancels Stripe subscription)
- Returns: Success message with updated rental

### Webhooks

**POST /api/webhooks/stripe**
- Stripe webhook handler
- Handles: checkout.session.completed, payment_intent events, subscription events
- Creates rental records and transactions on successful payment

## Stripe Webhook Setup

1. Install Stripe CLI for local testing:
   ```bash
   stripe listen --forward-to localhost:3000/api/webhooks/stripe
   ```

2. For production, configure webhook in Stripe Dashboard:
   - URL: `https://yourdomain.com/api/webhooks/stripe`
   - Events: `checkout.session.completed`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `customer.subscription.deleted`

## Security Features

- API credentials encrypted using AES-256-GCM
- Stripe webhook signature verification
- Input validation for subdomain format
- Cascading deletes to maintain referential integrity

## Development

```bash
# Run development server
pnpm dev

# Run database migrations
pnpm prisma migrate dev

# Open Prisma Studio
pnpm prisma studio

# Build for production
pnpm build

# Start production server
pnpm start
```

## License

MIT
