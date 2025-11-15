# Subdomain Rental Marketplace - Implementation Guide

## Overview

This guide explains the complete implementation flow for the subdomain rental marketplace, including domain listing creation, verification, subdomain rental, payment processing, and DNS automation.

## Implementation Flow

### 1. Domain Owner Creates Listing

**Endpoint**: `POST /api/listings`

**Request Body**:
```json
{
  "userId": "user_id_here",
  "domainName": "example.com",
  "pricePerSubdomain": 5.00,
  "pricingPeriod": "MONTHLY",
  "registrar": "CLOUDFLARE",
  "apiCredentials": {
    "apiToken": "your_cloudflare_api_token",
    "zoneId": "your_zone_id"
  },
  "allowedRecordTypes": ["A", "CNAME", "TXT"],
  "maxSubdomainsAllowed": 100
}
```

**Supported Registrars**:
- **CLOUDFLARE**: Requires `{ apiToken, zoneId }`
- **ROUTE53**: Requires `{ accessKeyId, secretAccessKey, hostedZoneId }`
- **NAMECHEAP**: Requires `{ apiKey, apiUser, username, clientIp }`

**Response**:
```json
{
  "id": "listing_id",
  "domainName": "example.com",
  "pricePerSubdomain": 5.00,
  "pricingPeriod": "MONTHLY",
  "registrar": "CLOUDFLARE",
  "allowedRecordTypes": ["A", "CNAME", "TXT"],
  "maxSubdomainsAllowed": 100,
  "isVerified": false,
  "verificationToken": "abc123...",
  "verificationInstructions": {
    "message": "To verify domain ownership, add a TXT record to your domain with the following details:",
    "recordType": "TXT",
    "recordName": "_domain-verification",
    "recordValue": "abc123...",
    "nextStep": "After adding the TXT record, call POST /api/listings/{id}/verify to complete verification."
  }
}
```

**Backend Process**:
1. ✅ Validates required fields and record types
2. ✅ Encrypts API credentials using AES-256-GCM
3. ✅ Validates API credentials by testing connection to registrar
4. ✅ Generates random verification token (32-byte hex)
5. ✅ Stores listing with `isVerified: false`
6. ✅ Returns verification instructions

---

### 2. Domain Ownership Verification

**Endpoint**: `POST /api/listings/:id/verify`

**Steps**:
1. Domain owner adds TXT record to their domain:
   - **Name**: `_domain-verification`
   - **Value**: The `verificationToken` from step 1
   - **TTL**: Any (3600 recommended)

2. Call verification endpoint (no body required)

**Response (Success)**:
```json
{
  "success": true,
  "message": "Domain ownership verified successfully!",
  "listing": {
    "id": "listing_id",
    "domainName": "example.com",
    "isVerified": true,
    "status": "ACTIVE"
  }
}
```

**Response (Failure)**:
```json
{
  "success": false,
  "error": "Verification TXT record not found...",
  "instructions": {
    "message": "Please ensure you have added the TXT record to your domain:",
    "recordType": "TXT",
    "recordName": "_domain-verification",
    "recordValue": "abc123...",
    "note": "DNS propagation may take a few minutes. Please wait and try again."
  }
}
```

**Backend Process**:
1. ✅ Retrieves listing and verification token
2. ✅ Connects to DNS provider using encrypted credentials
3. ✅ Queries TXT records for `_domain-verification` record
4. ✅ Verifies token matches
5. ✅ Updates listing to `isVerified: true` and clears token
6. ✅ Only verified listings can rent out subdomains

---

### 3. Check Subdomain Availability

**Endpoint**: `POST /api/check-availability`

**Request Body**:
```json
{
  "listingId": "listing_id",
  "subdomain": "blog"
}
```

**Response (Available)**:
```json
{
  "available": true,
  "fullDomain": "blog.example.com",
  "price": 5.00,
  "pricingPeriod": "MONTHLY",
  "allowedRecordTypes": ["A", "CNAME", "TXT"]
}
```

**Response (Unavailable)**:
```json
{
  "available": false,
  "reason": "This subdomain is already taken."
}
```

**Backend Process**:
1. ✅ Validates subdomain format (alphanumeric + hyphens)
2. ✅ Checks if listing is active
3. ✅ Checks if max subdomains reached
4. ✅ Queries database for existing active rentals
5. ✅ **NEW**: Queries actual DNS records to detect conflicts
6. ✅ Returns availability + pricing info

---

### 4. Initiate Rental (Stripe Checkout)

**Endpoint**: `POST /api/rentals`

**Request Body**:
```json
{
  "listingId": "listing_id",
  "renterUserId": "renter_user_id",
  "subdomain": "blog",
  "dnsRecordType": "A",
  "dnsRecordValue": "192.0.2.1"
}
```

**Response**:
```json
{
  "sessionId": "cs_test_...",
  "sessionUrl": "https://checkout.stripe.com/pay/cs_test_..."
}
```

**Backend Process**:
1. ✅ Validates listing and subdomain availability
2. ✅ Gets or creates Stripe customer for renter
3. ✅ Creates Stripe Checkout Session in **subscription mode**:
   - Monthly or yearly recurring billing
   - Automatic renewal
   - Line item: "Subdomain: blog.example.com"
4. ✅ Stores metadata (listingId, subdomain, DNS details) in session
5. ✅ Returns checkout URL for user to complete payment

**Stripe Checkout Configuration**:
```javascript
const session = await stripe.checkout.sessions.create({
  customer: customerId,
  mode: 'subscription',  // ← Subscription mode for recurring payments
  line_items: [{
    price_data: {
      currency: 'usd',
      product_data: {
        name: `Subdomain: blog.example.com`,
      },
      recurring: { interval: 'month' }, // or 'year'
      unit_amount: 500,  // $5.00 in cents
    },
    quantity: 1,
  }],
  success_url: 'https://yourapp.com/success?session_id={CHECKOUT_SESSION_ID}',
  cancel_url: 'https://yourapp.com/cancel',
  metadata: {
    listingId: '...',
    subdomain: 'blog',
    dnsRecordType: 'A',
    dnsRecordValue: '192.0.2.1',
    // ...
  },
});
```

---

### 5. Webhook Processing & DNS Creation

**Endpoint**: `POST /api/webhooks/stripe`

**Events Handled**:
- `checkout.session.completed` - Payment successful, create DNS record
- `customer.subscription.deleted` - Subscription cancelled, delete DNS record
- `payment_intent.succeeded` - Payment succeeded
- `payment_intent.payment_failed` - Payment failed

#### Event: `checkout.session.completed`

**Backend Process**:
1. ✅ Retrieves session metadata
2. ✅ Retrieves Stripe subscription details
3. ✅ Calculates rental period from subscription dates
4. ✅ Validates listing is verified
5. ✅ Checks DNS record type is allowed
6. ✅ **Creates DNS record** via registrar API:
   ```javascript
   const dnsProvider = createDNSProvider(
     listing.registrar,
     listing.apiCredentialsEncrypted
   );

   const result = await dnsProvider.createRecord({
     type: 'A',
     name: 'blog.example.com',
     content: '192.0.2.1',
     ttl: 3600,
   });
   ```
7. ✅ Creates `SubdomainRental` record in database
8. ✅ Creates `Transaction` record

**DNS Creation Example (Cloudflare)**:
```javascript
// POST https://api.cloudflare.com/client/v4/zones/{zone_id}/dns_records
{
  "type": "A",
  "name": "blog.example.com",
  "content": "192.0.2.1",
  "ttl": 3600
}
```

#### Event: `customer.subscription.deleted`

**Backend Process**:
1. ✅ Finds rental by subscription ID
2. ✅ Lists DNS records from provider
3. ✅ Finds matching record by subdomain name
4. ✅ **Deletes DNS record** from registrar
5. ✅ Updates rental status to `CANCELLED`

---

## API Credentials Format

### Cloudflare
```json
{
  "apiToken": "your_api_token",
  "zoneId": "your_zone_id"
}
```

**How to get**:
- API Token: Cloudflare Dashboard → My Profile → API Tokens → Create Token
- Zone ID: Cloudflare Dashboard → Select Domain → Overview → Zone ID

### AWS Route53
```json
{
  "accessKeyId": "AKIA...",
  "secretAccessKey": "secret...",
  "hostedZoneId": "Z1234567890ABC",
  "region": "us-east-1"
}
```

### Namecheap
```json
{
  "apiKey": "your_api_key",
  "apiUser": "your_username",
  "username": "your_username",
  "clientIp": "your_whitelisted_ip"
}
```

---

## Security Features

### 1. Credential Encryption
- All API credentials encrypted with **AES-256-GCM**
- Unique IV (initialization vector) per encryption
- Authentication tags prevent tampering
- Encryption key from `ENCRYPTION_KEY` environment variable

### 2. Domain Ownership Verification
- Random 32-byte verification token
- DNS TXT record challenge
- Only verified listings can rent subdomains
- Prevents unauthorized domain usage

### 3. Allowed Record Types
- Domain owners specify allowed DNS record types
- Prevents renters from creating unauthorized record types
- Typical: `["A", "CNAME", "TXT"]`

### 4. Stripe Webhook Signature Verification
- All webhooks validated with signature
- Prevents fake payment notifications
- Uses `STRIPE_WEBHOOK_SECRET`

---

## Environment Variables Required

```bash
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/domain_sublease"

# Stripe
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
NEXT_PUBLIC_APP_URL="https://yourapp.com"

# Encryption
ENCRYPTION_KEY="your_32_character_encryption_key_here"
```

---

## Database Migration

After updating the schema, run:

```bash
npx prisma migrate dev --name add_zone_id_and_verification
npx prisma generate
```

**Schema Changes**:
- Added `zoneId` to `DomainListing`
- Added `allowedRecordTypes` array to `DomainListing`
- Added `isVerified` boolean to `DomainListing`
- Added `verificationToken` to `DomainListing`

---

## Testing the Flow

### 1. Create a User
```bash
curl -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -d '{"email": "owner@example.com"}'
```

### 2. Create Domain Listing
```bash
curl -X POST http://localhost:3000/api/listings \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user_id",
    "domainName": "example.com",
    "pricePerSubdomain": 5.00,
    "pricingPeriod": "MONTHLY",
    "registrar": "CLOUDFLARE",
    "apiCredentials": {
      "apiToken": "your_token",
      "zoneId": "your_zone_id"
    },
    "allowedRecordTypes": ["A", "CNAME"],
    "maxSubdomainsAllowed": 100
  }'
```

### 3. Add TXT Record
Add the verification TXT record to your domain via Cloudflare/Route53/Namecheap dashboard.

### 4. Verify Domain
```bash
curl -X POST http://localhost:3000/api/listings/{listing_id}/verify
```

### 5. Check Availability
```bash
curl -X POST http://localhost:3000/api/check-availability \
  -H "Content-Type: application/json" \
  -d '{
    "listingId": "listing_id",
    "subdomain": "blog"
  }'
```

### 6. Initiate Rental
```bash
curl -X POST http://localhost:3000/api/rentals \
  -H "Content-Type: application/json" \
  -d '{
    "listingId": "listing_id",
    "renterUserId": "renter_id",
    "subdomain": "blog",
    "dnsRecordType": "A",
    "dnsRecordValue": "192.0.2.1"
  }'
```

### 7. Complete Payment
Use the returned Stripe checkout URL to complete payment.

### 8. Verify DNS Record
After payment, check that the DNS record was created:
```bash
dig blog.example.com
```

---

## Subscription Management

### Auto-Renewal
- Subscriptions automatically renew monthly/yearly
- Stripe handles recurring billing
- DNS records remain active while subscription is active

### Cancellation
- User cancels via Stripe Customer Portal
- Webhook receives `customer.subscription.deleted`
- DNS record automatically deleted
- Rental marked as `CANCELLED`

### Failed Payments
- Stripe retries failed payments automatically
- If payment fails after retries, subscription cancelled
- DNS record deleted via webhook

---

## Error Handling

### DNS Creation Failures
- If DNS creation fails, rental still created
- Error logged for debugging
- Domain owner can manually create record or support can retry

### DNS Deletion Failures
- Rental still marked as cancelled
- Error logged
- Manual cleanup may be required

### Verification Failures
- Clear error messages returned
- Instructions provided for adding TXT record
- Note about DNS propagation delay

---

## Next Steps

1. **Authentication**: Implement user authentication (OAuth, JWT, etc.)
2. **Authorization**: Protect endpoints with user ownership checks
3. **Frontend UI**: Build user interface for listing/renting
4. **Email Notifications**: Send emails for verification, payment, cancellation
5. **Admin Dashboard**: Monitor listings, rentals, revenue
6. **Rate Limiting**: Protect API endpoints from abuse
7. **Logging & Monitoring**: Add structured logging and monitoring
8. **Testing**: Add unit and integration tests

---

## File Structure

```
src/
├── lib/
│   ├── dns/
│   │   ├── types.ts           # DNS provider interfaces
│   │   ├── cloudflare.ts      # Cloudflare DNS client
│   │   ├── route53.ts         # AWS Route53 client
│   │   ├── namecheap.ts       # Namecheap DNS client
│   │   └── index.ts           # DNS provider factory
│   ├── encryption.ts          # AES-256-GCM encryption
│   └── prisma.ts              # Prisma client singleton
├── app/
│   └── api/
│       ├── listings/
│       │   ├── route.ts       # GET, POST listings
│       │   └── [id]/
│       │       ├── route.ts   # GET, PUT, DELETE listing
│       │       └── verify/
│       │           └── route.ts # POST verify domain
│       ├── rentals/
│       │   └── route.ts       # POST initiate rental
│       ├── check-availability/
│       │   └── route.ts       # POST check subdomain
│       └── webhooks/
│           └── stripe/
│               └── route.ts   # POST Stripe webhooks
└── prisma/
    └── schema.prisma          # Database schema
```

---

## Support

For issues or questions, please refer to the main README.md or create an issue in the repository.
