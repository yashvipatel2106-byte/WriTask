export default function InboxHeader() {
  return (
    <div className="flex justify-between items-center mb-6">

      <div>
        <h1 className="text-4xl font-bold text-white">
          Inbox
        </h1>

        <p className="text-gray-400 mt-2 dark:text-slate-500">
          Manage messages, notifications and updates
        </p>
      </div>

      <div className="flex items-center gap-4">

        <input
          type="text"
          placeholder="Search messages..."
          className="
          bg-[#07153D]
          border
          border-cyan-500/20
          rounded-xl
          px-4
          py-3
          w-72
          outline-none
          dark:bg-slate-800
          dark:border-cyan-400/20
          "
        />

        <button
          className="
          bg-gradient-to-r
          from-cyan-500
          to-purple-600
          px-5
          py-3
          rounded-xl
          "
        >
          Filter
        </button>

      </div>

    </div>
  );
}