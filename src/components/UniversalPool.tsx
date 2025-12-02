// src/components/UniversalPool.tsx
import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

type PoolRow = {
  id?: string;
  product_name?: string;
  quantity?: number;
  source?: string | null;
  created_at?: string | null;
  lot_id?: string;
  expiry_date?: string | null;
  [k: string]: any;
};

export default function UniversalPool({ currentPlace }: { currentPlace?: string }) {
  const { toast } = useToast();
  const [pool, setPool] = useState<PoolRow[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchPool = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from("universal_pool" as any).select("*").order("created_at", { ascending: false }).limit(200);
      if (error) {
        console.warn("universal_pool read error:", error.message || error);
        setPool([]);
        setLoading(false);
        return;
      }
      setPool((data as PoolRow[]) ?? []);
    } catch (err) {
      console.error(err);
      setPool([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPool();
  }, []);

  const postToPool = async () => {
    const product_name = prompt("Product name to post to the universal pool:");
    if (!product_name) return;
    const qtyStr = prompt("Quantity:");
    if (!qtyStr) return;
    const qty = Number(qtyStr);
    if (isNaN(qty) || qty <= 0) return alert("Invalid quantity");

    try {
      const payload = {
        product_name,
        quantity: qty,
        source: currentPlace || "unknown",
        created_at: new Date().toISOString(),
      } as any;
      const { error } = await supabase.from("universal_pool" as any).insert([payload]);
      if (error) throw error;
      toast({ title: "Posted", description: `Posted ${product_name} x${qty} to pool` });
      fetchPool();
    } catch (err: any) {
      toast({ title: "Error", description: err?.message ?? "Failed", variant: "destructive" });
    }
  };

  const acceptPool = async (row: PoolRow) => {
    try {
      const target = prompt(`Accept ${row.product_name} x${row.quantity} from pool. Send to (local/supermarket):\nExample: local:Local Market A or supermarket:Supermarket A`);
      if (!target) return;
      const parts = target.split(":");
      if (parts.length !== 2) return alert("Invalid target format");
      const [t, name] = parts;
      if (t === "local") {
        const payload = {
          product_id: Math.floor(Date.now() / 1000) % 1000000,
          product_name: row.product_name,
          category: row.category ?? "Other",
          company_name: name,
          quantity: row.quantity ?? 0,
          transfer_date: new Date().toISOString(),
          manufacturing_date: row.manufacturing_date ?? new Date().toISOString(),
          expiry_date: row.expiry_date ?? new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
          price_per_unit: row.price_per_unit ?? 0,
          shelf_life_days: row.shelf_life_days ?? 7,
          storage_temperature: row.storage_temperature ?? "Ambient",
          lot_id: row.lot_id ?? `POOL-${Date.now().toString(36).slice(-6)}`,
          source_supermarket: row.source ?? null,
        } as any;
        const { error } = await supabase.from("localmarket_stock").insert([payload]);
        if (error) throw error;
      } else if (t === "supermarket") {
        const payload = {
          product_id: Math.floor(Date.now() / 1000) % 1000000,
          product_name: row.product_name,
          category: row.category ?? "Other",
          company_name: name,
          quantity: row.quantity ?? 0,
          transfer_date: new Date().toISOString(),
          manufacturing_date: row.manufacturing_date ?? new Date().toISOString(),
          expiry_date: row.expiry_date ?? new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
          price_per_unit: row.price_per_unit ?? 0,
          shelf_life_days: row.shelf_life_days ?? 7,
          storage_temperature: row.storage_temperature ?? "Ambient",
          lot_id: row.lot_id ?? `POOL-${Date.now().toString(36).slice(-6)}`,
          source_producer: row.source ?? null,
        } as any;
        const { error } = await supabase.from("supermarket_stock").insert([payload]);
        if (error) throw error;
      } else {
        return alert("Invalid target type");
      }

      const { error: delErr } = await supabase.from("universal_pool" as any).delete().eq("id", row.id);
      if (delErr) console.warn("failed to delete pool row", delErr);
      toast({ title: "Accepted", description: `Accepted ${row.product_name}` });
      fetchPool();
    } catch (err: any) {
      toast({ title: "Error", description: err?.message ?? "Failed", variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Universal Pool</CardTitle>
        <CardDescription>Share or request overstock / near-expiry items</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-muted-foreground">Loading pool...</div>
        ) : pool.length === 0 ? (
          <div className="text-muted-foreground">No pool entries (or `universal_pool` table missing).</div>
        ) : (
          pool.map((p) => (
            <div key={p.id} className="flex items-center justify-between p-3 bg-muted/10 rounded mb-2">
              <div>
                <div className="font-medium">{p.product_name}</div>
                <div className="text-xs text-muted-foreground">{p.quantity} units • from {p.source}</div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => acceptPool(p)}>Accept</Button>
              </div>
            </div>
          ))
        )}

        <div className="mt-4">
          <Button onClick={postToPool}>Post to Pool</Button>
        </div>
      </CardContent>
    </Card>
  );
}
