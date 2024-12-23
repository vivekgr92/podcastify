import Stripe from 'stripe';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16'
});

async function createProducts() {
  try {
    // Create Basic Plan
    const basicProduct = await stripe.products.create({
      name: 'Basic Plan',
      description: 'Convert up to 50 articles/month'
    });

    const basicPrice = await stripe.prices.create({
      product: basicProduct.id,
      unit_amount: 999, // $9.99
      currency: 'usd',
      recurring: {
        interval: 'month'
      }
    });

    // Create Pro Plan
    const proProduct = await stripe.products.create({
      name: 'Pro Plan',
      description: 'Convert up to 200 articles/month'
    });

    const proPrice = await stripe.prices.create({
      product: proProduct.id,
      unit_amount: 2499, // $24.99
      currency: 'usd',
      recurring: {
        interval: 'month'
      }
    });

    // Create Enterprise Plan
    const enterpriseProduct = await stripe.products.create({
      name: 'Enterprise Plan',
      description: 'Unlimited conversions'
    });

    const enterprisePrice = await stripe.prices.create({
      product: enterpriseProduct.id,
      unit_amount: 9999, // $99.99
      currency: 'usd',
      recurring: {
        interval: 'month'
      }
    });

    console.log('Created products and prices:');
    console.log('Basic Plan:');
    console.log(`- Product ID: ${basicProduct.id}`);
    console.log(`- Price ID: ${basicPrice.id}`);
    console.log('\nPro Plan:');
    console.log(`- Product ID: ${proProduct.id}`);
    console.log(`- Price ID: ${proPrice.id}`);
    console.log('\nEnterprise Plan:');
    console.log(`- Product ID: ${enterpriseProduct.id}`);
    console.log(`- Price ID: ${enterprisePrice.id}`);

  } catch (error) {
    console.error('Error creating products:', error);
    process.exit(1);
  }
}

createProducts();