import { Shimmer } from "@/components/ai-elements/shimmer";
import { TopBar } from "@/components/topbar";
import { BackgroundGlow } from "@/components/background-glow";

export default function Loading() {
  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-hidden">
      <TopBar />

      <div className="relative flex flex-1 items-center justify-center">
        <BackgroundGlow />
        <Shimmer className="relative z-10 font-mono text-sm" duration={1.5}>
          loading shared agent...
        </Shimmer>
      </div>
    </div>
  );
}
