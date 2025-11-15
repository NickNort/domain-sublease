import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import Stripe from 'stripe';
import { createDNSProvider } from '@/lib/dns';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-01-27.acacia',
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

// POST /api/webhooks/stripe - Stripe webhook handler
export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      return NextResponse.json(
        { error: 'Missing stripe-signature header' },
        { status: 400 }
      );
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message);
      return NextResponse.json(
        { error: `Webhook Error: ${err.message}` },
        { status: 400 }
      );
    }

    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
        break;

      case 'payment_intent.payment_failed':
        await handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  try {
    const metadata = session.metadata;

    if (!metadata) {
      console.error('No metadata in session');
      return;
    }

    const {
      listingId,
      renterUserId,
      subdomain,
      fullDomain,
      dnsRecordType,
      dnsRecordValue,
    } = metadata;

    // Get the subscription to determine pricing and period
    let amount = 0;
    let subscriptionId: string | null = null;
    let rentalPeriodStart = new Date();
    let rentalPeriodEnd = new Date();

    if (session.subscription) {
      const subscription = await stripe.subscriptions.retrieve(
        session.subscription as string
      );

      subscriptionId = subscription.id;

      // Get amount from subscription
      if (subscription.items.data[0]) {
        amount = (subscription.items.data[0].price.unit_amount || 0) / 100;
      }

      // Calculate rental period based on subscription
      rentalPeriodStart = new Date(subscription.current_period_start * 1000);
      rentalPeriodEnd = new Date(subscription.current_period_end * 1000);
    }

    // Get listing with credentials
    const listing = await prisma.domainListing.findUnique({
      where: { id: listingId },
    });

    if (!listing) {
      console.error('Listing not found:', listingId);
      return;
    }

    // Check if listing is verified
    if (!listing.isVerified) {
      console.error('Cannot create DNS record for unverified listing:', listingId);
      return;
    }

    // Check if DNS record type is allowed
    if (!listing.allowedRecordTypes.includes(dnsRecordType as any)) {
      console.error(`DNS record type ${dnsRecordType} not allowed for listing ${listingId}`);
      return;
    }

    // Create DNS record
    let dnsRecordId: string | null = null;
    try {
      const dnsProvider = createDNSProvider(
        listing.registrar,
        listing.apiCredentialsEncrypted
      );

      const recordResult = await dnsProvider.createRecord({
        type: dnsRecordType as any,
        name: fullDomain,
        content: dnsRecordValue,
        ttl: 3600,
      });

      if (recordResult.success) {
        dnsRecordId = recordResult.recordId || null;
        console.log('DNS record created successfully:', dnsRecordId);
      } else {
        console.error('Failed to create DNS record:', recordResult.error);
        // Don't throw - we still want to create the rental record
        // The user can manually update DNS or we can retry later
      }
    } catch (dnsError) {
      console.error('Error creating DNS record:', dnsError);
      // Continue with rental creation
    }

    // Create rental record
    const rental = await prisma.subdomainRental.create({
      data: {
        listingId,
        renterUserId,
        subdomain,
        fullDomain,
        dnsRecordType: dnsRecordType as any,
        dnsRecordValue,
        rentalPeriodStart,
        rentalPeriodEnd,
        status: 'ACTIVE',
        stripeSubscriptionId: subscriptionId,
      },
    });

    // Create transaction record
    if (session.payment_intent) {
      await prisma.transaction.create({
        data: {
          rentalId: rental.id,
          amount,
          stripePaymentIntentId: session.payment_intent as string,
          status: 'COMPLETED',
        },
      });
    }

    console.log('Rental created successfully:', rental.id);
  } catch (error) {
    console.error('Error handling checkout session completed:', error);
    throw error;
  }
}

async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  try {
    // Update transaction status if exists
    const transaction = await prisma.transaction.findFirst({
      where: {
        stripePaymentIntentId: paymentIntent.id,
      },
    });

    if (transaction) {
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: { status: 'COMPLETED' },
      });
    }

    console.log('Payment intent succeeded:', paymentIntent.id);
  } catch (error) {
    console.error('Error handling payment intent succeeded:', error);
    throw error;
  }
}

async function handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent) {
  try {
    // Update transaction status if exists
    const transaction = await prisma.transaction.findFirst({
      where: {
        stripePaymentIntentId: paymentIntent.id,
      },
    });

    if (transaction) {
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: { status: 'FAILED' },
      });

      // Also mark the rental as cancelled
      await prisma.subdomainRental.update({
        where: { id: transaction.rentalId },
        data: { status: 'CANCELLED' },
      });
    }

    console.log('Payment intent failed:', paymentIntent.id);
  } catch (error) {
    console.error('Error handling payment intent failed:', error);
    throw error;
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  try {
    // Find rental with this subscription
    const rental = await prisma.subdomainRental.findFirst({
      where: {
        stripeSubscriptionId: subscription.id,
      },
      include: {
        listing: true,
      },
    });

    if (!rental) {
      console.log('No rental found for subscription:', subscription.id);
      return;
    }

    // Delete DNS record if listing is verified
    if (rental.listing.isVerified) {
      try {
        const dnsProvider = createDNSProvider(
          rental.listing.registrar,
          rental.listing.apiCredentialsEncrypted
        );

        // For deletion, we need the record ID
        // Since we don't store it, we'll need to find it by name and type
        const listResult = await dnsProvider.listRecords(rental.dnsRecordType);

        if (listResult.success && listResult.records) {
          // Find the record matching our subdomain
          const recordToDelete = listResult.records.find((record: any) => {
            // Different providers have different response formats
            const recordName = record.name || record.Name;
            return recordName === rental.fullDomain || recordName.startsWith(rental.subdomain);
          });

          if (recordToDelete) {
            const recordId = recordToDelete.id || recordToDelete.Id || `${rental.fullDomain}:${rental.dnsRecordType}`;
            const deleteResult = await dnsProvider.deleteRecord(recordId);

            if (deleteResult.success) {
              console.log('DNS record deleted successfully for:', rental.fullDomain);
            } else {
              console.error('Failed to delete DNS record:', deleteResult.error);
            }
          } else {
            console.log('DNS record not found for deletion:', rental.fullDomain);
          }
        }
      } catch (dnsError) {
        console.error('Error deleting DNS record:', dnsError);
        // Continue with rental cancellation even if DNS deletion fails
      }
    }

    // Update rental status
    await prisma.subdomainRental.update({
      where: { id: rental.id },
      data: { status: 'CANCELLED' },
    });

    console.log('Subscription deleted and rental cancelled:', subscription.id);
  } catch (error) {
    console.error('Error handling subscription deleted:', error);
    throw error;
  }
}
