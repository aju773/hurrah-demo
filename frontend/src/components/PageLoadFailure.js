"use client";

import LoadFailure from "./LoadFailure";

/** LoadFailure for a page whose data is fetched on the server: Retry loads the page again. */
export default function PageLoadFailure({ message, retryLabel }) {
  return <LoadFailure message={message} retryLabel={retryLabel} onRetry={() => window.location.reload()} />;
}
