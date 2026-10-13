export type CustomStatusCount = {
    id: string;
    label: string;
    count: number;
  };
  
  export type TaskOverviewData = {
    completed: number;
    inProgress: number;
    review: number;
    todo: number;
    totalTasks: number;
    customStatuses: CustomStatusCount[];
  };
  
  export type ProjectProgressItem = {
    projectName: string;
    progress: number;
    // add other fields your API returns if needed
  };
  
  export type ChartRequestStatus = "idle" | "pending" | "succeeded" | "failed";
  
  export type DashboardChartsState = {
    /** Which org/personal scope the cached data belongs to */
    scopeKey: string | null;
  
    taskOverview: TaskOverviewData | null;
    taskOverviewStatus: ChartRequestStatus;
    taskOverviewError: string | null;
  
    projectProgress: ProjectProgressItem[];
    projectProgressStatus: ChartRequestStatus;
    projectProgressError: string | null;
  };