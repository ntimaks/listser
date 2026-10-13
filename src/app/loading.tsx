import { ListSkeleton } from "@/components/Skeleton";

// Shown the moment you open the app or switch lists, while the server loads
// the list. Prefetched with the route, so navigation never looks stuck.
export default function Loading() {
  return <ListSkeleton />;
}
