import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import Stripe from 'stripe';

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
      rentalPeriodStart,
      rentalPeriodEnd,
    } = metadata;

    // Get the payment intent to get amount
    let amount = 0;
    if (session.payment_intent) {
      const paymentIntent = await stripe.paymentIntents.retrieve(
        session.payment_intent as string
      );
      amount = paymentIntent.amount / 100; // Convert from cents
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
        rentalPeriodStart: new Date(rentalPeriodStart),
        rentalPeriodEnd: new Date(rentalPeriodEnd),
        status: 'ACTIVE',
        stripeSubscriptionId: session.subscription as string | null,
      },
    });

    // Create transaction record
    await prisma.transaction.create({
      data: {
        rentalId: rental.id,
        amount,
        stripePaymentIntentId: session.payment_intent as string,
        status: 'COMPLETED',
      },
    });

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
    });

    if (rental) {
      await prisma.subdomainRental.update({
        where: { id: rental.id },
        data: { status: 'CANCELLED' },
      });
    }

    console.log('Subscription deleted:', subscription.id);
  } catch (error) {
    console.error('Error handling subscription deleted:', error);
    throw error;
  }
}
