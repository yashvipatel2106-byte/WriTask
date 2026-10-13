import ReplyBox from "./ReplayBox";

export default function MessageDetails() {
  return (
    <div
      className="
      bg-[#07153D]
      rounded-2xl
      border
      border-cyan-500/20
      p-6
      dark:bg-slate-900
      dark:border-cyan-400/20
      "
    >

      <div className="border-b border-cyan-500/20 pb-4 dark:border-cyan-400/20">

        <h2 className="text-3xl font-bold text-white">
          Dashboard Design Review
        </h2>

        <p className="text-gray-400 mt-2 dark:text-slate-500">
          From John Smith • Today 10:30 AM
        </p>

      </div>

      <div className="mt-6">

        <p className="text-gray-300 leading-8 dark:text-slate-300">
          Please review the latest dashboard design.
          We need feedback on cards, charts,
          project statistics and overall layout
          before deployment.
        </p>

      </div>

      <div className="mt-8">

        <h3 className="font-semibold mb-3">
          Attachments
        </h3>

        <div className="grid grid-cols-2 gap-4">

          <div className="bg-[#020B2A] p-4 rounded-xl dark:bg-slate-800">
            📄 dashboard-design.fig
          </div>

          <div className="bg-[#020B2A] p-4 rounded-xl dark:bg-slate-800">
            📊 project-report.pdf
          </div>

        </div>

      </div>

      <div className="mt-8">

        <h3 className="font-semibold mb-4">
          Activity Timeline
        </h3>

        <div className="space-y-4">

          <div>
            <p className="text-cyan-400">
              Task Assigned
            </p>

            <p className="text-sm text-gray-400 dark:text-slate-500">
              Today 09:00 AM
            </p>
          </div>

          <div>
            <p className="text-purple-400">
              Attachment Added
            </p>

            <p className="text-sm text-gray-400 dark:text-slate-500">
              Yesterday
            </p>
          </div>

        </div>

      </div>

      <ReplyBox />

    </div>
  );
}