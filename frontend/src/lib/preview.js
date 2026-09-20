import { API_BASE_URL, FLYERS_SLUG } from "@/lib/api";
import { fetchWithTimeout } from "@/lib/network";

/** GET the step 2/3 preview payload (orders/views.ArtworkPreviewView): Front/
 * Back image URLs, geometry and Findings for the current slots/Size/size
 * choice. Shared by CheckAndPreviewStep (ticket 07) and ApproveAndConfirmStep
 * (ticket 10), which both draw the same server-rendered pages. Resolves null
 * when the payload can't be had (offline, server error, too slow): the steps
 * offer Retry. */
export async function fetchPreview({ frontId, backId, sameAsFront, sizeCode, sizeChoice }) {
  if (!frontId) return null;
  const params = new URLSearchParams({ front: frontId });
  if (sameAsFront) params.set("same_as_front", "true");
  else if (backId) params.set("back", backId);
  if (sizeCode) params.set("size", sizeCode);
  if (sizeChoice?.choice === "keep_size_scale") {
    params.set("resize_mode", sizeChoice.mode);
    params.set("resize_applies_to", sizeChoice.applies_to.join(","));
  }
  try {
    const res = await fetchWithTimeout(`${API_BASE_URL}/api/products/${FLYERS_SLUG}/preview/?${params}`, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
