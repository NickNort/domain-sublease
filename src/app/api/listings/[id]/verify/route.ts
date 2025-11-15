import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createDNSProvider } from '@/lib/dns';

// POST /api/listings/:id/verify - Verify domain ownership
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Get the listing
    const listing = await prisma.domainListing.findUnique({
      where: { id },
    });

    if (!listing) {
      return NextResponse.json(
        { error: 'Listing not found' },
        { status: 404 }
      );
    }

    if (listing.isVerified) {
      return NextResponse.json({
        success: true,
        message: 'Domain is already verified',
        isVerified: true,
      });
    }

    if (!listing.verificationToken) {
      return NextResponse.json(
        { error: 'No verification token found for this listing' },
        { status: 400 }
      );
    }

    // Create DNS provider and verify ownership
    const dnsProvider = createDNSProvider(
      listing.registrar,
      listing.apiCredentialsEncrypted
    );

    const verificationResult = await dnsProvider.verifyOwnership(listing.verificationToken);

    if (!verificationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: verificationResult.error || 'Verification failed',
          instructions: {
            message: 'Please ensure you have added the TXT record to your domain:',
            recordType: 'TXT',
            recordName: '_domain-verification',
            recordValue: listing.verificationToken,
            note: 'DNS propagation may take a few minutes. Please wait and try again.',
          },
        },
        { status: 400 }
      );
    }

    // Update listing to verified
    const updatedListing = await prisma.domainListing.update({
      where: { id },
      data: {
        isVerified: true,
        verificationToken: null, // Clear the token after successful verification
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

    return NextResponse.json({
      success: true,
      message: 'Domain ownership verified successfully!',
      listing: {
        id: updatedListing.id,
        domainName: updatedListing.domainName,
        isVerified: updatedListing.isVerified,
        status: updatedListing.status,
        pricePerSubdomain: updatedListing.pricePerSubdomain,
        allowedRecordTypes: updatedListing.allowedRecordTypes,
        user: updatedListing.user,
      },
    });
  } catch (error) {
    console.error('Error verifying domain:', error);
    return NextResponse.json(
      { error: 'Failed to verify domain ownership' },
      { status: 500 }
    );
  }
}
