export interface UserListSkeletonProps {
  rows?: number;
}

/** Skeleton rows (ui-std: skeletons, not spinners). */
export function UserListSkeleton({ rows = 4 }: UserListSkeletonProps) {
  return (
    <div className="grid gap-2" aria-busy="true" aria-label="Loading users">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl border border-line p-3">
          <span className="h-9 w-9 animate-pulse rounded-full bg-raised" />
          <span className="grid flex-1 gap-1.5">
            <span className="h-3 w-40 animate-pulse rounded bg-raised" />
            <span className="h-2.5 w-24 animate-pulse rounded bg-raised" />
          </span>
          <span className="h-5 w-16 animate-pulse rounded-full bg-raised" />
        </div>
      ))}
    </div>
  );
}
