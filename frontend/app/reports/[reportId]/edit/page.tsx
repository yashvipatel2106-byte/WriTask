import ReportEditClient from "@/components/reports/ReportEditClient";

export const dynamic = "force-dynamic";
export const dynamicParams = true;

export default async function EditReportPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const { reportId } = await params;
  return <ReportEditClient reportId={reportId} />;
}
