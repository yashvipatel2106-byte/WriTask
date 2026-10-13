"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Check,
  Edit3,
  Plus,
  Power,
  X,
} from "lucide-react";
import { useOrganization } from "@/components/context/organizationContext";
import { useOrgPermission } from "@/hooks/useOrgPermissions";
import { authFetch } from "@/lib/validation/authFetch";
import { toast } from "@/components/ui/toast";
import { ModalHeader, ModalShell } from "@/components/ui/Modal";


type Holiday = {
  _id: string;
  name: string;
  dateKey: string;
  description?: string;
  source: "government" | "manual";
  isEnabled: boolean;

  /*
   * isActive is kept temporarily because the existing
   * frontend form uses it.
   */
  isActive?: boolean;
};

type CalendarMeta = {
  country: string;
  state: string;
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatDateKey(dateKey: string) {
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) return dateKey;
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function parseDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day, 12);
}

function toDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function CalendarDatePicker({
  value,
  onChange,
  defaultYear,
}: {
  value: string;
  onChange: (value: string) => void;
  defaultYear: number;
}) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() =>
    value ? parseDateKey(value) : new Date(defaultYear, 0, 1, 12)
  );
  const [showMonthYear, setShowMonthYear] = useState(false);
  const [yearScroll, setYearScroll] = useState(defaultYear);
  const rootRef = useRef<HTMLDivElement>(null);

  const selectedDate = value ? parseDateKey(value) : null;
  const today = new Date();

  const years = useMemo(() => {
    const start = Math.max(2000, yearScroll - 5);
    return Array.from({ length: 11 }, (_, index) => start + index);
  }, [yearScroll]);

  const days = useMemo(() => {
    const first = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
    const last = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0);
    const cells: Array<Date | null> = [];

    for (let i = 0; i < first.getDay(); i += 1) cells.push(null);
    for (let day = 1; day <= last.getDate(); day += 1) {
      cells.push(new Date(viewDate.getFullYear(), viewDate.getMonth(), day, 12));
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [viewDate]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setShowMonthYear(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  const selectDate = (date: Date) => {
    onChange(toDateKey(date));
    setViewDate(date);
    setOpen(false);
    setShowMonthYear(false);
  };

  const goMonth = (delta: number) => {
    setViewDate((current) =>
      new Date(current.getFullYear(), current.getMonth() + delta, 1, 12)
    );
  };

  const goToday = () => selectDate(today);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => {
          if (!open && value) setViewDate(parseDateKey(value));
          setOpen((current) => !current);
        }}
        className="flex h-11 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3.5 text-left text-sm text-slate-800 shadow-sm outline-none transition hover:border-slate-300 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/15 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className={value ? "font-medium" : "text-slate-400"}>
          {value ? formatDateKey(value) : "Select date"}
        </span>
        <CalendarDays size={17} className="text-slate-400" />
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-[80] w-[320px] rounded-2xl border border-slate-200 bg-white shadow-xl ring-1 ring-black/5 dark:border-slate-700 dark:bg-slate-900 dark:ring-white/5">
          <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowMonthYear((current) => !current)}
                className="group inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-semibold text-slate-900 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800"
              >
                {MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}
                <ChevronDown
                  size={15}
                  className={`text-slate-400 transition-transform ${showMonthYear ? "rotate-180" : ""}`}
                />
              </button>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => goMonth(-1)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                  aria-label="Previous month"
                >
                  <ChevronLeft size={17} />
                </button>
                <button
                  type="button"
                  onClick={() => goMonth(1)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                  aria-label="Next month"
                >
                  <ChevronRight size={17} />
                </button>
              </div>
            </div>
          </div>

          {showMonthYear ? (
            <div className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setYearScroll((current) => current - 5)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                  aria-label="Previous years"
                >
                  <ChevronLeft size={15} />
                </button>
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Choose month & year
                </span>
                <button
                  type="button"
                  onClick={() => setYearScroll((current) => current + 5)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                  aria-label="Next years"
                >
                  <ChevronRight size={15} />
                </button>
              </div>

              {/* Keep the month/year chooser inside a fixed scroll area.
                  This is intentionally scrollable even when the browser viewport
                  clips the bottom of the popover. */}
              <div
                className="h-[240px] overflow-y-scroll overscroll-contain pr-1"
                style={{
                  scrollbarWidth: "auto",
                  scrollbarGutter: "stable",
                }}
              >
                <div className="mb-4 grid grid-cols-3 gap-1.5">
                  {years.map((year) => {
                  const active = year === viewDate.getFullYear();
                  return (
                    <button
                      key={year}
                      type="button"
                      onClick={() => {
                        setYearScroll(year);
                        setViewDate(new Date(year, viewDate.getMonth(), 1, 12));
                      }}
                      className={`rounded-lg px-2 py-2 text-xs font-medium transition ${
                        active
                          ? "bg-cyan-600 text-white"
                          : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                      }`}
                    >
                      {year}
                    </button>
                  );
                })}
              </div>

                <div className="grid grid-cols-3 gap-1.5 pb-2">
                  {MONTHS.map((month, index) => {
                    const active = index === viewDate.getMonth();
                    return (
                      <button
                        key={month}
                        type="button"
                        onClick={() => {
                          setViewDate(new Date(viewDate.getFullYear(), index, 1, 12));
                          setShowMonthYear(false);
                        }}
                        className={`rounded-lg px-2 py-2 text-xs font-medium transition ${
                          active
                            ? "bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-300 dark:ring-cyan-500/30"
                            : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                        }`}
                      >
                        {month.slice(0, 3)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-7 px-3 pt-3">
                {WEEKDAYS.map((day) => (
                  <div
                    key={day}
                    className="pb-2 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-400"
                  >
                    {day.slice(0, 2)}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-y-1 px-3 pb-3">
                {days.map((date, index) => {
                  if (!date) return <div key={`empty-${index}`} className="h-9" />;

                  const selected = selectedDate ? isSameDay(date, selectedDate) : false;
                  const isToday = isSameDay(date, today);

                  return (
                    <button
                      key={date.toISOString()}
                      type="button"
                      onClick={() => selectDate(date)}
                      className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full text-xs font-medium transition ${
                        selected
                          ? "bg-cyan-600 text-white shadow-sm"
                          : isToday
                          ? "border border-cyan-500 text-cyan-700 hover:bg-cyan-50 dark:text-cyan-300 dark:hover:bg-cyan-500/10"
                          : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                      }`}
                    >
                      {date.getDate()}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    onChange("");
                    setOpen(false);
                  }}
                  className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={goToday}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-cyan-700 hover:bg-cyan-50 dark:text-cyan-300 dark:hover:bg-cyan-500/10"
                >
                  Today
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function YearPicker({
  value,
  years,
  onChange,
}: {
  value: number;
  years: number[];
  onChange: (year: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex h-11 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-800 shadow-sm transition hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/15 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{value}</span>
        <ChevronDown
          size={17}
          className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-[70] w-full min-w-[150px] overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl ring-1 ring-black/5 dark:border-slate-700 dark:bg-slate-900 dark:ring-white/5">
          {years.map((year) => {
            const selected = year === value;
            return (
              <button
                key={year}
                type="button"
                onClick={() => {
                  onChange(year);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition ${
                  selected
                    ? "bg-cyan-600 text-white"
                    : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                }`}
              >
                {year}
                {selected && <Check size={15} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function WorkingCalendarPage() {
  const { currentOrg } = useOrganization();
 const { role, orgReady } =
  useOrgPermission();

const isOrgOwner =
  role === "owner";
  const orgId = currentOrg?.organizationId;
  const currentYear = new Date().getFullYear();

const DEFAULT_HOLIDAY_YEAR =
  currentYear === 2027
    ? 2027
    : 2026;
 const [year, setYear] =
  useState(DEFAULT_HOLIDAY_YEAR);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [calendar, setCalendar] = useState<CalendarMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<"create" | Holiday | null>(null);
  const [form, setForm] = useState({
    name: "",
    dateKey: "",
    description: "",
    isRecurring: false,
    isActive: true,
  });

  const years = useMemo(
  () => [2026, 2027],
  []
);

  const load = async (nextYear = year) => {
  if (!orgId) return;

  setLoading(true);

  const res = await authFetch(
    `/organizations/${orgId}/holidays?year=${nextYear}`
  );

  const data =
    await res.json().catch(
      () => ({})
    );

  setLoading(false);

  if (!res.ok) {
    toast.error(
      data.message ||
        "Failed to load holidays"
    );

    return;
  }

  setHolidays(
  (data.holidays || []).filter(
    (holiday: Holiday) =>
      isOrgOwner ||
      holiday.isEnabled !== false
  )
);

  setCalendar(
    data.calendar || null
  );
};

  useEffect(() => {
    if (!orgReady || !orgId) return;
    load(year);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgReady, orgId, year]);

  const openCreate = () => {
  if (!isOrgOwner) {
    toast.error(
      "Only the organization owner can manage holidays."
    );
    return;
  }
    setForm({
      name: "",
      dateKey: `${year}-01-01`,
      description: "",
      isRecurring: false,
      isActive: true,
    });
    setDialog("create");
  };

  const openEdit = (
  holiday: Holiday
) => {
  if (!isOrgOwner) {
    toast.error(
      "Only the organization owner can manage holidays."
    );
    return;
  }
  setForm({
    name: holiday.name,
    dateKey: holiday.dateKey,
    description:
      holiday.description || "",
    isRecurring: false,
    isActive:
      holiday.isEnabled !== false,
  });

  setDialog(holiday);
};
  const saveHoliday = async () => {
     if (!isOrgOwner) {
    toast.error(
      "Only the organization owner can manage holidays."
    );
    return;
  }
    if (!orgId) return;
    if (!form.name.trim()) {
      toast.error("Enter a holiday name");
      return;
    }
    if (!form.dateKey) {
      toast.error("Select a holiday date");
      return;
    }

    const isCreate = dialog === "create";
    const url = isCreate
      ? `/organizations/${orgId}/holidays`
      : `/organizations/${orgId}/holidays/${(dialog as Holiday)._id}`;
    const res = await authFetch(url, {
      method: isCreate ? "POST" : "PUT",
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.message || "Failed to save holiday");
      return;
    }
    setDialog(null);
    toast.success(isCreate ? "Holiday added" : "Holiday updated");
    await load();
  };

  const toggleActive = async (
  holiday: Holiday
) => {
  if (!isOrgOwner) {
    toast.error(
      "Only the organization owner can manage holidays."
    );
    return;
  }

  if (!orgId) return;

  const nextEnabled =
    holiday.isEnabled === false;

  const res = await authFetch(
    `/organizations/${orgId}/holidays/${holiday._id}`,
    {
      method: "PUT",

      body: JSON.stringify({
        isEnabled:
          nextEnabled,
      }),
    }
  );

  if (!res.ok) {
    const data =
      await res.json().catch(
        () => ({})
      );

    toast.error(
      data.message ||
        "Failed to update holiday"
    );

    return;
  }

  toast.success(
    nextEnabled
      ? "Holiday enabled"
      : "Holiday disabled"
  );

  await load();
};

 

  


  if (!orgId) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold">Working Calendar</h1>
        <p className="mt-2 text-sm text-slate-500">
          Switch to an organization to manage holidays.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl pb-10">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-50 text-cyan-600 dark:bg-cyan-500/10 dark:text-cyan-400">
              <CalendarDays size={21} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                Working Calendar
              </h1>
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
  {isOrgOwner
    ? "Manage organization holidays and non-working days."
    : "View organization holidays and non-working days."}
</p>
            </div>
          </div>
        </div>
      </div>

      <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Calendar settings
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
  Gujarat public holidays for 2026 and 2027 are stored in the organization calendar.
</p>
          </div>
          
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3.5 py-3 dark:border-slate-800 dark:bg-slate-800/50">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Country</p>
            <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
              {calendar?.country || "India"}
            </p>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3.5 py-3 dark:border-slate-800 dark:bg-slate-800/50">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">State</p>
            <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
              {calendar?.state || "Gujarat"}
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
              Calendar year
            </label>
            <YearPicker value={year} years={years} onChange={setYear} />
          </div>

          
        </div>
      </section>

      

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Holidays for {year}
              </h2>
              {!loading && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  {holidays.length}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Active holidays are treated as non-working days for capacity planning.
            </p>
          </div>

         {isOrgOwner && (
  <button
    type="button"
    onClick={openCreate}
    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
  >
    <Plus size={16} />
    Add holiday
  </button>
)}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[820px] w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr className="border-b border-slate-200 dark:border-slate-800">
                <th className="w-[150px] px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Date
                </th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Holiday
                </th>
                <th className="w-[170px] px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Source
                </th>
                <th className="w-[115px] px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Status
                </th>
                {isOrgOwner && (
  <th className="w-[245px] px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
    Actions
  </th>
)}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-5 py-10 text-center text-sm text-slate-500" colSpan={5}>
                    Loading holidays…
                  </td>
                </tr>
              ) : holidays.length === 0 ? (
                <tr>
                  <td className="px-5 py-12 text-center" colSpan={5}>
                    <div className="mx-auto flex max-w-md flex-col items-center">
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800">
                        <CalendarDays size={20} />
                      </div>
                      <p className="mt-3 text-sm font-semibold text-slate-800 dark:text-slate-100">
                        No holidays for {year}
                      </p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Sync public holidays or add an organization holiday manually.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                holidays.map((holiday) => (
                  <tr
                    key={holiday._id}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70 dark:border-slate-800 dark:hover:bg-slate-800/30"
                  >
                    <td className="px-5 py-3.5 align-middle whitespace-nowrap">
                      <div className="font-medium text-slate-800 dark:text-slate-100">
                        {formatDateKey(holiday.dateKey)}
                      </div>
                      {false && (
                        <span className="mt-0.5 inline-block text-[11px] text-slate-400">
                          Repeats yearly
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 align-middle">
                      <div className="font-medium text-slate-800 dark:text-slate-100">
                        {holiday.name}
                      </div>
                      {holiday.description && (
                        <div className="mt-0.5 max-w-[360px] truncate text-xs text-slate-400">
                          {holiday.description}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3.5 align-middle">
  <span
    className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${
      holiday.source === "government"
        ? "bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300"
        : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
    }`}
  >
    {holiday.source === "government"
      ? "Public holiday"
      : "Custom"}
  </span>
</td>
                    <td className="px-5 py-3.5 align-middle">
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                          holiday.isEnabled
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-slate-400"
                        }`}
                      >
                        <span
                          className={`h-2 w-2 rounded-full ${
                            holiday.isEnabled ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"
                          }`}
                        />
                       {holiday.isEnabled ? "Active" : "Disabled"}
                      </span>
                    </td>
                    {isOrgOwner && (
  <td className="px-5 py-3.5 align-middle">
    <div className="flex items-center gap-1.5 whitespace-nowrap">

      <button
        type="button"
        onClick={() => openEdit(holiday)}
        title="Edit holiday"
        aria-label={`Edit ${holiday.name}`}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 transition hover:border-cyan-200 hover:bg-cyan-50 hover:text-cyan-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-cyan-500/30 dark:hover:bg-cyan-500/10 dark:hover:text-cyan-300"
      >
        <Edit3 size={13} />
        Edit
      </button>

      <button
        type="button"
        onClick={() => toggleActive(holiday)}
        title={
          holiday.isEnabled
            ? "Disable holiday"
            : "Enable holiday"
        }
        aria-label={`${
          holiday.isEnabled
            ? "Disable"
            : "Enable"
        } ${holiday.name}`}
        className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition ${
          holiday.isEnabled
            ? "border-slate-200 bg-white text-slate-600 hover:border-amber-200 hover:bg-amber-50 hover:text-amber-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-amber-500/30 dark:hover:bg-amber-500/10 dark:hover:text-amber-300"
            : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
        }`}
      >
        <Power size={13} />

        {holiday.isEnabled
          ? "Disable"
          : "Enable"}
      </button>

    </div>
  </td>
)}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {isOrgOwner && dialog && (
        <ModalShell onClose={() => setDialog(null)}>
          <div className="w-full max-w-lg p-6">
            <ModalHeader
              title={dialog === "create" ? "Add Organization Holiday" : "Edit Holiday"}
              onClose={() => setDialog(null)}
              className="mb-5"
            />

            <div className="space-y-4">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                Holiday name
                <input
                  autoFocus
                  className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-normal text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/15 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  placeholder="e.g. Diwali"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                />
              </label>

              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                Date
                <div className="mt-1.5">
                  <CalendarDatePicker
                    value={form.dateKey}
                    defaultYear={year}
                    onChange={(dateKey) => setForm((prev) => ({ ...prev, dateKey }))}
                  />
                </div>
              </label>

              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                Description
                <textarea
                  rows={3}
                  className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm font-normal text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/15 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  placeholder="Optional note about this holiday"
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                />
              </label>

              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-700 dark:bg-slate-800/50">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                    checked={form.isRecurring}
                    onChange={(e) => setForm((prev) => ({ ...prev, isRecurring: e.target.checked }))}
                  />
                  <span>
                    <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                      Repeat every year
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                      Keep this holiday on the same date for future years.
                    </span>
                  </span>
                </label>

                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                    checked={form.isActive}
                    onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
                  />
                  <span>
                    <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                      Active non-working day
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                      Active holidays reduce member capacity for this date.
                    </span>
                  </span>
                </label>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setDialog(null)}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <X size={15} />
                Cancel
              </button>
              <button
                type="button"
                onClick={saveHoliday}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-cyan-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
              >
                <Check size={15} />
                {dialog === "create" ? "Add holiday" : "Save changes"}
              </button>
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  );
}
