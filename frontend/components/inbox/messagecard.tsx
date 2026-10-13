type Props = {
  name: string;
  subject: string;
  time: string;
};

export default function MessageCard({
  name,
  subject,
  time,
}: Props) {
  return (
    <div
      className="
      bg-[#07153D]
      border
      border-cyan-500/20
      rounded-xl
      p-4
      hover:bg-[#0A1F50]
      cursor-pointer
      transition
      dark:bg-slate-900
      dark:border-cyan-400/20
      dark:hover:bg-slate-800
      "
    >
      <div className="flex justify-between">
        <h3 className="font-semibold text-white">
          {name}
        </h3>

        <span className="text-xs text-cyan-400">
          {time}
        </span>
      </div>

      <p className="text-gray-400 text-sm mt-2 dark:text-slate-500">
        {subject}
      </p>
    </div>
  );
}