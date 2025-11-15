import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// POST /api/check-availability - Check if subdomain is available
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { listingId, subdomain } = body;

    if (!listingId || !subdomain) {
      return NextResponse.json(
        { error: 'Missing required fields: listingId and subdomain' },
        { status: 400 }
      );
    }

    // Validate subdomain format (basic validation)
    const subdomainRegex = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i;
    if (!subdomainRegex.test(subdomain)) {
      return NextResponse.json(
        {
          available: false,
          reason: 'Invalid subdomain format. Use only alphanumeric characters and hyphens.',
        },
        { status: 200 }
      );
    }

    // Check if listing exists
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
        {
          available: false,
          reason: 'This domain listing is not currently active.',
        },
        { status: 200 }
      );
    }

    // Check if max subdomains reached
    if (listing._count.subdomainRentals >= listing.maxSubdomainsAllowed) {
      return NextResponse.json(
        {
          available: false,
          reason: 'Maximum subdomains reached for this domain.',
        },
        { status: 200 }
      );
    }

    // Check if subdomain is already taken
    const existingRental = await prisma.subdomainRental.findFirst({
      where: {
        listingId,
        subdomain,
        status: 'ACTIVE',
      },
    });

    if (existingRental) {
      return NextResponse.json(
        {
          available: false,
          reason: 'This subdomain is already taken.',
        },
        { status: 200 }
      );
    }

    // Subdomain is available
    return NextResponse.json({
      available: true,
      fullDomain: `${subdomain}.${listing.domainName}`,
      price: listing.pricePerSubdomain,
      pricingPeriod: listing.pricingPeriod,
    });
  } catch (error) {
    console.error('Error checking availability:', error);
    return NextResponse.json(
      { error: 'Failed to check availability' },
      { status: 500 }
    );
  }
}
