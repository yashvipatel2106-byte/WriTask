"use client";

import { useState } from "react";
import { toast } from "@/components/ui/toast";
import Select, { fieldSelectTriggerClass } from "@/components/ui/Select";

export default function AssignTaskPage() {
  const [form, setForm] = useState({
    task: "",
    member: "",
    notes: "",
  });

  const handleAssign = async (
    e: React.FormEvent
  ) => {
    e.preventDefault();

    try {
      toast.success("Task assigned successfully");
    } catch (error) {
      console.log(error);
      toast.error("Failed to assign task");
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F9FC] dark:bg-[#0B1120] flex justify-center py-10 px-6">

      <div className="w-full max-w-5xl">

        {/* Header */}

        <div className="text-center mb-8">

          <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100">
            Assign Task
          </h1>

          <p className="text-slate-500 mt-2 dark:text-slate-400">
            Assign project tasks to team members and manage ownership.
          </p>

        </div>

        {/* Main Card */}

        <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm dark:bg-slate-900 dark:border-slate-800">

          <form
            onSubmit={handleAssign}
            className="space-y-8"
          >

            {/* Task Selection */}

            <div>

              <label className="block text-slate-500 mb-2 dark:text-slate-400">
                Select Task
              </label>

              <Select
                value={form.task}
                onChange={(next) =>
                  setForm({
                    ...form,
                    task: next,
                  })
                }
                placeholder="Select Task"
                className="w-full"
                triggerClassName={fieldSelectTriggerClass}
                options={[
                  { value: "", label: "Select Task" },
                  { value: "Dashboard UI Design", label: "Dashboard UI Design" },
                  {
                    value: "Authentication Module",
                    label: "Authentication Module",
                  },
                  {
                    value: "Project Timeline Setup",
                    label: "Project Timeline Setup",
                  },
                  {
                    value: "Team Management Module",
                    label: "Team Management Module",
                  },
                ]}
              />

            </div>

            {/* Member Selection */}

            <div>

              <label className="block text-slate-500 mb-2 dark:text-slate-400">
                Assign To
              </label>

              <Select
                value={form.member}
                onChange={(next) =>
                  setForm({
                    ...form,
                    member: next,
                  })
                }
                placeholder="Select Team Member"
                className="w-full"
                triggerClassName={fieldSelectTriggerClass}
                options={[
                  { value: "", label: "Select Team Member" },
                  { value: "John Doe", label: "John Doe" },
                  { value: "Sarah Smith", label: "Sarah Smith" },
                  { value: "Mike Johnson", label: "Mike Johnson" },
                  { value: "Emily Davis", label: "Emily Davis" },
                ]}
              />

            </div>

            {/* Assignment Notes */}

            <div>

              <label className="block text-slate-500 mb-2 dark:text-slate-400">
                Assignment Notes
              </label>

              <textarea
                rows={5}
                value={form.notes}
                onChange={(e) =>
                  setForm({
                    ...form,
                    notes: e.target.value,
                  })
                }
                placeholder="Add instructions, expectations, or remarks..."
                className="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
              />

            </div>

            {/* Task Preview */}

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 dark:bg-slate-800 dark:border-slate-700">

              <h3 className="text-xl font-semibold text-slate-900 mb-4 dark:text-slate-100">
                Task Preview
              </h3>

              <div className="grid md:grid-cols-2 gap-5">

                <div>

                  <p className="text-slate-500 text-sm dark:text-slate-400">
                    Selected Task
                  </p>

                  <p className="text-slate-900 mt-1 dark:text-slate-100">
                    {form.task || "No Task Selected"}
                  </p>

                </div>

                <div>

                  <p className="text-slate-500 text-sm dark:text-slate-400">
                    Assigned To
                  </p>

                  <p className="text-slate-900 mt-1 dark:text-slate-100">
                    {form.member ||
                      "No Member Selected"}
                  </p>

                </div>

                <div>

                  <p className="text-slate-500 text-sm dark:text-slate-400">
                    Priority
                  </p>

                  <span className="inline-block mt-2 px-3 py-1 rounded-full bg-red-50 text-red-700 text-sm dark:bg-red-500/10 dark:text-red-400">
                    🔴 High
                  </span>

                </div>

                <div>

                  <p className="text-slate-500 text-sm dark:text-slate-400">
                    Status
                  </p>

                  <span className="inline-block mt-2 px-3 py-1 rounded-full bg-yellow-50 text-yellow-700 text-sm dark:bg-yellow-500/10 dark:text-yellow-400">
                    🟡 Pending
                  </span>

                </div>

                <div>

                  <p className="text-slate-500 text-sm dark:text-slate-400">
                    Due Date
                  </p>

                  <p className="text-slate-900 mt-1 dark:text-slate-100">
                    30 Jun 2025
                  </p>

                </div>

                <div>

                  <p className="text-slate-500 text-sm dark:text-slate-400">
                    Estimated Hours
                  </p>

                  <p className="text-slate-900 mt-1 dark:text-slate-100">
                    8 Hours
                  </p>

                </div>

              </div>

            </div>

            {/* Assignee Card */}

            {form.member && (

              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 dark:bg-slate-800 dark:border-slate-700">

                <div className="flex items-center gap-4">

                  <div className="w-14 h-14 rounded-full bg-gradient-to-r from-cyan-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg">
                    {form.member.charAt(0)}
                  </div>

                  <div>

                    <h3 className="text-slate-900 font-semibold dark:text-slate-100">
                      {form.member}
                    </h3>

                    <p className="text-slate-500 text-sm dark:text-slate-400">
                      Team Member
                    </p>

                  </div>

                </div>

              </div>

            )}

            {/* Footer Buttons */}

            <div className="flex flex-wrap justify-end gap-4 pt-2">

              <button
                type="reset"
                className="
                px-6
                py-3
                rounded-xl
                border
                border-slate-200
                text-slate-600
                hover:bg-slate-50
                transition
                dark:border-slate-700
                dark:text-slate-300
                dark:hover:bg-slate-800
                "
              >
                Cancel
              </button>

              <button
                type="submit"
                className="
                px-8
                py-3
                rounded-xl
                bg-gradient-to-r
                from-cyan-500
                to-purple-600
                text-white
                font-semibold
                hover:opacity-90
                transition
                "
              >
                Assign Task
              </button>

            </div>

          </form>

        </div>

      </div>

    </div>
  );
}