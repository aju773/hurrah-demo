"use client";

/** A friendly failure message with Retry, for anything in the journey that
 * couldn't be loaded or sent. Whatever the customer had entered stays put; Retry
 * just tries the same thing again. */
export default function LoadFailure({ message, retryLabel, onRetry, className = "" }) {
  return (
    <div role="alert" className={`flex flex-wrap items-center gap-[12px] text-[#b0001d] text-[14px] ${className}`}>
      <span>{message}</span>
      <button
        type="button"
        onClick={onRetry}
        className="tap inline-flex items-center justify-center h-[36px] px-[14px] rounded-[8px] border border-[#b0001d] text-[#b0001d] text-[13px] font-semibold"
      >
        {retryLabel}
      </button>
    </div>
  );
}
