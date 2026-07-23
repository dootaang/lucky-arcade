import { cva, type VariantProps } from "class-variance-authority";
import { clsx, type ClassValue } from "clsx";
import type { ButtonHTMLAttributes } from "react";
import { twMerge } from "tailwind-merge";

export function cn(...values: ClassValue[]): string { return twMerge(clsx(values)); }

const buttonVariants = cva(
  "inline-flex min-h-11 items-center justify-center rounded-xl px-4 font-semibold transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] motion-reduce:transition-none",
  { variants: { variant: { primary: "bg-[var(--accent)] text-[var(--canvas)]", secondary: "border border-[var(--line)] bg-[var(--surface)] text-[var(--text)]" } }, defaultVariants: { variant: "primary" } },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>;
export function Button({ className, variant, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant }), className)} {...props} />;
}
