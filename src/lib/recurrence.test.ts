import { describe, expect, it } from "vitest";
import {
  addDays,
  dueLabel,
  isRecurring,
  localDate,
  nextDue,
  planRollover,
  repeatLabel,
  shortDate,
  upcomingDue,
  type DueFields,
} from "@/lib/recurrence";

const none: DueFields = {
  due_on: null,
  repeat_every: null,
  repeat_unit: null,
  repeat_from: null,
};

function task(
  fields: Partial<DueFields> & {
    id?: string;
    checked_at?: string | null;
    parent_item_id?: string | null;
  } = {}
) {
  return {
    id: "t1",
    checked_at: null,
    parent_item_id: null,
    ...none,
    ...fields,
  };
}

// Checked at midday UTC, so the calendar day is the same in whatever zone
// (within UTC±11) the tests run in.
const noon = (date: string) => `${date}T12:00:00Z`;

describe("addDays", () => {
  it("crosses month and year ends", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("is not thrown off by DST changes", () => {
    // Europe moves its clocks on 2026-03-29 and 2026-10-25.
    expect(addDays("2026-03-28", 1)).toBe("2026-03-29");
    expect(addDays("2026-03-28", 2)).toBe("2026-03-30");
    expect(addDays("2026-10-24", 7)).toBe("2026-10-31");
  });
});

describe("localDate", () => {
  it("places an instant on the calendar of the given zone", () => {
    const d = new Date("2026-10-14T22:30:00Z");
    expect(localDate(d, "UTC")).toBe("2026-10-14");
    expect(localDate(d, "Europe/Riga")).toBe("2026-10-15");
    expect(localDate(d, "America/Los_Angeles")).toBe("2026-10-14");
  });
});

describe("isRecurring", () => {
  it("needs a due date and all three repeat fields", () => {
    const full = { due_on: "2026-10-01", repeat_every: 1, repeat_unit: "week", repeat_from: "schedule" } as const;
    expect(isRecurring(full)).toBe(true);
    expect(isRecurring({ ...full, due_on: null })).toBe(false);
    expect(isRecurring({ ...full, repeat_every: null })).toBe(false);
    expect(isRecurring({ ...full, repeat_unit: null })).toBe(false);
    expect(isRecurring({ ...full, repeat_from: null })).toBe(false);
  });
});

describe("nextDue", () => {
  const weekly = { due_on: "2026-10-05", repeat_every: 1, repeat_unit: "week", repeat_from: "schedule" } as const;

  it("is null for an unchecked or one-off task", () => {
    expect(nextDue(task(weekly), "UTC")).toBeNull();
    expect(nextDue(task({ due_on: "2026-10-05", checked_at: noon("2026-10-05") }), "UTC")).toBeNull();
  });

  describe("from schedule", () => {
    it("checked on the due date: the next occurrence", () => {
      expect(nextDue(task({ ...weekly, checked_at: noon("2026-10-05") }), "UTC")).toBe("2026-10-12");
    });

    it("checked early: still the next occurrence, skipping nothing", () => {
      expect(nextDue(task({ ...weekly, checked_at: noon("2026-10-01") }), "UTC")).toBe("2026-10-12");
    });

    it("checked late: the first occurrence after the check, not straight back", () => {
      expect(nextDue(task({ ...weekly, checked_at: noon("2026-10-12") }), "UTC")).toBe("2026-10-19");
      expect(nextDue(task({ ...weekly, checked_at: noon("2026-10-15") }), "UTC")).toBe("2026-10-19");
    });

    it("counts every N days", () => {
      const every3 = { ...weekly, repeat_every: 3, repeat_unit: "day" } as const;
      expect(nextDue(task({ ...every3, checked_at: noon("2026-10-06") }), "UTC")).toBe("2026-10-08");
    });
  });

  describe("from completion", () => {
    const after = { ...weekly, repeat_every: 5, repeat_unit: "day", repeat_from: "completion" } as const;

    it("counts from the day it was checked", () => {
      expect(nextDue(task({ ...after, checked_at: noon("2026-10-01") }), "UTC")).toBe("2026-10-06");
      expect(nextDue(task({ ...after, checked_at: noon("2026-10-20") }), "UTC")).toBe("2026-10-25");
    });

    it("uses the calendar day of the check in the given zone", () => {
      // 01:00 on the 15th in Riga is still the 14th in UTC.
      const item = task({ ...after, checked_at: "2026-10-14T22:00:00Z" });
      expect(nextDue(item, "Europe/Riga")).toBe("2026-10-20");
      expect(nextDue(item, "UTC")).toBe("2026-10-19");
    });
  });
});

describe("planRollover", () => {
  const weekly = { due_on: "2026-10-05", repeat_every: 1, repeat_unit: "week", repeat_from: "schedule" } as const;

  it("leaves one-offs, undated tasks and subtasks alone", () => {
    const items = [
      task({ id: "a" }),
      task({ id: "b", due_on: "2026-01-01" }),
      task({ id: "c", due_on: "2026-01-01", checked_at: noon("2026-01-01") }),
      task({ id: "d", ...weekly, due_on: "2026-01-05", parent_item_id: "x" }),
    ];
    expect(planRollover(items, "2026-10-15")).toEqual([]);
  });

  it("keeps a checked task checked until its next date", () => {
    const items = [task({ ...weekly, checked_at: noon("2026-10-05") })];
    expect(planRollover(items, "2026-10-11")).toEqual([]);
  });

  it("reopens a checked task on its next date, with its checked subtasks", () => {
    const items = [
      task({ id: "p", ...weekly, checked_at: noon("2026-10-05") }),
      task({ id: "s1", parent_item_id: "p", checked_at: noon("2026-10-05") }),
      task({ id: "s2", parent_item_id: "p" }),
      task({ id: "other", parent_item_id: "q", checked_at: noon("2026-10-05") }),
    ];
    expect(planRollover(items, "2026-10-12")).toEqual([
      { id: "p", patch: { due_on: "2026-10-12", checked_at: null, checked_by: null } },
      { id: "s1", patch: { checked_at: null, checked_by: null } },
    ]);
  });

  it("reopens a schedule task on its latest occurrence when weeks were missed", () => {
    const items = [task({ ...weekly, checked_at: noon("2026-10-05") })];
    expect(planRollover(items, "2026-10-28")).toEqual([
      { id: "t1", patch: { due_on: "2026-10-26", checked_at: null, checked_by: null } },
    ]);
  });

  it("reopens a completion task on its next date, however late", () => {
    const items = [
      task({ ...weekly, repeat_from: "completion", checked_at: noon("2026-10-05") }),
    ];
    expect(planRollover(items, "2026-10-28")).toEqual([
      { id: "t1", patch: { due_on: "2026-10-12", checked_at: null, checked_by: null } },
    ]);
  });

  it("moves a missed unchecked schedule task forward", () => {
    expect(planRollover([task(weekly)], "2026-10-05")).toEqual([]);
    expect(planRollover([task(weekly)], "2026-10-11")).toEqual([]);
    expect(planRollover([task(weekly)], "2026-10-12")).toEqual([
      { id: "t1", patch: { due_on: "2026-10-12" } },
    ]);
    expect(planRollover([task(weekly)], "2026-10-20")).toEqual([
      { id: "t1", patch: { due_on: "2026-10-19" } },
    ]);
  });

  it("leaves an unchecked completion task overdue", () => {
    const items = [task({ ...weekly, repeat_from: "completion" })];
    expect(planRollover(items, "2026-11-30")).toEqual([]);
  });

  it("places the check-off in the given zone", () => {
    // Checked at 01:00 on the 15th in Riga (22:00 on the 14th in UTC). Every
    // day after completion, it comes back on the 16th in Riga.
    const items = [
      task({
        due_on: "2026-10-14",
        repeat_every: 1,
        repeat_unit: "day",
        repeat_from: "completion",
        checked_at: "2026-10-14T22:00:00Z",
      }),
    ];
    expect(planRollover(items, "2026-10-15", "Europe/Riga")).toEqual([]);
    expect(planRollover(items, "2026-10-16", "Europe/Riga")).toEqual([
      { id: "t1", patch: { due_on: "2026-10-16", checked_at: null, checked_by: null } },
    ]);
  });
});

describe("upcomingDue", () => {
  const weekly = { due_on: "2026-10-05", repeat_every: 1, repeat_unit: "week", repeat_from: "schedule" } as const;

  it("is null without a date, or for a checked one-off", () => {
    expect(upcomingDue(task(), "2026-10-15")).toBeNull();
    expect(upcomingDue(task({ due_on: "2026-10-01", checked_at: noon("2026-10-01") }), "2026-10-15")).toBeNull();
  });

  it("is the due date of an unchecked one-off, even when overdue", () => {
    expect(upcomingDue(task({ due_on: "2026-10-01" }), "2026-10-15")).toBe("2026-10-01");
  });

  it("skips missed occurrences of an unchecked schedule task", () => {
    expect(upcomingDue(task(weekly), "2026-10-15")).toBe("2026-10-12");
  });

  it("is the next date of a checked task", () => {
    const checked = task({ ...weekly, checked_at: noon("2026-10-05") });
    expect(upcomingDue(checked, "2026-10-08", "UTC")).toBe("2026-10-12");
    expect(upcomingDue(checked, "2026-10-20", "UTC")).toBe("2026-10-19");
  });

  it("keeps an unchecked completion task on its overdue date", () => {
    const item = task({ ...weekly, repeat_from: "completion" });
    expect(upcomingDue(item, "2026-10-20")).toBe("2026-10-05");
  });
});

describe("labels", () => {
  it("shortDate", () => {
    expect(shortDate("2026-10-12")).toBe("26.10.12");
  });

  it("dueLabel", () => {
    expect(dueLabel("2026-10-14", "2026-10-15")).toEqual({ text: "OVERDUE 26.10.14", tone: "overdue" });
    expect(dueLabel("2026-10-15", "2026-10-15")).toEqual({ text: "DUE TODAY", tone: "today" });
    expect(dueLabel("2026-10-16", "2026-10-15")).toEqual({ text: "DUE TMRW", tone: "soon" });
    expect(dueLabel("2026-10-17", "2026-10-15")).toEqual({ text: "DUE 26.10.17", tone: "later" });
    // Before the client knows its date, the label stays absolute.
    expect(dueLabel("2026-10-14", null)).toEqual({ text: "DUE 26.10.14", tone: "later" });
  });

  it("repeatLabel", () => {
    expect(repeatLabel(none)).toBeNull();
    expect(repeatLabel({ due_on: "2026-10-01", repeat_every: 2, repeat_unit: "week", repeat_from: "schedule" })).toBe("↻ 2W");
    expect(repeatLabel({ due_on: "2026-10-01", repeat_every: 5, repeat_unit: "day", repeat_from: "completion" })).toBe("↻ 5D AFTER");
  });
});
