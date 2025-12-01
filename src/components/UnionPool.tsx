// src/components/UnionPool.tsx
import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const LOCAL_MARKETS = ["Local Market A", "Local Market B"];
const SUPERMARKETS = ["Supermarket A", "Supermarket B", "Supermarket C"];

/**
 * UnionPool shows items posted by supermarkets/localmarkets as "overstock/near-expiry"
 * Other markets can accept them. This component can be embedded in all dashboards.
 */
const UnionPool: React.FC<{ currentView?: "producer" | "supermarket" | "local"; currentName?: string }> = ({
  currentView,
  currentName,
}) => {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: poolItems = [], isLoading } = useQuery({
    queryKey: ["union-pool"],
    queryFn: async () => {
      // fetch items from both supermarket_stock and localmarket_stock where marked as overstock/near-expiry
      // we'll approximate by items with transfer_date not null and (quantity > threshold OR expiry within 7 days)
      const ms = await supabase
        .from("supermarket_stock")
        .select("*")
        .order("expiry_date", { ascending: true });

      const lm = await supabase
        .from("localmarket_stock")
        .select("*")
        .order("expiry_date", { ascending: true });

      const msData = (ms as any).data || [];
      const lmData = (lm as any).data || [];

      // combine, add a field origin_type/origin_name
      const combined = [
        ...msData.map((r: any) => ({ ...r, origin_type: "supermarket", origin_name: r.company_name })),
        ...lmData.map((r: any) => ({ ...r, origin_type: "localmarket", origin_name: r.company_name })),
      ];

      // filter near-expiry or quantity above a small threshold (configurable)
      const thresholdQty = 50;
      const today = Date.now();
      const filtered = combined.filter((i: any) => {
        const expiryDays = i.expiry_date ? (new Date(i.expiry_date).getTime() - today) / (1000 * 60 * 60 * 24) : 9999;
        return expiryDays >= 0 && expiryDays <= 7 || (i.quantity ?? 0) >= thresholdQty;
      });

      return filtered;
    },
  });

  // accept a pool item into current market
  const handleAccept = async (item: any, destinationType: "supermarket" | "localmarket", destinationName: string) => {
    try {
      // Prepare payload for the destination table
      const payload = {
        product_id: item.product_id,
        product_name: item.product_name,
        category: item.category,
        company_name: destinationName,
        is_perishable: item.is_perishable,
        shelf_life_days: item.shelf_life_days,
        storage_temperature: item.storage_temperature,
        lot_id: item.lot_id,
        quantity: item.quantity,
        manufacturing_date: item.manufacturing_date,
        expiry_date: item.expiry_date,
        price_per_unit: item.price_per_unit,
        // track origin
        source_producer: item.origin_type === "supermarket" ? item.origin_name : null,
        source_supermarket: item.origin_type === "localmarket" ? item.origin_name : null,
        transfer_date: new Date().toISOString(),
      } as any;

      if (destinationType === "supermarket") {
        const { error } = await supabase.from("supermarket_stock").insert([payload]);
        if (error) throw error;
      } else {
        // localmarket
        const { error } = await supabase.from("localmarket_stock").insert([payload]);
        if (error) throw error;
      }

      // delete original row from origin table so pool clears
      if (item.origin_type === "supermarket") {
        await supabase.from("supermarket_stock").delete().eq("id", item.id);
      } else {
        await supabase.from("localmarket_stock").delete().eq("id", item.id);
      }

      toast({ title: "Accepted from pool", description: `${item.product_name} moved to ${destinationName}` });
      qc.invalidateQueries({ queryKey: ["union-pool"] });
      qc.invalidateQueries({ queryKey: ["supermarket-stock"] });
      qc.invalidateQueries({ queryKey: ["localmarket-stock"] });
    } catch (err: any) {
      toast({ title: "Error", description: err?.message ?? "Failed", variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Union Pool — Overstocks & Near-expiry</CardTitle>
        <CardDescription>Items posted by supermarkets/local markets for redistribution</CardDescription>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <p>Loading pool...</p>
        ) : poolItems.length === 0 ? (
          <p className="text-muted-foreground">No pool items found</p>
        ) : (
          poolItems.map((it: any) => {
            const daysLeft = it.expiry_date ? Math.ceil((new Date(it.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
            return (
              <div key={it.id} className="flex items-center justify-between p-3 rounded-md bg-muted/20 mb-2">
                <div>
                  <p className="font-medium">{it.product_name}</p>
                  <p className="text-xs text-muted-foreground">{it.quantity} units • from {it.origin_name} ({it.origin_type}) {daysLeft !== null && <>• {daysLeft}d left</>}</p>
                </div>
                <div className="flex gap-2">
                  <Select
                    value={undefined}
                    onValueChange={async (v) => {
                      // v will be like "supermarket:Supermarket A" or "local:Local Market A"
                      const [type, name] = (v || "").split(":");
                      if (!type || !name) return;
                      await handleAccept(it, type === "supermarket" ? "supermarket" : "localmarket", name);
                    }}
                  >
                    <SelectTrigger className="w-44">
                      <SelectValue placeholder="Accept into..." />
                    </SelectTrigger>
                    <SelectContent>
                      {SUPERMARKETS.map((s) => <SelectItem key={`s-${s}`} value={`supermarket:${s}`}>{s}</SelectItem>)}
                      {LOCAL_MARKETS.map((l) => <SelectItem key={`l-${l}`} value={`local:${l}`}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
};

export default UnionPool;
