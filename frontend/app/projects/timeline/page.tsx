"use client";

import Sidebar from "@/components/sidebar/sidebar";

export default function TimelinePage() {

  const projects = [
    {
      name:"Website",
      width:"75%"
    },
    {
      name:"Mobile App",
      width:"45%"
    },
    {
      name:"CRM",
      width:"90%"
    }
  ];

  return (
    <div className="flex">
      <Sidebar />

      <main className="flex-1 bg-[#F6F9FC] min-h-screen text-slate-900 p-8 dark:bg-slate-950 dark:text-slate-100">

        <h1 className="text-4xl font-bold mb-8">
          Project Timeline
        </h1>

        <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm dark:bg-slate-900 dark:border-slate-800">

          {projects.map((p,index)=>(
            <div
              key={index}
              className="mb-8"
            >
              <p className="mb-2 text-slate-700 dark:text-slate-200">
                {p.name}
              </p>

              <div className="h-8 bg-slate-100 rounded-full dark:bg-slate-800">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-purple-600 rounded-full"
                  style={{
                    width:p.width
                  }}
                />
              </div>
            </div>
          ))}

        </div>

      </main>
    </div>
  );
}