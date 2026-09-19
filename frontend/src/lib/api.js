export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// The Flyers catalogue product: Options, Price grid and Artwork upload slots
// all key off this Product (seeded by orders migration 0006).
export const FLYERS_SLUG = "flyers";

export const SIDES_LABELS = {
  single: "Single side",
  double: "Front and Back",
};

export const ARTWORK_ERROR_MESSAGES = {
  not_a_pdf: "This file isn't a valid PDF.",
  too_many_pages: "Upload 1 or 2 pages.",
  back_one_page: "Back takes one page.",
  back_size_differs: "Back must be the same size as front.",
  file_unreadable: "We couldn't open this file (password-protected, damaged or not a PDF).",
  file_too_large: "Files can be up to 100 MB.",
};

// Matches the server-side limit in orders/design_request_views.py.
export const DESIGN_REQUEST_MAX_FILES = 3;
