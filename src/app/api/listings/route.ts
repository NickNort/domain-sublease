import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { encrypt } from '@/lib/encryption';

// GET /api/listings - Browse available domains
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const registrar = searchParams.get('registrar');

    const where: any = {};

    if (status) {
      where.status = status.toUpperCase();
    }

    if (registrar) {
      where.registrar = registrar.toUpperCase();
    }

    const listings = await prisma.domainListing.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            email: true,
          },
        },
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
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Don't expose encrypted credentials
    const sanitizedListings = listings.map(listing => ({
      ...listing,
      apiCredentialsEncrypted: undefined,
      availableSubdomains: listing.maxSubdomainsAllowed - listing._count.subdomainRentals,
    }));

    return NextResponse.json(sanitizedListings);
  } catch (error) {
    console.error('Error fetching listings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch listings' },
      { status: 500 }
    );
  }
}

// POST /api/listings - Create new listing (domain owner)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      userId,
      domainName,
      pricePerSubdomain,
      pricingPeriod,
      registrar,
      apiCredentials,
      maxSubdomainsAllowed,
    } = body;

    // Validate required fields
    if (!userId || !domainName || !pricePerSubdomain || !registrar || !apiCredentials || !maxSubdomainsAllowed) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Encrypt API credentials
    const encryptedCredentials = encrypt(JSON.stringify(apiCredentials));

    // Create listing
    const listing = await prisma.domainListing.create({
      data: {
        userId,
        domainName,
        pricePerSubdomain,
        pricingPeriod: pricingPeriod || 'MONTHLY',
        registrar: registrar.toUpperCase(),
        apiCredentialsEncrypted: encryptedCredentials,
        maxSubdomainsAllowed,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    // Don't expose encrypted credentials in response
    const sanitizedListing = {
      ...listing,
      apiCredentialsEncrypted: undefined,
    };

    return NextResponse.json(sanitizedListing, { status: 201 });
  } catch (error: any) {
    console.error('Error creating listing:', error);

    if (error.code === 'P2002') {
      return NextResponse.json(
        { error: 'Domain name already exists' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create listing' },
      { status: 500 }
    );
  }
}
