export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// The Flyers catalogue product: Options, Price grid and Artwork upload slots
// all key off this Product (seeded by orders migration 0006).
export const FLYERS_SLUG = "flyers";

export const SIDES_LABELS = {
  single: "Single side",
  double: "Front and Back",
};

// Matches the server-side limit in orders/design_request_views.py.
export const DESIGN_REQUEST_MAX_FILES = 3;
