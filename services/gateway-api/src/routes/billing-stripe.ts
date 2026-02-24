import Stripe from "stripe";
import { stripeSecretKey } from "../config.js";

export const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

export function billingBaseUrl(): string {
  return process.env.MCP_URL || `http://localhost:${process.env.PORT || 3000}`;
}
