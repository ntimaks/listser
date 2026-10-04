"use client";

// A row of mutually exclusive options, styled like the 1–5 level pickers.
export default function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="t-meta">{label}</span>
      <div className="flex gap-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`btn btn-sm flex-1 ${value === o.value ? "btn-cobalt" : ""}`}
            aria-pressed={value === o.value}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
