import { json } from "@sveltejs/kit";
function GET() {
  return json({ status: "ok", service: "frontendA-it-console" });
}
export {
  GET
};
