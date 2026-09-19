"use client";

// Small widgets shared by the step 2 previews and the enlarged view (ticket
// 08): the active/inactive pill button and the trim/bleed/safe-area legend.

export function ToggleButton({ active, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`h-[32px] px-[12px] rounded-[8px] text-[12px] font-semibold ${active ? "bg-[#151c27] text-white" : "bg-white text-[#151c27] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)]"}`}
    >
      {label}
    </button>
  );
}

export function Legend({ t, missingBleedLabel }) {
  return (
    <div className="flex flex-wrap gap-[12px] text-[#575c64] text-[11px]">
      <LegendItem colour="#d7263d" dashed label={t("legendCut")} />
      <LegendItem colour="#2563eb" label={t("legendBleed")} />
      <LegendItem colour="#1f7a4d" dotted label={t("legendSafe")} />
      <LegendItem colour="#d7263d" thick label={missingBleedLabel} />
    </div>
  );
}

function LegendItem({ colour, label, dashed, dotted, thick }) {
  const style = {
    borderTopColor: colour,
    borderTopWidth: thick ? "4px" : "2px",
    borderTopStyle: dashed ? "dashed" : dotted ? "dotted" : "solid",
    opacity: thick ? 0.5 : 1,
  };
  return (
    <span className="flex items-center gap-[4px]">
      <i aria-hidden="true" className="inline-block w-[18px]" style={style} />
      {label}
    </span>
  );
}
