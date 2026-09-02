// The gallery's second client component, and the reason is the one StateFlip
// gives for the first: three of this part's states exist only under a pointer
// or a keyboard, and the fourth is what a press leaves behind. A row of chips
// with no handler would be four pictures of a control and a dead control.
//
// IT IS NOT THE FILTER. `/work`'s two rows are rendered by WorkFilters, live,
// in the WorkList section above this one — that is where a reader presses a
// chip and watches the list and the counter change. This is the state chart:
// every treatment the inventory names, side by side, at rest.

"use client";

import { useState } from "react";

import { FilterChip } from "@/components/work/FilterChip";

/**
 * One chip of each kind, pressable, so the inventory's states can be compared.
 *
 * TWO AXES AGAIN, BECAUSE THE PART HAS TWO SHAPES. The upper row is the stack
 * chip — a word and a sentinel; the lower is the status chip, which carries a
 * count. `IN BUILD 00` is in the second on purpose: a status chip with no rows
 * behind it is a legitimate control, because its vocabulary is the contract's
 * enum rather than whatever the answer held. That asymmetry is the one
 * lib/work/counts.ts and lib/work/stacks.ts argue out between them.
 */
export function ChipStates() {
  const [stack, setStack] = useState("any");
  const [status, setStatus] = useState("all");

  return (
    <div className="work-filters">
      <span className="work-filter-label">STACK</span>
      <div className="work-chips">
        {[
          { key: "any", label: "ANY", sentinel: true },
          { key: "go", label: "Go", sentinel: false },
          { key: "docker", label: "Docker", sentinel: false },
        ].map((chip) => (
          <FilterChip
            key={chip.key}
            label={chip.label}
            pressed={stack === chip.key}
            sentinel={chip.sentinel}
            onPress={() => {
              setStack(chip.key);
            }}
          />
        ))}
      </div>

      <span className="work-filter-label">STATUS</span>
      <div className="work-chips">
        {[
          { key: "all", label: "ALL", count: "03", sentinel: true },
          { key: "live", label: "LIVE", count: "01", sentinel: false },
          { key: "in_build", label: "IN BUILD", count: "00", sentinel: false },
        ].map((chip) => (
          <FilterChip
            key={chip.key}
            label={chip.label}
            count={chip.count}
            pressed={status === chip.key}
            sentinel={chip.sentinel}
            onPress={() => {
              setStatus(chip.key);
            }}
          />
        ))}
      </div>
    </div>
  );
}
