"use client";

import { useState } from "react";
import {
  Activity,
  CheckCircle2,
  FileText,
  Users,
  Search,
} from "lucide-react";

export default function ActivityPage() {
  const [activeFilter, setActiveFilter] = useState("All");

  const activities = [
    {
      user: "Priya Sharma",
      action: "Created Project",
      module: "Projects",
      date: "Today",
      status: "Success",
    },
    {
      user: "James Walker",
      action: "Completed Login API Task",
      module: "Tasks",
      date: "Today",
      status: "Success",
    },
    {
      user: "Aisha Patel",
      action: "Uploaded Design File",
      module: "Documents",
      date: "Yesterday",
      status: "Pending",
    },
    {
      user: "Carlos Mendes",
      action: "Invited New Member",
      module: "Members",
      date: "Yesterday",
      status: "Success",
    },
  ];

  return (
    <div className="space-y-6 px-8 py-6">

      {/* Header */}

      <div className="flex justify-between items-start">

        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
            Team Activity
          </h1>

          <p className="text-slate-500 mt-1 dark:text-slate-400">
            Track workspace activity and team updates
          </p>
        </div>

      </div>

      {/* Stats */}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">

        <div className="bg-white border border-slate-200 shadow-sm rounded-3xl p-6 dark:bg-slate-900 dark:border-slate-800">
          <Activity
            className="text-cyan-600 mb-3 dark:text-cyan-400"
            size={28}
          />

          <p className="text-slate-500 dark:text-slate-400">
            Total Activities
          </p>

          <h2 className="text-4xl font-bold mt-3 text-slate-900 dark:text-slate-100">
            1240
          </h2>
        </div>

        <div className="bg-white border border-slate-200 shadow-sm rounded-3xl p-6 dark:bg-slate-900 dark:border-slate-800">
          <CheckCircle2
            className="text-green-600 mb-3 dark:text-green-400"
            size={28}
          />

          <p className="text-slate-500 dark:text-slate-400">
            Tasks Updated
          </p>

          <h2 className="text-4xl font-bold mt-3 text-slate-900 dark:text-slate-100">
            356
          </h2>
        </div>

        <div className="bg-white border border-slate-200 shadow-sm rounded-3xl p-6 dark:bg-slate-900 dark:border-slate-800">
          <FileText
            className="text-purple-600 mb-3 dark:text-purple-400"
            size={28}
          />

          <p className="text-slate-500 dark:text-slate-400">
            Documents Uploaded
          </p>

          <h2 className="text-4xl font-bold mt-3 text-slate-900 dark:text-slate-100">
            87
          </h2>
        </div>

        <div className="bg-white border border-slate-200 shadow-sm rounded-3xl p-6 dark:bg-slate-900 dark:border-slate-800">
          <Users
            className="text-yellow-600 mb-3 dark:text-yellow-400"
            size={28}
          />

          <p className="text-slate-500 dark:text-slate-400">
            Active Members
          </p>

          <h2 className="text-4xl font-bold mt-3 text-slate-900 dark:text-slate-100">
            24
          </h2>
        </div>

      </div>

      {/* Search */}

      <div
        className="
        bg-white
        rounded-xl
        p-3
        border
        border-slate-200
        shadow-sm
        flex
        items-center
        gap-3
        dark:bg-slate-900
        dark:border-slate-800
      "
      >
        <Search
          size={18}
          className="text-slate-400 dark:text-slate-500"
        />

        <input
          placeholder="Search activity..."
          className="
          bg-transparent
          outline-none
          w-full
          text-slate-900
          dark:text-slate-100
          dark:placeholder:text-slate-500
        "
        />
      </div>

      {/* Filters */}

      <div className="flex flex-wrap gap-3">

        {[
          "All",
          "Tasks",
          "Projects",
          "Documents",
          "Members",
        ].map((item) => (
          <button
            key={item}
            onClick={() => setActiveFilter(item)}
            className={`
              px-4 py-2 rounded-xl font-medium transition

              ${
                activeFilter === item
                  ? "bg-cyan-500 text-white"
                  : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
              }
            `}
          >
            {item}
          </button>
        ))}

      </div>

      {/* Activity Table */}

      <div
        className="
        bg-white
        rounded-3xl
        overflow-hidden
        border
        border-slate-200
        shadow-sm
        dark:bg-slate-900
        dark:border-slate-800
      "
      >

        <div className="p-5 border-b border-slate-200 dark:border-slate-800">

          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Activity Logs
          </h2>

        </div>

        <div className="overflow-x-auto">
        <table className="w-full">

          <thead>

            <tr
              className="
              text-left
              text-slate-500
              border-b
              border-slate-200
              dark:text-slate-400
              dark:border-slate-800
            "
            >
              <th className="p-5">User</th>
              <th>Action</th>
              <th>Module</th>
              <th>Date</th>
              <th>Status</th>
            </tr>

          </thead>

          <tbody>

            {activities.map((activity, index) => (
              <tr
                key={index}
                className="
                border-b
                border-slate-200
                text-slate-700
                hover:bg-slate-50
                dark:border-slate-800
                dark:text-slate-200
                dark:hover:bg-slate-800
              "
              >
                <td className="p-5">
                  {activity.user}
                </td>

                <td>{activity.action}</td>

                <td>{activity.module}</td>

                <td>{activity.date}</td>

                <td>

                  <span
                    className={`
                    px-3 py-1
                    rounded-lg
                    text-sm

                    ${
                      activity.status === "Success"
                        ? "bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400"
                        : "bg-yellow-50 text-yellow-700 dark:bg-amber-500/10 dark:text-amber-400"
                    }
                  `}
                  >
                    {activity.status}
                  </span>

                </td>

              </tr>
            ))}

          </tbody>

        </table>
        </div>

      </div>

      {/* Recent Activity Cards */}

      <div className="grid md:grid-cols-2 gap-6">

        <div className="bg-white border border-slate-200 shadow-sm rounded-3xl p-6 dark:bg-slate-900 dark:border-slate-800">

          <h3 className="font-semibold text-lg text-slate-900 dark:text-slate-100">
            James Walker
          </h3>

          <p className="text-slate-600 mt-2 dark:text-slate-300">
            Completed Login API Task
          </p>

          <p className="text-slate-400 mt-4 text-sm dark:text-slate-500">
            15 minutes ago
          </p>

        </div>

        <div className="bg-white border border-slate-200 shadow-sm rounded-3xl p-6 dark:bg-slate-900 dark:border-slate-800">

          <h3 className="font-semibold text-lg text-slate-900 dark:text-slate-100">
            Priya Sharma
          </h3>

          <p className="text-slate-600 mt-2 dark:text-slate-300">
            Created Website Redesign Project
          </p>

          <p className="text-slate-400 mt-4 text-sm dark:text-slate-500">
            30 minutes ago
          </p>

        </div>

      </div>

    </div>
  );
}