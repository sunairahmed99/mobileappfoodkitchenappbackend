import Stripe from 'stripe';
import dotenv from 'dotenv';
dotenv.config();

const stripeSecretKey = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy_key_placeholder';

export const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2024-12-18.acacia',
});

export const getStripePublishableKey = () =>
  process.env.STRIPE_PUBLISHABLE_KEY || 'pk_test_dummy_key_placeholder';
