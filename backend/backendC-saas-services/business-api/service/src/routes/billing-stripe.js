import Stripe from "stripe";
import { stripeSecretKey } from "../config.js";

export const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

export function billingBaseUrl() {
  if (!process.env.MCP_URL) {
    throw new Error("Missing required environment variable: MCP_URL");
  }
  return process.env.MCP_URL;
}
