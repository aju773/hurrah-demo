import { Link } from "@/i18n/navigation";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { API_BASE_URL } from "@/lib/api";

const PRODUCT_SLUG = "rounded-corner-spot-uv-matt-lamination-400gsm";

async function getProduct() {
  const res = await fetch(`${API_BASE_URL}/api/products/${PRODUCT_SLUG}/`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}

export default async function ProductPage() {
  const product = await getProduct();

  const name = product?.name ?? "Rounded Corner Spot UV Matt Lamination 400gsm";
  const sku = product?.sku ?? "HRH-BC-400UV-RND";
  const specLine = product?.spec_line ?? "4 Color • 2 Sides • Matt Lamination • Spot UV • Before Cutting: 9.5×6 cm";
  const basePrice = product?.base_price_aed ?? "110.00";

  return (
    <div className="relative mx-auto bg-[#f9f9ff]" style={{ width: "1512px" }}>
      <SiteHeader />

      <div className="flex flex-col" style={{ width: "1352px", margin: "0 auto" }}>
        {/* Trust & Certification Bar */}
        <div className="bg-[#f0f3ff] drop-shadow-[0px_1px_1px_rgba(0,0,0,0.05)] flex items-center justify-between py-[8px] w-full">
          <div className="flex gap-[16px] items-center">
            <div className="flex gap-[4px] items-center">
              <img src="/assets/6ba5e.svg" className="w-[15px] h-[13.5px]" alt="" />
              <span className="text-[#151c27] text-[12px] font-semibold whitespace-nowrap">Heidelberg Speedmaster XL 106 Presses</span>
            </div>
            <span className="text-[#e6bdbb] text-[12px]">•</span>
            <div className="flex gap-[4px] items-center">
              <img src="/assets/e820f.svg" className="w-[16.5px] h-[15.75px]" alt="" />
              <span className="text-[#151c27] text-[12px] font-semibold whitespace-nowrap">FOGRA 39 Certified Color Standard</span>
            </div>
            <span className="text-[#e6bdbb] text-[12px]">•</span>
            <div className="flex gap-[4px] items-center">
              <img src="/assets/6f0b9.svg" className="w-[12px] h-[15px]" alt="" />
              <span className="text-[#5d3f3e] text-[12px] whitespace-nowrap">24–48h Dispatch in Dubai &amp; Abu Dhabi</span>
            </div>
          </div>
          <div className="flex gap-[12px] items-center">
            <div className="flex gap-[4px] items-center">
              <img src="/assets/e45b5.svg" className="w-[15px] h-[15px]" alt="" />
              <span className="text-[#bb0027] text-[12px] whitespace-nowrap">Free Zero-Error Pre-Press Proof Check</span>
            </div>
            <span className="text-[#e6bdbb] text-[12px]">|</span>
            <a href="#" className="flex gap-[2px] items-center">
              <img src="/assets/891b5.svg" className="w-[13.333px] h-[13.333px]" alt="" />
              <span className="text-[#5d3f3e] text-[12px] whitespace-nowrap">Help Desk</span>
            </a>
          </div>
        </div>

        {/* Breadcrumb Bar */}
        <div className="flex items-center justify-between py-[12px] w-full">
          <div className="flex gap-[4px] items-center">
            <a href="#" className="flex gap-[4px] items-center">
              <img src="/assets/a2014.svg" className="w-[10.667px] h-[12px]" alt="" />
              <span className="text-[#5d3f3e] text-[12px]">Home</span>
            </a>
            <img src="/assets/cbf77.svg" className="w-[4.317px] h-[7px]" alt="" />
            <a href="#" className="text-[#5d3f3e] text-[12px]">Print Essentials</a>
            <img src="/assets/cbf77.svg" className="w-[4.317px] h-[7px]" alt="" />
            <a href="#" className="text-[#5d3f3e] text-[12px]">Business Cards</a>
            <img src="/assets/cbf77.svg" className="w-[4.317px] h-[7px]" alt="" />
            <span className="text-[#151c27] text-[12px] font-semibold whitespace-nowrap">{name}</span>
          </div>
          <div className="flex gap-[8px] items-center">
            <span className="bg-[#ffc72c] rounded-full w-[8px] h-[8px]"></span>
            <span className="text-[#5d3f3e] text-[11px] font-bold tracking-[0.55px] uppercase whitespace-nowrap">SKU: {sku}</span>
          </div>
        </div>

        {/* Main Configurator Layout */}
        <div className="flex flex-col" style={{ gap: "32px" }}>
          <div className="flex" style={{ gap: "20px" }}>
            {/* LEFT SIDEBAR */}
            <aside className="bg-white rounded-[12px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] overflow-clip flex flex-col shrink-0" style={{ width: "307px" }}>
              <div className="bg-[#f0f3ff] flex flex-col gap-[2px] p-[12px] w-full">
                <span className="text-[#5d3f3e] text-[10px] font-semibold tracking-[0.5px] uppercase">PRODUCT CATEGORIES</span>
                <div className="relative w-full">
                  <div className="bg-white flex h-[40px] items-center pl-[8px] pr-[32px] rounded-[8px] w-full">
                    <span className="text-[#151c27] text-[12px] truncate">All Commercial Products (19)</span>
                  </div>
                  <img src="/assets/03f7b.svg" className="absolute w-[6.75px] h-[13.425px]" style={{ right: "8px", top: "14px" }} alt="" />
                </div>
              </div>
              <div className="bg-white flex flex-col p-[12px] w-full">
                <div className="relative flex items-center w-full">
                  <div className="bg-[#f0f3ff] flex-1 h-[40px] pl-[36px] pr-[12px] flex items-center rounded-[8px]">
                    <span className="text-[#575c64] text-[12px]">Search in Product Name...</span>
                  </div>
                  <img src="/assets/43446.svg" className="absolute w-[13.5px] h-[13.5px]" style={{ left: "10px", top: "13px" }} alt="" />
                </div>
              </div>
              <div className="flex flex-col w-full" style={{ maxHeight: "720px", overflowY: "auto" }}>
                {[
                  "Door Hanger (Glossy 170gsm)",
                  "Simple Burger Box",
                  "Cone French Fries Box (Takeaway)",
                  "Fried Chicken Tray (indoor)",
                  "French Fries Tray (indoor)",
                  "Rounded Corner Gold Foil PET Glossy 760mic",
                  "Rounded Corner Spot UV Velvet 760mic",
                  "Rounded Corner Gold Foil Spot UV Velvet 760mic",
                ].map((label) => (
                  <a key={label} href="#" className="flex items-center justify-between px-[12px] py-[8px] w-full">
                    <span className="text-[#5d3f3e] text-[12px]">{label}</span>
                    <img src="/assets/c955a.svg" className="w-[4.317px] h-[7px] shrink-0" alt="" />
                  </a>
                ))}
                <a href="#" className="bg-[#2a313d] flex items-center justify-between p-[12px] w-full">
                  <div className="flex gap-[4px] items-center">
                    <span className="bg-[#ffc72c] rounded-full w-[4.86px] h-[6px]"></span>
                    <span className="text-[#ebf1ff] text-[12px] font-bold">{name}</span>
                  </div>
                  <img src="/assets/e5408.svg" className="w-[15px] h-[15px] shrink-0" alt="" />
                </a>
                {[
                  "Spot UV Matt Lamination 400gsm",
                  "Flyer DL (Glossy paper 115gsm)",
                  "Flyer DL (Glossy paper 170gsm)",
                  "Flyer DL (Wood Free paper 100gsm)",
                  "Flyer DL (Glossy paper 135gsm)",
                  "Business Card Box",
                  "Letterhead (Wood Free paper 120gsm)",
                  "Envelope (Wood Free paper 120gsm)",
                  "Fridge Magnet (Normal & Custom Die Cut)",
                  "Fried Chicken Box (Takeaway)",
                ].map((label) => (
                  <a key={label} href="#" className="flex items-center justify-between px-[12px] py-[8px] w-full">
                    <span className="text-[#5d3f3e] text-[12px]">{label}</span>
                    <img src="/assets/c955a.svg" className="w-[4.317px] h-[7px] shrink-0" alt="" />
                  </a>
                ))}
              </div>
            </aside>

            {/* RIGHT: header + config grid + dims table */}
            <section className="flex-1 flex flex-col" style={{ gap: "20px", minWidth: 0 }}>
              {/* Product Header Bar */}
              <div className="flex items-center justify-between w-full">
                <div className="flex-1 flex flex-col gap-[4px] min-w-0">
                  <h1 className="text-[#151c27] text-[28px] font-extrabold tracking-[-0.7px] leading-[36px]">{name}</h1>
                  <div className="flex flex-wrap items-center gap-[8px] text-[14px]">
                    <span className="text-[#575c64]">{specLine}</span>
                  </div>
                  <span className="bg-[#f0f3ff] inline-block px-[8px] py-[2px] rounded-[4px] text-[#151c27] text-[11px] font-bold tracking-[0.22px] w-fit">After Cutting: 9×5.5 cm (Rounded Corner)</span>
                </div>
                <div className="flex gap-[8px] items-center shrink-0">
                  <button className="bg-[#f0f3ff] flex gap-[4px] h-[40px] items-center px-[12px] rounded-[8px]">
                    <img src="/assets/467af.svg" className="w-[18.333px] h-[13.333px]" alt="" />
                    <span className="text-[#151c27] text-[12px]">Guides</span>
                    <img src="/assets/155c2.svg" className="w-[8px] h-[4.933px]" alt="" />
                  </button>
                  <button className="bg-[#f0f3ff] flex gap-[4px] h-[40px] items-center px-[8px] rounded-[8px]">
                    <img src="/assets/fabd8.svg" className="w-[15px] h-[15px]" alt="" />
                    <span className="text-[#5d3f3e] text-[12px]">Help</span>
                  </button>
                </div>
              </div>

              {/* Configuration Grid */}
              <div className="grid grid-cols-12 gap-[20px] w-full">
                <div className="col-span-7 flex flex-col gap-[16px]">
                  <div className="bg-[#f0f3ff] grid grid-cols-12 gap-[12px] p-[12px] rounded-[12px] w-full">
                    <div className="col-span-5 flex flex-col gap-[4px] self-center">
                      <span className="text-[#5d3f3e] text-[10px] font-bold tracking-[0.5px] uppercase">QUANTITY</span>
                      <div className="bg-white flex items-center p-[4px] rounded-[8px] shadow-[0px_1px_1px_rgba(0,0,0,0.05)] w-full">
                        <button className="bg-[#f0f3ff] flex h-[36px] items-center justify-center rounded-[4px] shrink-0 w-[26px]">
                          <img src="/assets/2ebfc.svg" className="w-[10.5px] h-[1.5px]" alt="minus" />
                        </button>
                        <div className="flex-1 flex items-center justify-center">
                          <span className="text-[#151c27] text-[16px] font-extrabold tracking-[-0.16px]">1000</span>
                        </div>
                        <button className="bg-[#f0f3ff] flex h-[36px] items-center justify-center rounded-[4px] shrink-0 w-[26px]">
                          <img src="/assets/68ed7.svg" className="w-[10.5px] h-[10.5px]" alt="plus" />
                        </button>
                      </div>
                    </div>
                    <div className="col-span-1 flex items-center justify-center self-center pt-[16px]">
                      <span className="text-[#575c64] text-[16px] font-bold">=</span>
                    </div>
                    <div className="col-span-3 flex flex-col gap-[4px] self-center">
                      <span className="text-[#5d3f3e] text-[10px] font-bold tracking-[0.5px] uppercase">CIRCULATION</span>
                      <div className="bg-white flex h-[44px] items-center justify-center px-[12px] rounded-[8px] shadow-[0px_1px_1px_rgba(0,0,0,0.05)] w-full">
                        <span className="text-[#bb0027] text-[16px] font-bold tracking-[-0.16px]">1000</span>
                      </div>
                    </div>
                    <div className="col-span-3 flex flex-col gap-[4px] self-center">
                      <div className="flex items-center justify-between w-full">
                        <span className="text-[#5d3f3e] text-[10px] font-bold tracking-[0.5px] uppercase">SERIES</span>
                        <img src="/assets/0cc83.svg" className="w-[11.667px] h-[11.667px]" alt="" />
                      </div>
                      <div className="bg-white flex items-center p-[4px] rounded-[8px] shadow-[0px_1px_1px_rgba(0,0,0,0.05)] w-full">
                        <button className="bg-[#f0f3ff] flex h-[36px] items-center justify-center rounded-[4px] shrink-0 w-[20px]">
                          <img src="/assets/6e324.svg" className="w-[9.333px] h-[1.333px]" alt="minus" />
                        </button>
                        <div className="flex-1 flex items-center justify-center">
                          <span className="text-[#151c27] text-[16px] font-bold">1</span>
                        </div>
                        <button className="bg-[#f0f3ff] flex h-[36px] items-center justify-center rounded-[4px] shrink-0 w-[20px]">
                          <img src="/assets/14ba0.svg" className="w-[9.333px] h-[9.333px]" alt="plus" />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-[12px] w-full">
                    <div className="bg-[#f0f3ff] flex-1 flex flex-col gap-[4px] pb-[14px] pt-[12px] px-[12px] rounded-[12px]">
                      <span className="text-[#5d3f3e] text-[10px] font-bold tracking-[0.5px] uppercase">TURNAROUND SPEED</span>
                      <div className="flex gap-[4px] w-full">
                        <button className="bg-white flex gap-[4px] h-[40px] items-center justify-center px-[26px] rounded-[8px] shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
                          <span className="bg-[#ffc72c] rounded-full w-[8px] h-[8px]"></span>
                          <span className="text-[#151c27] text-[12px]">Normal</span>
                        </button>
                        <button className="flex gap-[4px] h-[40px] items-center justify-center px-[9px] rounded-[8px]">
                          <img src="/assets/c79ca.svg" className="w-[10.667px] h-[13.333px]" alt="" />
                          <span className="text-[#5d3f3e] text-[12px]">Express 24h</span>
                        </button>
                      </div>
                    </div>
                    <div className="bg-[#f0f3ff] flex-1 flex flex-col gap-[4px] p-[12px] rounded-[12px]">
                      <div className="flex items-center justify-between w-full">
                        <span className="text-[#5d3f3e] text-[10px] font-bold tracking-[0.5px] uppercase">PRINTED SIDE</span>
                        <img src="/assets/0cc83.svg" className="w-[11.667px] h-[11.667px]" alt="" />
                      </div>
                      <div className="flex gap-[4px] w-full">
                        <button className="bg-white flex h-[40px] items-center justify-center px-[11px] rounded-[8px] shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
                          <span className="text-[#151c27] text-[12px]">Front and back</span>
                        </button>
                        <button className="flex h-[40px] items-center justify-center px-[25px] rounded-[8px]">
                          <span className="text-[#5d3f3e] text-[12px]">Front only</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#f0f3ff] flex flex-col gap-[8px] p-[12px] rounded-[12px] w-full">
                    <div className="flex items-center justify-between w-full">
                      <p className="text-[14px] text-[#151c27]">Process Duration: <span className="text-[#bb0027] font-bold underline">2 Business Day(s)</span></p>
                      <span className="bg-white px-[8px] py-[2px] rounded-[4px] text-[#5d3f3e] text-[11px] font-bold tracking-[0.22px] shadow-[0px_1px_1px_rgba(0,0,0,0.05)] whitespace-nowrap">Dubai Hub Dispatch</span>
                    </div>
                    <div className="bg-white flex flex-col rounded-[8px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] w-full overflow-hidden">
                      <div className="bg-[#e7eefe] flex p-[8px] w-full">
                        <span className="flex-1 text-center text-[#5d3f3e] text-[11px] font-bold tracking-[0.55px] uppercase">PRINTED SIDE</span>
                        <span className="flex-1 text-center text-[#5d3f3e] text-[11px] font-bold tracking-[0.55px] uppercase">NORMAL TURNAROUND</span>
                      </div>
                      <div className="bg-white flex p-[12px] w-full">
                        <span className="flex-1 text-center text-[#151c27] text-[12px] font-semibold">Front and back</span>
                        <div className="flex-1 flex gap-[4px] items-center justify-center">
                          <img src="/assets/80805.svg" className="w-[13.333px] h-[13.333px]" alt="" />
                          <span className="text-[#bb0027] text-[12px] font-bold">2 Business Day(s)</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="col-span-5 flex flex-col gap-[12px]">
                  <div className="relative aspect-[4/3] bg-[#f0f3ff] rounded-[12px] overflow-hidden w-full">
                    <img src="/assets/9eb98.png" className="absolute inset-0 w-full h-full object-cover" alt="Product showcase" />
                    <span className="absolute bg-[#bb0027] text-white text-[11px] font-bold tracking-[0.275px] uppercase px-[8px] py-[4px] rounded-full" style={{ left: "8px", top: "8px" }}>400GSM PREMIUM SILK</span>
                    <span className="absolute flex gap-[4px] items-center bg-white/90 backdrop-blur-sm px-[8px] py-[4px] rounded-full shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)]" style={{ right: "8px", top: "8px" }}>
                      <img src="/assets/4935d.svg" className="w-[11.667px] h-[11.083px]" alt="" />
                      <span className="text-[#151c27] text-[11px] font-bold tracking-[0.22px]">4.9 (184 reviews)</span>
                    </span>
                  </div>
                  <div className="flex gap-[8px] w-full">
                    <div className="aspect-video bg-[#f0f3ff] rounded-[8px] shrink-0 flex-1 overflow-hidden" style={{ boxShadow: "0 0 0 2px #bb0027, 0px 1px 2px 0px rgba(0,0,0,0.05)" }}>
                      <img src="/assets/63b8b.png" className="w-full h-full object-cover" alt="thumbnail 1" />
                    </div>
                    <div className="aspect-video bg-[#f0f3ff] rounded-[8px] shrink-0 flex-1 overflow-hidden shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)]">
                      <img src="/assets/3d10a.png" className="w-full h-full object-cover" alt="thumbnail 2" />
                    </div>
                    <div className="aspect-video bg-[#f0f3ff] rounded-[8px] shrink-0 flex-1 flex flex-col items-center justify-center p-[8px] gap-[4px] shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
                      <img src="/assets/01adc.svg" className="w-[14.667px] h-[18.333px]" alt="" />
                      <span className="text-[#151c27] text-[10px] font-bold tracking-[0.4px] text-center">Dieline Spec</span>
                      <span className="text-[#575c64] text-[10px] font-semibold tracking-[0.4px] text-center">PDF / AI Vector</span>
                    </div>
                  </div>
                  <div className="bg-[#f0f3ff] flex items-center justify-between p-[8px] rounded-[8px] w-full text-[12px]">
                    <a href="#" className="flex gap-[4px] items-center">
                      <img src="/assets/787e0.svg" className="w-[10.667px] h-[10.667px]" alt="" />
                      <span className="text-[#bb0027] font-semibold">Download Dieline</span>
                    </a>
                    <span className="text-[#e6bdbb]">•</span>
                    <a href="#" className="flex gap-[4px] items-center">
                      <img src="/assets/ab29c.svg" className="w-[12px] h-[12px]" alt="" />
                      <span className="text-[#bb0027] font-semibold">File Prep Guide</span>
                    </a>
                    <span className="text-[#e6bdbb]">•</span>
                    <span className="text-[#151c27] text-[10px] font-bold tracking-[0.4px]">PDF / AI / PSD</span>
                  </div>
                </div>
              </div>

              {/* Available Dimensions & Pricing Table */}
              <div className="flex flex-col gap-[12px] pt-[12px] w-full">
                <div className="flex items-center justify-between w-full">
                  <div className="flex gap-[4px] items-center">
                    <h2 className="text-[#151c27] text-[16px] font-bold tracking-[-0.16px]">Available Dimension(s):</h2>
                    <img src="/assets/f5460.svg" className="w-[13.333px] h-[13.333px]" alt="" />
                  </div>
                  <span className="text-[#5d3f3e] text-[11px] font-bold tracking-[0.22px]">All prices quoted in UAE Dirhams (AED)</span>
                </div>
                <div className="bg-white rounded-[12px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] w-full overflow-x-auto">
                  <table className="w-full text-left" style={{ minWidth: "700px" }}>
                    <thead>
                      <tr className="bg-[#f0f3ff]">
                        <th className="p-[12px] text-[#5d3f3e] text-[12px] font-bold">Dimension</th>
                        <th className="p-[12px] text-[#5d3f3e] text-[12px] font-bold text-center">Total Price Exclusive of Discount and VAT</th>
                        <th className="p-[12px] text-[#5d3f3e] text-[12px] font-bold text-right">Total Price INC. VAT</th>
                        <th className="p-[12px] text-[#5d3f3e] text-[12px] font-bold text-center">Selection</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="bg-white">
                        <td className="p-[12px]">
                          <div className="text-[#151c27] text-[14px] font-bold">After Cutting 90 × 55 mm</div>
                          <div className="text-[#575c64] text-[10px] font-semibold tracking-[0.4px]">Bleed size: 95 × 60 mm (Standard UAE Format)</div>
                        </td>
                        <td className="p-[12px] text-center">
                          <span className="text-[#575c64] text-[12px] line-through mr-[8px]">116.00 AED</span>
                          <span className="text-[#151c27] text-[14px] font-bold">{basePrice} AED</span>
                        </td>
                        <td className="p-[12px] text-right">
                          <span className="text-[#575c64] text-[12px] line-through mr-[8px]">121.80 AED</span>
                          <span className="text-[#bb0027] text-[16px] font-extrabold tracking-[-0.16px]">115.50 AED</span>
                        </td>
                        <td className="p-[12px] text-center">
                          <span className="inline-flex items-center justify-center bg-white border border-[#bb0027] rounded-full w-[20px] h-[20px]"><span className="bg-[#bb0027] rounded-full w-[12px] h-[12px]"></span></span>
                        </td>
                      </tr>
                      <tr style={{ background: "rgba(240,243,255,0.3)" }}>
                        <td className="p-[12px]">
                          <div className="text-[#151c27] text-[14px] font-bold">After Cutting 85 × 55 mm</div>
                          <div className="text-[#575c64] text-[10px] font-semibold tracking-[0.4px]">Bleed size: 90 × 60 mm (European Credit Card Size)</div>
                        </td>
                        <td className="p-[12px] text-center">
                          <span className="text-[#575c64] text-[12px] line-through mr-[8px]">110.00 AED</span>
                          <span className="text-[#151c27] text-[14px] font-bold">104.50 AED</span>
                        </td>
                        <td className="p-[12px] text-right">
                          <span className="text-[#575c64] text-[12px] line-through mr-[8px]">115.50 AED</span>
                          <span className="text-[#151c27] text-[16px] font-extrabold tracking-[-0.16px]">109.72 AED</span>
                        </td>
                        <td className="p-[12px] text-center">
                          <span className="inline-block bg-white border border-[#767676] rounded-full w-[20px] h-[20px]"></span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="bg-[#f0f3ff] flex items-center justify-between p-[12px] rounded-[12px] w-full">
                  <div className="flex gap-[8px] items-center">
                    <img src="/assets/ba848.svg" className="w-[16.667px] h-[16.667px]" alt="" />
                    <span className="text-[#5d3f3e] text-[12px]"><span className="font-bold">Up to 5.17% off</span> for online Orders. The crossed-out price is for email or in-person purchases.</span>
                  </div>
                  <span className="bg-[#ffc72c] px-[8px] py-[2px] rounded-[4px] text-[#6f5400] text-[11px] font-bold tracking-[0.55px] uppercase whitespace-nowrap">INSTANT WEB DISCOUNT APPLIED</span>
                </div>
                <div className="flex items-center justify-between pt-[8px] w-full flex-wrap gap-[12px]">
                  <div className="flex gap-[12px] items-center">
                    <button className="bg-[#f0f3ff] flex gap-[4px] h-[48px] items-center justify-center px-[16px] rounded-[12px]">
                      <img src="/assets/08d3b.svg" className="w-[16.667px] h-[16.667px]" alt="" />
                      <span className="text-[#151c27] text-[12px]">Request Free Sample Swatch</span>
                    </button>
                    <button className="bg-[#f0f3ff] flex h-[48px] items-center justify-center px-[12px] rounded-[12px]">
                      <img src="/assets/b28b4.svg" className="w-[18.333px] h-[16.821px]" alt="wishlist" />
                    </button>
                  </div>
                  <div className="flex gap-[12px] items-center justify-end">
                    <div className="text-right">
                      <div className="text-[#5d3f3e] text-[10px] font-semibold tracking-[0.4px]">Estimated Dispatch</div>
                      <div className="text-[#151c27] text-[12px] font-bold">Thu, 3:00 PM</div>
                    </div>
                    <Link
                      href="/order/upload"
                      className="bg-[#e51937] flex gap-[8px] h-[48px] items-center justify-center px-[40px] rounded-[12px] shadow-[0px_4px_6px_-1px_rgba(0,0,0,0.1),0px_2px_4px_-2px_rgba(0,0,0,0.1)]"
                    >
                      <img src="/assets/efd15.svg" className="w-[18.975px] h-[18.333px]" alt="" />
                      <span className="text-white text-[16px] font-extrabold tracking-[-0.16px] whitespace-nowrap">Start Ordering</span>
                    </Link>
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* Bottom Extended Detail & Technical Tabs */}
          <div className="bg-white rounded-[12px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] overflow-clip w-full">
            <div className="bg-[#f0f3ff] flex items-center overflow-x-auto px-[20px] w-full">
              <button className="flex gap-[4px] items-center pb-[14px] pt-[12px] px-[16px] border-b-2 border-transparent shrink-0">
                <img src="/assets/2d382.svg" className="w-[15px] h-[15px]" alt="" />
                <span className="text-[#5d3f3e] text-[12px] whitespace-nowrap">Explanation &amp; Specifications</span>
              </button>
              <button className="flex gap-[4px] items-center pb-[14px] pt-[12px] px-[16px] border-b-2 border-[#bb0027] shrink-0">
                <img src="/assets/997aa.svg" className="w-[15px] h-[15px]" alt="" />
                <span className="text-[#bb0027] text-[12px] font-bold whitespace-nowrap">Recommended Products</span>
                <span className="bg-[#bb0027] text-white text-[10px] font-semibold tracking-[0.4px] rounded-full px-[6px] py-[2px]">3</span>
              </button>
              <button className="flex gap-[4px] items-center pb-[14px] pt-[12px] px-[16px] border-b-2 border-transparent shrink-0">
                <img src="/assets/ce5e8.svg" className="w-[15px] h-[15px]" alt="" />
                <span className="text-[#5d3f3e] text-[12px] whitespace-nowrap">Artwork Guidelines</span>
              </button>
              <button className="flex gap-[4px] items-center pb-[14px] pt-[12px] px-[16px] border-b-2 border-transparent shrink-0">
                <img src="/assets/5316f.svg" className="w-[15px] h-[15px]" alt="" />
                <span className="text-[#5d3f3e] text-[12px] whitespace-nowrap">Verified Reviews (184)</span>
              </button>
            </div>
            <div className="flex flex-col gap-[16px] p-[24px] w-full">
              <div className="flex items-center justify-between w-full flex-wrap gap-[8px]">
                <div>
                  <h3 className="text-[#151c27] text-[20px] font-bold tracking-[-0.3px]">Corporate Stationery Suite</h3>
                  <p className="text-[#5d3f3e] text-[12px]">Pair your Spot UV Business Cards with matching executive print collateral</p>
                </div>
                <a href="#" className="flex gap-[4px] items-center text-[#bb0027] text-[12px]">
                  <span>View Full Brand Catalog</span>
                  <img src="/assets/57059.svg" className="w-[10.667px] h-[10.667px]" alt="" />
                </a>
              </div>
              <div className="flex gap-[16px] items-start justify-center w-full flex-wrap">
                {[
                  { tag: "Folders", img: "36d9b.png", cat: "STATIONERY", title: "A4 Presentation Folder with Spot UV & Business Card Slot", desc: "350gsm silk board, reinforced glued pocket.", price: "340.00" },
                  { tag: "Letterheads", img: "65e7d.png", cat: "CORRESPONDENCE", title: "Executive Letterhead (Wood Free 120gsm Uncoated)", desc: "Laser-printer safe, archival grade bright white.", price: "145.00" },
                  { tag: "Envelopes", img: "aff74.png", cat: "PACKAGING", title: "DL Self-Seal Envelopes (Full Color Offset Print)", desc: "Peel & seal adhesive strip, 120gsm bond paper.", price: "180.00" },
                ].map((card) => (
                  <div key={card.tag} className="bg-white shadow-[0px_1px_1px_rgba(0,0,0,0.05)] flex flex-col justify-between p-[12px] rounded-[12px]" style={{ width: "379px" }}>
                    <div className="flex flex-col gap-[8px] w-full">
                      <div className="relative bg-[#f0f3ff] rounded-[8px] overflow-hidden w-full" style={{ height: "266px" }}>
                        <img src={`/assets/${card.img}`} className="w-full h-full object-cover" alt={card.tag} />
                        <span className="absolute bg-[#2a313d] text-[#ebf1ff] text-[10px] font-semibold tracking-[0.4px] px-[8px] py-[2px] rounded-[4px]" style={{ left: "8px", top: "8px" }}>{card.tag}</span>
                      </div>
                      <span className="text-[#5d3f3e] text-[10px] font-semibold tracking-[0.5px] uppercase">{card.cat}</span>
                      <h4 className="text-[#151c27] text-[14px] font-bold">{card.title}</h4>
                      <p className="text-[#575c64] text-[12px]">{card.desc}</p>
                    </div>
                    <div className="flex items-center justify-between pt-[20px] w-full">
                      <div>
                        <div className="text-[#575c64] text-[10px] font-semibold tracking-[0.4px]">Starts at</div>
                        <div className="text-[#151c27] text-[16px] font-extrabold tracking-[-0.16px]">AED {card.price}</div>
                      </div>
                      <button className="bg-[#ffc72c] h-[36px] px-[12px] rounded-[8px] text-[#6f5400] text-[12px] font-bold">Configure</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}
