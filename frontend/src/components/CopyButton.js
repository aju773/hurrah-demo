"use client";

import { useState } from "react";

export default function CopyButton({ text, label, copiedLabel }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
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
