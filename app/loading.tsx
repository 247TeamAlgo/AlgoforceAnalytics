import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div className="fixed top-0 left-0 w-full h-full flex justify-center items-center bg-background bg-opacity-75 z-50">
      <Loader2 size={30} className="animate-spin text-primary" />
    </div>
  );
}
