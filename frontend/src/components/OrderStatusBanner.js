"use client";

import { useEffect, useState } from "react";
import { API_BASE_URL } from "@/lib/api";

const POLL_MS = 10000;

/** The Order's status in plain words, kept current: staff changes appear here
 * without the customer reloading. Starts from the server-rendered message and
 * quietly keeps the last one if a poll fails. */
export default function OrderStatusBanner({ token, locale, initialMessage }) {
  const [message, setMessage] = useState(initialMessage);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch(`${API_BASE_URL}/api/orders/${token}/?locale=${locale}`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled && data.status_message) setMessage(data.status_message);
      } catch {
        // offline or the server is restarting: keep showing the last message.
      }
    }
    const timer = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [token, locale]);

  return (
    <div role="status" className="bg-[#e5f4ec] text-[#1f7a4d] rounded-[8px] px-[16px] py-[10px] text-[15px] font-semibold">
      {message}
    </div>
  );
}
