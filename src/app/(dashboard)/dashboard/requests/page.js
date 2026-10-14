"use client";

import RequestDetailsTab from "../usage/components/RequestDetailsTab";

export default function RequestsPage() {
  return (
    <div className="px-1 sm:px-0">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-text-main">Requests</h1>
        <p className="text-sm text-text-muted">All gateway requests with model, provider, account, cache and latency.</p>
      </div>
      <RequestDetailsTab />
    </div>
  );
}
