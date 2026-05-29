"use client";

import { type ReactNode } from "react";
import { type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui";

/**
 * "Nothing here" placeholder for empty tables / lists / charts. Renders inside
 * a Card with optional icon, heading, body, and a single CTA slot.
 *
 * Pass `bare` to drop the wrapping Card — use it when the empty state already
 * sits inside a Card (e.g. an empty table body) to avoid a Card-in-Card.
 */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  bare = false,
}: {
  icon?: LucideIcon;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  bare?: boolean;
}) {
  const content = (
    <>
      {Icon && <Icon className="h-10 w-10 text-muted" aria-hidden />}
      <h3 className="text-h2 text-gray-900">{title}</h3>
      {body && <p className="text-body max-w-sm text-muted">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </>
  );
  const layout = "flex flex-col items-center justify-center gap-2 p-8 text-center";
  if (bare) return <div className={layout}>{content}</div>;
  return <Card className={layout}>{content}</Card>;
}
