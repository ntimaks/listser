"use client";

import { useState } from "react";

// A read-only value with a copy button, e.g. a URL to paste elsewhere.
export default function CopyField({
  value,
  label,
}: {
  value: string;
  label: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex gap-2">
      <input
        readOnly
        value={value}
        aria-label={label}
        onFocus={(e) => e.currentTarget.select()}
        className="field min-w-0 flex-1"
      />
      <button type="button" onClick={copy} className="btn btn-acid shrink-0">
        {copied ? "COPIED" : "COPY"}
      </button>
    </div>
  );
}
