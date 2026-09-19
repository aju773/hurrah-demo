import { Suspense } from "react";
import { Link } from "@/i18n/navigation";
import ArtworkSlots from "@/components/ArtworkSlots";
import { API_BASE_URL, FLYERS_SLUG } from "@/lib/api";

async function getProduct() {
  const res = await fetch(`${API_BASE_URL}/api/products/${FLYERS_SLUG}/`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}

export default async function UploadPage() {
  const product = await getProduct();

  return (
    <div className="relative mx-auto bg-[#f9f9ff]" style={{ maxWidth: "1512px" }}>
      <div className="flex flex-col gap-[20px] px-[32px] py-[26px] w-full">
        <div className="flex items-center justify-between">
          <h1 className="text-[#151c27] text-[22px] font-bold">
            Step 1: Upload your artwork {product?.name ? `for ${product.name}` : ""}
          </h1>
          <Link href="/" className="text-[#575c64] text-[13px] font-semibold underline">
            Back to Configurator
          </Link>
        </div>

        <Suspense fallback={<p className="text-[#575c64] text-[14px]">Loading…</p>}>
          {product ? (
            <ArtworkSlots productId={product.id} />
          ) : (
            <p className="text-[#bb0027] text-[14px]">Could not reach the server. Is the Django backend running?</p>
          )}
        </Suspense>
      </div>
    </div>
  );
}
