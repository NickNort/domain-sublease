import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { encrypt } from '@/lib/encryption';
import { randomBytes } from 'crypto';
import { validateCredentials } from '@/lib/dns';

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
      apiCredentials, // { apiToken, zoneId } for Cloudflare, etc.
      allowedRecordTypes, // ['A', 'CNAME', 'TXT']
      maxSubdomainsAllowed,
    } = body;

    // Validate required fields
    if (!userId || !domainName || !pricePerSubdomain || !registrar || !apiCredentials || !maxSubdomainsAllowed) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate allowed record types
    if (!allowedRecordTypes || !Array.isArray(allowedRecordTypes) || allowedRecordTypes.length === 0) {
      return NextResponse.json(
        { error: 'allowedRecordTypes must be a non-empty array' },
        { status: 400 }
      );
    }

    const validRecordTypes = ['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'NS'];
    const invalidTypes = allowedRecordTypes.filter((type: string) => !validRecordTypes.includes(type));
    if (invalidTypes.length > 0) {
      return NextResponse.json(
        { error: `Invalid record types: ${invalidTypes.join(', ')}` },
        { status: 400 }
      );
    }

    // Encrypt API credentials
    const encryptedCredentials = encrypt(JSON.stringify(apiCredentials));

    // Validate API credentials by attempting to connect
    const credentialsValid = await validateCredentials(
      registrar.toUpperCase(),
      encryptedCredentials
    );

    if (!credentialsValid.valid) {
      return NextResponse.json(
        { error: `Invalid API credentials: ${credentialsValid.error}` },
        { status: 400 }
      );
    }

    // Generate verification token (random 32-byte hex string)
    const verificationToken = randomBytes(32).toString('hex');

    // Extract zoneId from credentials if available (for Cloudflare/Route53)
    const zoneId = apiCredentials.zoneId || apiCredentials.hostedZoneId || null;

    // Create listing with unverified status
    const listing = await prisma.domainListing.create({
      data: {
        userId,
        domainName,
        pricePerSubdomain,
        pricingPeriod: pricingPeriod || 'MONTHLY',
        registrar: registrar.toUpperCase(),
        apiCredentialsEncrypted: encryptedCredentials,
        zoneId,
        allowedRecordTypes,
        maxSubdomainsAllowed,
        isVerified: false,
        verificationToken,
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

    // Return response with verification instructions
    const response = {
      id: listing.id,
      domainName: listing.domainName,
      pricePerSubdomain: listing.pricePerSubdomain,
      pricingPeriod: listing.pricingPeriod,
      registrar: listing.registrar,
      allowedRecordTypes: listing.allowedRecordTypes,
      maxSubdomainsAllowed: listing.maxSubdomainsAllowed,
      isVerified: listing.isVerified,
      verificationToken: listing.verificationToken,
      verificationInstructions: {
        message: 'To verify domain ownership, add a TXT record to your domain with the following details:',
        recordType: 'TXT',
        recordName: '_domain-verification',
        recordValue: verificationToken,
        nextStep: `After adding the TXT record, call POST /api/listings/${listing.id}/verify to complete verification.`,
      },
      user: listing.user,
      createdAt: listing.createdAt,
    };

    return NextResponse.json(response, { status: 201 });
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
