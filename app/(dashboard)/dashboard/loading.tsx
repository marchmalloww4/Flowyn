import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div aria-busy="true" className="space-y-8">
      <div className="space-y-3">
        <Skeleton className="h-4 w-36" label="Loading section label" />
        <Skeleton className="h-10 w-80 max-w-full" label="Loading page heading" />
        <Skeleton className="h-5 w-full max-w-2xl" label="Loading page description" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => <Skeleton className="h-32 rounded-2xl" key={index} label={`Loading summary ${index + 1}`} />)}
      </div>
    </div>
  );
}
