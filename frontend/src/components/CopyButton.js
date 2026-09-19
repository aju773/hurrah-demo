"use client";

import { useState } from "react";

// `text` is copied as is; with `copyPageLink` the current page's address is copied instead.
export default function CopyButton({ text, label, copiedLabel, copyPageLink = false }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(copyPageLink ? window.location.href : text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable — nothing to fall back to in this demo.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="h-[32px] px-[12px] rounded-[8px] text-[12px] font-semibold bg-[#f0f3ff] text-[#151c27]"
    >
      {copied ? copiedLabel : label}
    </button>
  );
}
