import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { encrypt } from '@/lib/encryption';

// GET /api/listings/:id - Get specific listing details
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    const listing = await prisma.domainListing.findUnique({
      where: { id },
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
    });

    if (!listing) {
      return NextResponse.json(
        { error: 'Listing not found' },
        { status: 404 }
      );
    }

    // Don't expose encrypted credentials
    const sanitizedListing = {
      ...listing,
      apiCredentialsEncrypted: undefined,
      availableSubdomains: listing.maxSubdomainsAllowed - listing._count.subdomainRentals,
    };

    return NextResponse.json(sanitizedListing);
  } catch (error) {
    console.error('Error fetching listing:', error);
    return NextResponse.json(
      { error: 'Failed to fetch listing' },
      { status: 500 }
    );
  }
}

// PUT /api/listings/:id - Update listing
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();

    const {
      pricePerSubdomain,
      pricingPeriod,
      apiCredentials,
      maxSubdomainsAllowed,
      status,
    } = body;

    // Check if listing exists
    const existingListing = await prisma.domainListing.findUnique({
      where: { id },
    });

    if (!existingListing) {
      return NextResponse.json(
        { error: 'Listing not found' },
        { status: 404 }
      );
    }

    const updateData: any = {};

    if (pricePerSubdomain !== undefined) {
      updateData.pricePerSubdomain = pricePerSubdomain;
    }

    if (pricingPeriod !== undefined) {
      updateData.pricingPeriod = pricingPeriod.toUpperCase();
    }

    if (apiCredentials !== undefined) {
      updateData.apiCredentialsEncrypted = encrypt(JSON.stringify(apiCredentials));
    }

    if (maxSubdomainsAllowed !== undefined) {
      updateData.maxSubdomainsAllowed = maxSubdomainsAllowed;
    }

    if (status !== undefined) {
      updateData.status = status.toUpperCase();
    }

    const listing = await prisma.domainListing.update({
      where: { id },
      data: updateData,
      include: {
        user: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    // Don't expose encrypted credentials
    const sanitizedListing = {
      ...listing,
      apiCredentialsEncrypted: undefined,
    };

    return NextResponse.json(sanitizedListing);
  } catch (error) {
    console.error('Error updating listing:', error);
    return NextResponse.json(
      { error: 'Failed to update listing' },
      { status: 500 }
    );
  }
}

// DELETE /api/listings/:id - Remove listing
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    // Check if listing exists
    const existingListing = await prisma.domainListing.findUnique({
      where: { id },
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

    if (!existingListing) {
      return NextResponse.json(
        { error: 'Listing not found' },
        { status: 404 }
      );
    }

    // Prevent deletion if there are active rentals
    if (existingListing._count.subdomainRentals > 0) {
      return NextResponse.json(
        { error: 'Cannot delete listing with active rentals' },
        { status: 400 }
      );
    }

    await prisma.domainListing.delete({
      where: { id },
    });

    return NextResponse.json({ message: 'Listing deleted successfully' });
  } catch (error) {
    console.error('Error deleting listing:', error);
    return NextResponse.json(
      { error: 'Failed to delete listing' },
      { status: 500 }
    );
  }
}
