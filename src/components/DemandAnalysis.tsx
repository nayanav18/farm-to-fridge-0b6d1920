// src/components/DemandAnalysis.tsx
import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

export default function DemandAnalysis({ branch }: { branch?: string }) {
  const [items, setItems] = useState<{ product_name: string; total: number }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // Attempt to get last 14 days demand sum from historical_sales
        const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

        const { data: hs, error } = await supabase
          .from("historical_sales")
          .select("product_name, quantity_sold, date")
          .gte("date", since)
          .maybeSingle();

        // Query rows instead of maybeSingle
        const { data: rows, error: rowsErr } = await supabase
          .from("historical_sales")
          .select("product_name, quantity_sold, date")
          .gte("date", since)
          .order("quantity_sold", { ascending: false })
          .limit(20);

        if (rowsErr) {
          console.warn("historical_sales error", rowsErr);
        }

        if (rows && rows.length > 0) {
          const grouped: Record<string, number> = {};
          rows.forEach((r: any) => {
            grouped[r.product_name] = (grouped[r.product_name] || 0) + Number(r.quantity_sold || 0);
          });
          const arr = Object.entries(grouped).map(([product_name, total]) => ({ product_name, total }));
          arr.sort((a, b) => b.total - a.total);
          setItems(arr.slice(0, 10));
          setLoading(false);
          return;
        }

        // fallback: get recent supermarket_stock transfers for branch
        const { data: transfers } = await supabase
          .from("supermarket_stock")
          .select("product_name, transfer_date, quantity")
          .order("transfer_date", { ascending: false })
          .limit(100);

        if (transfers && transfers.length > 0) {
          const g: Record<string, number> = {};
          transfers.forEach((t: any) => (g[t.product_name] = (g[t.product_name] || 0) + Number(t.quantity || 0)));
          const arr = Object.entries(g).map(([product_name, total]) => ({ product_name, total }));
          arr.sort((a, b) => b.total - a.total);
          setItems(arr.slice(0, 10));
        } else {
          setItems([]);
        }
      } catch (err) {
        console.error(err);
        setItems([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [branch]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Currently in Demand (last 14 days)</CardTitle>
        <CardDescription>Recent high-demand items</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-muted-foreground">Loading...</div>
        ) : items.length === 0 ? (
          <div className="text-muted-foreground">No recent demand data</div>
        ) : (
          <ol className="list-decimal pl-5 space-y-1">
            {items.map((it) => (
              <li key={it.product_name} className="text-sm">{it.product_name} — {it.total}</li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
