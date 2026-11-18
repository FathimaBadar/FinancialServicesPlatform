export interface CaseTableSkeletonProps {
  compact: boolean;
  rows?: number;
}

/** Skeleton rows while a page loads (ui-std: skeletons, not spinners). */
export function CaseTableSkeleton({ compact, rows = 6 }: CaseTableSkeletonProps) {
  return (
    <div className="grid gap-2" aria-busy="true" aria-label="Loading KYC cases">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-xl border border-line p-3">
          <span className="grid flex-1 gap-1.5">
            <span className="h-3 w-48 max-w-full animate-pulse rounded bg-raised" />
            <span className="h-2.5 w-28 animate-pulse rounded bg-raised" />
          </span>
          <span className="h-5 w-24 animate-pulse rounded-full bg-raised" />
          {!compact && (
            <>
              <span className="h-5 w-20 animate-pulse rounded-full bg-raised" />
              <span className="h-3 w-16 animate-pulse rounded bg-raised" />
            </>
          )}
        </div>
      ))}
    </div>
  );
}
