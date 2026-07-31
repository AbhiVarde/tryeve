import type { ElementType, ReactNode } from "react";

type AppShellProps = {
  children: ReactNode;
  as?: ElementType;
  variant?: "row" | "column";
  className?: string;
};

export function AppShell({
  children,
  as: Component = "div",
  variant = "row",
  className = "",
}: AppShellProps) {
  const layout =
    variant === "row"
      ? "flex h-screen w-full overflow-hidden"
      : "flex min-h-screen w-full flex-col overflow-hidden";

  return (
    <Component
      className={`relative mx-auto max-w-screen-2xl ${layout} ${className}`}
    >
      {children}
    </Component>
  );
}
