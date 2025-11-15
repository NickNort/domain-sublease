import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-01-27.acacia',
});

// POST /api/rentals - Initiate rental (creates Stripe session)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      listingId,
      renterUserId,
      subdomain,
      dnsRecordType,
      dnsRecordValue,
      rentalPeriodMonths = 1,
    } = body;

    // Validate required fields
    if (!listingId || !renterUserId || !subdomain || !dnsRecordType || !dnsRecordValue) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Get listing details
    const listing = await prisma.domainListing.findUnique({
      where: { id: listingId },
      include: {
        _count: {
          select: {
            subdomainRentals: {
              where: {
                status: 'ACTIVE',
              },
            },
          },
        },
      },
    });

    if (!listing) {
      return NextResponse.json(
        { error: 'Listing not found' },
        { status: 404 }
      );
    }

    if (listing.status !== 'ACTIVE') {
      return NextResponse.json(
        { error: 'Listing is not active' },
        { status: 400 }
      );
    }

    // Check if subdomain is available
    const existingRental = await prisma.subdomainRental.findFirst({
      where: {
        listingId,
        subdomain,
        status: 'ACTIVE',
      },
    });

    if (existingRental) {
      return NextResponse.json(
        { error: 'Subdomain is already rented' },
        { status: 409 }
      );
    }

    // Check if max subdomains reached
    if (listing._count.subdomainRentals >= listing.maxSubdomainsAllowed) {
      return NextResponse.json(
        { error: 'Maximum subdomains reached for this domain' },
        { status: 400 }
      );
    }

    // Get or create renter user
    const renter = await prisma.user.findUnique({
      where: { id: renterUserId },
    });

    if (!renter) {
      return NextResponse.json(
        { error: 'Renter user not found' },
        { status: 404 }
      );
    }

    const fullDomain = `${subdomain}.${listing.domainName}`;

    // Calculate amount in cents
    const amount = Math.round(Number(listing.pricePerSubdomain) * 100);

    // Determine subscription interval
    const interval: 'month' | 'year' = listing.pricingPeriod === 'MONTHLY' ? 'month' : 'year';

    // Get or create Stripe customer
    let customerId = renter.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: renter.email,
        metadata: {
          userId: renter.id,
        },
      });
      customerId = customer.id;

      // Update user with Stripe customer ID
      await prisma.user.update({
        where: { id: renter.id },
        data: { stripeCustomerId: customerId },
      });
    }

    // Create Stripe checkout session with subscription mode
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Subdomain: ${fullDomain}`,
              description: `${listing.pricingPeriod.toLowerCase()} subdomain rental`,
            },
            unit_amount: amount,
            recurring: {
              interval,
            },
          },
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/rentals/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/listings/${listingId}`,
      metadata: {
        listingId,
        renterUserId,
        subdomain,
        fullDomain,
        dnsRecordType,
        dnsRecordValue,
      },
    });

    return NextResponse.json({
      sessionId: session.id,
      sessionUrl: session.url,
    });
  } catch (error: any) {
    console.error('Error creating rental:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create rental' },
      { status: 500 }
    );
  }
}
