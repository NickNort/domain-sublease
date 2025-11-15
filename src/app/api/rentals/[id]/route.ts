import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-01-27.acacia',
});

// PUT /api/rentals/:id - Update DNS records
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();

    const { dnsRecordType, dnsRecordValue } = body;

    // Check if rental exists
    const existingRental = await prisma.subdomainRental.findUnique({
      where: { id },
    });

    if (!existingRental) {
      return NextResponse.json(
        { error: 'Rental not found' },
        { status: 404 }
      );
    }

    if (existingRental.status !== 'ACTIVE') {
      return NextResponse.json(
        { error: 'Can only update active rentals' },
        { status: 400 }
      );
    }

    const updateData: any = {};

    if (dnsRecordType !== undefined) {
      updateData.dnsRecordType = dnsRecordType.toUpperCase();
    }

    if (dnsRecordValue !== undefined) {
      updateData.dnsRecordValue = dnsRecordValue;
    }

    const rental = await prisma.subdomainRental.update({
      where: { id },
      data: updateData,
      include: {
        listing: {
          select: {
            id: true,
            domainName: true,
            user: {
              select: {
                id: true,
                email: true,
              },
            },
          },
        },
        renter: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json(rental);
  } catch (error) {
    console.error('Error updating rental:', error);
    return NextResponse.json(
      { error: 'Failed to update rental' },
      { status: 500 }
    );
  }
}

// DELETE /api/rentals/:id - Cancel rental
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    // Get rental details
    const rental = await prisma.subdomainRental.findUnique({
      where: { id },
    });

    if (!rental) {
      return NextResponse.json(
        { error: 'Rental not found' },
        { status: 404 }
      );
    }

    // Cancel Stripe subscription if exists
    if (rental.stripeSubscriptionId) {
      try {
        await stripe.subscriptions.cancel(rental.stripeSubscriptionId);
      } catch (stripeError) {
        console.error('Error cancelling Stripe subscription:', stripeError);
        // Continue with cancellation even if Stripe fails
      }
    }

    // Update rental status
    const updatedRental = await prisma.subdomainRental.update({
      where: { id },
      data: {
        status: 'CANCELLED',
      },
      include: {
        listing: {
          select: {
            id: true,
            domainName: true,
          },
        },
      },
    });

    return NextResponse.json({
      message: 'Rental cancelled successfully',
      rental: updatedRental,
    });
  } catch (error) {
    console.error('Error cancelling rental:', error);
    return NextResponse.json(
      { error: 'Failed to cancel rental' },
      { status: 500 }
    );
  }
}
