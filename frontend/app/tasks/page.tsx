"use client";

import { useState } from "react";
import { authFetch } from "@/lib/validation/authFetch";
import { toast } from "@/components/ui/toast";

export default function CreateTaskPage() {
  const [task, setTask] = useState({
    title: "",
    description: "",
    priority: "Medium",
    status: "To Do",
    assignedTo: "",
    dueDate: "",
    estimatedHours: "",
    tags: "",
    progress: 0,
  });

  const handleSubmit = async (
    e: React.FormEvent
  ) => {
    e.preventDefault();

    try {
      const res = await authFetch("/tasks", {
        method: "POST",
        body: JSON.stringify(task),
      });

      const data =
        await res.json();

      if (!res.ok) {
        toast.error(data.message || "Failed to create task");
        return;
      }

      toast.success(data.message || "Task created successfully");
    } catch (error) {
      console.log(error);
      toast.error("Failed to create task");
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F9FC] dark:bg-[#0B1120] flex justify-center py-10 px-6">

      <div className="w-full max-w-5xl">

        {/* Header */}

        <div className="text-center mb-8">

          <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100">
            Create Task
          </h1>

          <p className="text-slate-500 mt-2 dark:text-slate-400">
            Create and assign tasks to your team members.
          </p>

        </div>

        {/* Card */}

        <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm dark:bg-slate-900 dark:border-slate-800">

          <form
            onSubmit={handleSubmit}
            className="space-y-6"
          >

            {/* Title */}

            <div>

              <label className="block text-slate-500 mb-2 dark:text-slate-400">
                Task Title
              </label>

              <input
                type="text"
                placeholder="Enter task title"
                value={task.title}
                onChange={(e) =>
                  setTask({
                    ...task,
                    title:
                      e.target.value,
                  })
                }
                className="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
              />

            </div>

            {/* Description */}

            <div>

              <label className="block text-slate-500 mb-2 dark:text-slate-400">
                Description
              </label>

              <textarea
                rows={5}
                placeholder="Task description..."
                value={task.description}
                onChange={(e) =>
                  setTask({
                    ...task,
                    description:
                      e.target.value,
                  })
                }
                className="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
              />

            </div>

            {/* Grid */}

            <div className="grid md:grid-cols-2 gap-6">

              {/* Priority */}

              <div>

                <label className="block text-slate-500 mb-2 dark:text-slate-400">
                  Priority
                </label>

                <select
                  value={task.priority}
                  onChange={(e) =>
                    setTask({
                      ...task,
                      priority:
                        e.target.value,
                    })
                  }
                  className={`
                    w-full
                    p-4
                    rounded-xl
                    border
                    font-medium
                    ${
                      task.priority ===
                      "High"
                        ? "bg-red-50 border-red-300 text-red-700 dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-400"
                        : task.priority ===
                          "Medium"
                        ? "bg-yellow-50 border-yellow-300 text-yellow-700 dark:bg-yellow-500/10 dark:border-yellow-500/30 dark:text-yellow-400"
                        : "bg-green-50 border-green-300 text-green-700 dark:bg-green-500/10 dark:border-green-500/30 dark:text-green-400"
                    }
                  `}
                >
                  <option value="Low">
                    🟢 Low
                  </option>

                  <option value="Medium">
                    🟡 Medium
                  </option>

                  <option value="High">
                    🔴 High
                  </option>

                </select>

                <div className="mt-3">

                  {task.priority ===
                    "Low" && (
                    <span className="px-3 py-1 rounded-full bg-green-50 text-green-700 text-sm dark:bg-green-500/10 dark:text-green-400">
                      🟢 Low Priority
                    </span>
                  )}

                  {task.priority ===
                    "Medium" && (
                    <span className="px-3 py-1 rounded-full bg-yellow-50 text-yellow-700 text-sm dark:bg-yellow-500/10 dark:text-yellow-400">
                      🟡 Medium Priority
                    </span>
                  )}

                  {task.priority ===
                    "High" && (
                    <span className="px-3 py-1 rounded-full bg-red-50 text-red-700 text-sm dark:bg-red-500/10 dark:text-red-400">
                      🔴 High Priority
                    </span>
                  )}

                </div>

              </div>

              {/* Due Date */}

              <div>

                <label className="block text-slate-500 mb-2 dark:text-slate-400">
                  Due Date
                </label>

                <input
                  type="date"
                  value={task.dueDate}
                  onChange={(e) =>
                    setTask({
                      ...task,
                      dueDate:
                        e.target.value,
                    })
                  }
                  className="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                />

              </div>

              {/* Status */}

              <div>

                <label className="block text-slate-500 mb-2 dark:text-slate-400">
                  Task Status
                </label>

                <select
                  value={task.status}
                  onChange={(e) =>
                    setTask({
                      ...task,
                      status:
                        e.target.value,
                    })
                  }
                  className="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                >
                  <option>
                    To Do
                  </option>
                  <option>
                    In Progress
                  </option>
                  <option>
                    Review
                  </option>
                  <option>
                    Completed
                  </option>
                </select>

              </div>

              {/* Assigned To */}

              <div>

                <label className="block text-slate-500 mb-2 dark:text-slate-400">
                  Assign To
                </label>

                <input
                  type="text"
                  placeholder="Team Member"
                  value={
                    task.assignedTo
                  }
                  onChange={(e) =>
                    setTask({
                      ...task,
                      assignedTo:
                        e.target.value,
                    })
                  }
                  className="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                />

              </div>

              {/* Hours */}

              <div>

                <label className="block text-slate-500 mb-2 dark:text-slate-400">
                  Estimated Hours
                </label>

                <input
                  type="number"
                  placeholder="8"
                  value={
                    task.estimatedHours
                  }
                  onChange={(e) =>
                    setTask({
                      ...task,
                      estimatedHours:
                        e.target.value,
                    })
                  }
                  className="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                />

              </div>

              {/* Tags */}

              <div>

                <label className="block text-slate-500 mb-2 dark:text-slate-400">
                  Tags
                </label>

                <input
                  placeholder="Frontend, UI, Bug"
                  value={task.tags}
                  onChange={(e) =>
                    setTask({
                      ...task,
                      tags:
                        e.target.value,
                    })
                  }
                  className="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                />

              </div>

            </div>

            {/* Progress */}

            <div>

              <label className="block text-slate-500 mb-2 dark:text-slate-400">
                Progress ({task.progress}%)
              </label>

              <input
                type="range"
                min="0"
                max="100"
                value={task.progress}
                onChange={(e) =>
                  setTask({
                    ...task,
                    progress:
                      Number(
                        e.target.value
                      ),
                  })
                }
                className="w-full"
              />

            </div>

            {/* Attachment */}

            <div>

              <label className="block text-slate-500 mb-2 dark:text-slate-400">
                Attachments
              </label>

              <input
                type="file"
                className="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
              />

            </div>

            {/* Footer */}

            <div className="flex flex-wrap justify-end gap-4 pt-4">

              <button
                type="reset"
                className="px-6 py-3 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Reset
              </button>

              <button
                type="submit"
                className="px-8 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 text-white font-semibold hover:opacity-90"
              >
                Create Task
              </button>

            </div>

          </form>

        </div>

      </div>

    </div>
  );
}