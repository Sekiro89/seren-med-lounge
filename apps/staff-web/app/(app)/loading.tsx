import { Skeleton } from '../../components/ui/skeleton';

export default function AppLoading() {
  return (
    <div role="status" aria-label="Loading">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="mt-8 h-40 w-full" />
    </div>
  );
}
