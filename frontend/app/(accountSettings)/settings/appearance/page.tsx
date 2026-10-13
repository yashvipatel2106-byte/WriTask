import ThemePreferences from "@/components/settings/ThemePreferences";

export default function AppearanceSettingsPage() {
  return (
    <div className="w-full max-w-6xl">
      <h1 className="text-3xl font-bold mb-2 text-slate-900 dark:text-slate-100">Appearance</h1>
      <p className="text-slate-500 mb-8 dark:text-slate-400">
        Select a complete colour scheme for your workspace.
      </p>
      <ThemePreferences />
    </div>
  );
}
