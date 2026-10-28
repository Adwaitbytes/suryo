"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils";

/** Size selection for the demo store. Checkout is intentionally off; the button says so instead of pretending. */
export function SizePicker({ sizes, finalSale }: { sizes: string[]; finalSale: boolean }) {
  const oneSize = sizes.length === 1;
  const [size, setSize] = useState<string | null>(oneSize ? sizes[0] : null);
  const [note, setNote] = useState<string | null>(null);
  const noteId = useId();

  const add = () => {
    if (!size) {
      setNote("Pick a size first.");
      return;
    }
    setNote("This is a demo store, so checkout is switched off. Ask Meera about an existing order instead.");
  };

  return (
    <div>
      {oneSize ? (
        <p className="text-[13px] text-[#201b16]/60">One size</p>
      ) : (
        <fieldset>
          <legend className="flex w-full items-baseline justify-between text-[13px] font-medium text-[#201b16]">
            Size
            <span className="font-normal text-[#201b16]/55">{size ? `Selected ${size}` : "Indian sizing"}</span>
          </legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {sizes.map((s) => (
              <label key={s} className="relative">
                <input
                  type="radio"
                  name="size"
                  value={s}
                  checked={size === s}
                  onChange={() => {
                    setSize(s);
                    setNote(null);
                  }}
                  className="peer sr-only"
                />
                <span
                  className={cn(
                    "grid h-11 min-w-12 cursor-pointer place-items-center rounded-full border px-4 text-[14px] transition-[background-color,border-color,color] duration-150",
                    "border-[#201b16]/15 text-[#201b16] hover:border-[#201b16]/45",
                    "peer-checked:border-[#201b16] peer-checked:bg-[#201b16] peer-checked:text-[#f6f1ea]",
                    "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#a8461f]",
                  )}
                >
                  {s}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <button
        type="button"
        onClick={add}
        aria-describedby={note ? noteId : undefined}
        className="mt-6 h-12 w-full rounded-full bg-[#201b16] text-[15px] font-medium text-[#f6f1ea] transition-[background-color,transform] duration-150 hover:bg-[#3a3128] active:scale-[0.99]"
      >
        Add to bag
      </button>
      <p id={noteId} role="status" className={cn("mt-3 min-h-5 text-[13px] leading-relaxed", note ? "text-[#8f3a17]" : "text-[#201b16]/55")}>
        {note ?? (finalSale ? "Final sale. This piece cannot be returned or exchanged." : "Free size exchange within 15 days of delivery.")}
      </p>
    </div>
  );
}
