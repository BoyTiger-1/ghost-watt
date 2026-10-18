import type { ReactNode } from "react";

/** The top of every app page: a quiet eyebrow, a serif headline, one paragraph. */
export function PageHeader({
  eyebrow,
  title,
  accent,
  children,
  className = "",
}: {
  eyebrow: string;
  title: ReactNode;
  /** Optional second line, set in the serif italic. */
  accent?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header className={`max-w-3xl ${className}`}>
      <p className="flex items-center gap-2 text-[0.82rem] text-mist">
        <span className="h-1.5 w-1.5 rounded-full bg-sodium" />
        {eyebrow}
      </p>
      <h1 className="font-editorial mt-4 text-[2.6rem] leading-[1] text-fog sm:text-[3.6rem]">
        {title}
        {accent && (
          <>
            <br />
            <span className="italic text-cyan">{accent}</span>
          </>
        )}
      </h1>
      {children && <div className="mt-5 max-w-[62ch] text-[1.02rem] leading-[1.65] text-mist">{children}</div>}
    </header>
  );
}
