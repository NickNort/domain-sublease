import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/rentals/my-rentals - User's active rentals
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    const rentals = await prisma.subdomainRental.findMany({
      where: {
        renterUserId: userId,
      },
      include: {
        listing: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
              },
            },
          },
        },
        transactions: {
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Sanitize listings to remove encrypted credentials
    const sanitizedRentals = rentals.map(rental => ({
      ...rental,
      listing: {
        ...rental.listing,
        apiCredentialsEncrypted: undefined,
      },
    }));

    return NextResponse.json(sanitizedRentals);
  } catch (error) {
    console.error('Error fetching rentals:', error);
    return NextResponse.json(
      { error: 'Failed to fetch rentals' },
      { status: 500 }
    );
  }
}
