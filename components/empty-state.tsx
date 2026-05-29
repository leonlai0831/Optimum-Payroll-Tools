"use client";

import { type ReactNode } from "react";
import { type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui";

/**
 * "Nothing here" placeholder for empty tables / lists / charts. Renders inside
 * a Card with optional icon, heading, body, and a single CTA slot.
 */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Card className="flex flex-col items-center justify-center gap-2 p-8 text-center">
      {Icon && <Icon className="h-10 w-10 text-muted" aria-hidden />}
      <h3 className="text-h2 text-gray-900">{title}</h3>
      {body && <p className="text-body max-w-sm text-muted">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </Card>
  );
}
