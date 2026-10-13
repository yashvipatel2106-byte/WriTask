import ReportViewClient from "@/components/reports/ReportViewClient";

export const dynamic = "force-dynamic";
export const dynamicParams = true;

export default async function ReportViewPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const { reportId } = await params;
  return <ReportViewClient reportId={reportId} />;
}
