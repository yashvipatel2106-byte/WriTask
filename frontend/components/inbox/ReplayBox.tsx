export default function ReplyBox() {
  return (
    <div className="mt-6">

      <textarea
        rows={5}
        placeholder="Write your reply..."
        className="
        w-full
        bg-[#020B2A]
        border
        border-cyan-500/20
        rounded-xl
        p-4
        outline-none
        dark:bg-slate-800
        dark:border-cyan-400/20
        "
      />

      <div className="flex justify-between mt-4">

        <button className="text-cyan-400">
          📎 Attach File
        </button>

        <button
          className="
          bg-gradient-to-r
          from-cyan-500
          to-purple-600
          px-6
          py-3
          rounded-xl
          "
        >
          Send Reply
        </button>

      </div>

    </div>
  );
}