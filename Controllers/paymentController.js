import { stripe, getStripePublishableKey } from '../Config/stripe.js';
import { handleControllerError } from '../Utils/errorResponse.js';

/**
 * @desc    Get Stripe Public Configuration
 * @route   GET /api/payment/config
 * @access  Public / Protected
 */
export const getStripeConfig = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      publishableKey: getStripePublishableKey(),
    });
  } catch (error) {
    return handleControllerError(res, error, 'Failed to fetch Stripe config');
  }
};

/**
 * @desc    Create Stripe PaymentIntent
 * @route   POST /api/payment/create-payment-intent
 * @access  Protected
 */
export const createPaymentIntent = async (req, res) => {
  try {
    const { amount, currency = 'usd', orderId, customerName, customerEmail } = req.body;

    const numAmount = Number(amount);
    if (!numAmount || isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'A valid payment amount greater than 0 is required.',
      });
    }

    // Amount in smallest unit (e.g., cents for USD/PKR)
    const amountInSmallestUnit = Math.round(numAmount * 100);

    // Idempotency Key ensures Stripe will NEVER charge twice for the exact same orderId
    const idempotencyKey = orderId ? `pi_order_${String(orderId).trim()}` : undefined;

    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: amountInSmallestUnit,
        currency: (currency || 'usd').toLowerCase(),
        metadata: {
          orderId: orderId || `ORD-${Date.now()}`,
          userId: req.user?._id?.toString() || '',
          customerName: customerName || req.user?.name || '',
          customerEmail: customerEmail || req.user?.email || '',
        },
        automatic_payment_methods: {
          enabled: true,
        },
      },
      idempotencyKey ? { idempotencyKey } : undefined
    );

    return res.status(200).json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status,
      alreadyPaid: paymentIntent.status === 'succeeded',
      publishableKey: getStripePublishableKey(),
    });
  } catch (error) {
    console.error('[StripeController] createPaymentIntent error:', error.message);
    if (error.type === 'StripeAuthenticationError') {
      return res.status(400).json({
        success: false,
        message: 'Stripe API key is invalid or in dummy mode. Please provide your real Stripe Secret Key.',
      });
    }
    return handleControllerError(res, error, 'Failed to initialize Stripe payment');
  }
};

/**
 * @desc    Verify Stripe Payment Status
 * @route   POST /api/payment/verify
 * @access  Protected
 */
export const verifyPayment = async (req, res) => {
  try {
    const { paymentIntentId } = req.body;

    if (!paymentIntentId) {
      return res.status(400).json({
        success: false,
        message: 'PaymentIntent ID is required.',
      });
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    return res.status(200).json({
      success: true,
      status: paymentIntent.status,
      paid: paymentIntent.status === 'succeeded',
      amount: paymentIntent.amount / 100,
      currency: paymentIntent.currency,
    });
  } catch (error) {
    return handleControllerError(res, error, 'Failed to verify payment with Stripe');
  }
};
