// src/components/UniversalPool.tsx
import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const LOCAL_MARKETS = ["Local Market A", "Local Market B"];
const SUPERMARKETS = ["Supermarket A", "Supermarket B", "Supermarket C"];

/**
 * UniversalPool:
 * - shows combined items from supermarket_stock + localmarket_stock that are near expiry (<=7 days)
 *   OR have "overstock" (quantity > 100) — threshold is adjustable here.
 * - allows a user to "claim" an item into a selected destination (supermarket/localmarket)
 */
export default function UniversalPool({ currentPlace }: { currentPlace?: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dest, setDest] = useState<string | null>(null);

  const { data: supermarket } = useQuery({
    queryKey: ["pool-supermarket"],
    queryFn: async () => {
      const { data } = await supabase.from("supermarket_stock").select("*");
      return data ?? [];
    },
  });

  const { data: local } = useQuery({
    queryKey: ["pool-localmarket"],
    queryFn: async () => {
      const { data } = await supabase.from("localmarket_stock").select("*");
      return data ?? [];
    },
  });

  const pool = useMemo(() => {
    const arr: any[] = [];
    const now = Date.now();
    const nearExpiry = (item: any) => {
      if (!item?.expiry_date) return false;
      const diff = (new Date(item.expiry_date).getTime() - now) / (1000 * 60 * 60 * 24);
      return diff >= 0 && diff <= 7;
    };
    (supermarket ?? []).forEach((s: any) => {
      if (nearExpiry(s) || (s.quantity ?? 0) > 100) arr.push({ ...s, source: "supermarket" });
    });
    (local ?? []).forEach((s: any) => {
      if (nearExpiry(s) || (s.quantity ?? 0) > 100) arr.push({ ...s, source: "localmarket" });
    });
    return arr;
  }, [supermarket, local]);

  const handleClaim = async (item: any, targetType: "supermarket" | "localmarket", targetName: string) => {
    try {
      // Create new row in destination
      const payload = {
        product_id: item.product_id,
        product_name: item.product_name,
        category: item.category,
        company_name: targetName,
        is_perishable: item.is_perishable,
        shelf_life_days: item.shelf_life_days,
        storage_temperature: item.storage_temperature,
        lot_id: item.lot_id ?? `LOT-${Date.now().toString(36).slice(-6)}`,
        quantity: item.quantity,
        manufacturing_date: item.manufacturing_date,
        expiry_date: item.expiry_date,
        price_per_unit: Number(item.price_per_unit) || 0,
        source_producer: item.source_producer ?? item.company_name,
        transfer_date: new Date().toISOString(),
      };

      if (targetType === "supermarket") {
        const { error } = await supabase.from("supermarket_stock").insert([payload as any]);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("localmarket_stock").insert([payload as any]);
        if (error) throw error;
      }

      // delete original row (either local or supermarket)
      if (item.source === "supermarket") {
        await supabase.from("supermarket_stock").delete().eq("id", item.id);
      } else {
        await supabase.from("localmarket_stock").delete().eq("id", item.id);
      }

      toast({ title: "Claimed", description: `${item.product_name} moved to ${targetName}` });
      qc.invalidateQueries({ queryKey: ["pool-supermarket"] });
      qc.invalidateQueries({ queryKey: ["pool-localmarket"] });
      qc.invalidateQueries({ queryKey: ["supermarket-stock"] });
      qc.invalidateQueries({ queryKey: ["localmarket-stock"] });
    } catch (err: any) {
      toast({ title: "Error", description: err?.message ?? "Failed", variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Universal Pool</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-3">
          <div className="flex gap-2 items-center">
            <div className="text-sm text-muted-foreground">Destination:</div>
            <Select value={dest ?? ""} onValueChange={(v) => setDest(v || null)}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select destination" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">— Choose —</SelectItem>
                <SelectItem value="__sep__" disabled>-- Supermarkets --</SelectItem>
                {SUPERMARKETS.map((s) => (
                  <SelectItem key={`s-${s}`} value={`supermarket|${s}`}>{s}</SelectItem>
                ))}
                <SelectItem value="__sep2__" disabled>-- Local Markets --</SelectItem>
                {LOCAL_MARKETS.map((l) => (
                  <SelectItem key={`l-${l}`} value={`local|${l}`}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {pool.length === 0 ? (
          <div className="text-center text-muted-foreground">No pool items (near-expiry or overstock)</div>
        ) : (
          pool.map((p) => (
            <div key={p.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-md mb-2">
              <div>
                <div className="font-medium">{p.product_name}</div>
                <div className="text-xs text-muted-foreground">{p.quantity} units • from {p.company_name || p.source_producer}</div>
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    if (!dest) return toast({ title: "Select destination", description: "Choose a destination first", variant: "destructive" });
                    const [type, name] = (dest || "").split("|");
                    handleClaim(p, type === "supermarket" ? "supermarket" : "localmarket", name);
                  }}
                >
                  Claim
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
