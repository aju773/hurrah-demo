import { API_BASE_URL, FLYERS_SLUG } from "@/lib/api";

// The Commerce switch lives on the server and rides in the catalogue payload.
// Pages that don't already fetch the catalogue (home, order confirmation) ask
// for it here. Fails closed: if the API can't be reached, money stays hidden.
export async function fetchCommerceEnabled() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/products/${FLYERS_SLUG}/catalogue/`, { cache: "no-store" });
    if (!res.ok) return false;
    const data = await res.json();
    return data.commerce_enabled === true;
  } catch {
    return false;
  }
}
