// DemandAnalysis.tsx
import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default function DemandAnalysis({ data }: { data?: any[] }) {
  const counts = (data || []).reduce((acc: Record<string, number>, row: any) => {
    const name = row?.product_name || "Unknown";
    acc[name] = (acc[name] || 0) + (Number(row?.quantity || 0));
    return acc;
  }, {});

  // fixed typing for Object.entries
  const sorted: [string, number][] = Object.entries(counts as Record<string, number>)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Currently in Demand</CardTitle>
      </CardHeader>

      <CardContent>
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">No trending products</p>
        ) : (
          <ol className="list-decimal pl-5 space-y-1">
            {sorted.map(([name, qty]) => (
              <li key={name} className="text-sm">{name} – {qty} units</li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
