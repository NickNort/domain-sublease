import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createDNSProvider } from '@/lib/dns';

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

    // Check if subdomain is already taken in database
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

    // Check DNS records to ensure subdomain doesn't already exist
    // This prevents conflicts with manually created records
    const fullDomain = `${subdomain}.${listing.domainName}`;

    if (listing.isVerified) {
      try {
        const dnsProvider = createDNSProvider(
          listing.registrar,
          listing.apiCredentialsEncrypted
        );

        const dnsResult = await dnsProvider.listRecords();

        if (dnsResult.success && dnsResult.records) {
          // Check if any DNS record exists for this subdomain
          const conflictingRecord = dnsResult.records.find((record: any) => {
            const recordName = record.name || record.Name;
            // Check for exact match or if the record name contains our subdomain
            return (
              recordName === fullDomain ||
              recordName === `${subdomain}.${listing.domainName}.` || // With trailing dot
              recordName.startsWith(`${subdomain}.`)
            );
          });

          if (conflictingRecord) {
            return NextResponse.json(
              {
                available: false,
                reason: 'A DNS record already exists for this subdomain. Please choose a different name.',
              },
              { status: 200 }
            );
          }
        }
      } catch (dnsError) {
        console.error('Error checking DNS records:', dnsError);
        // Don't fail the availability check if DNS lookup fails
        // The subdomain might still be available
      }
    }

    // Subdomain is available
    return NextResponse.json({
      available: true,
      fullDomain,
      price: listing.pricePerSubdomain,
      pricingPeriod: listing.pricingPeriod,
      allowedRecordTypes: listing.allowedRecordTypes,
    });
  } catch (error) {
    console.error('Error checking availability:', error);
    return NextResponse.json(
      { error: 'Failed to check availability' },
      { status: 500 }
    );
  }
}
