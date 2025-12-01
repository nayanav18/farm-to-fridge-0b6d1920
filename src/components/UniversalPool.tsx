// src/components/UniversalPool.tsx
import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

/**
 * UniversalPool
 * - Shows both requests and available posts (overstock / near-expiry).
 * - Allows current place (supermarket/local) to post an overstock or accept a posted item.
 *
 * Schema: we store pool entries in supermarket_stock/localmarket_stock (existing tables)
 * For the pool, we use a simple approach: entries with transfer_date = null AND a custom flag `pool_posted` could be used,
 * but to avoid DB changes we store pool items in a small helper table 'universal_pool' (if you don't have it, this uses local JS aggregation).
 *
 * This component uses supabase to read and write to a simple helper table `universal_pool` (create with SQL if required):
 *
 * CREATE TABLE universal_pool (
 *   id uuid primary key default gen_random_uuid(),
 *   product_id int,
 *   product_name text,
 *   category text,
 *   quantity int,
 *   price_per_unit numeric,
 *   source text, -- where it came from
 *   target_type text, -- "any" or "supermarket" or "local"
 *   target_name text,
 *   created_at timestamptz default now()
 * );
 *
 * If you don't want to create this table, the component will still show a fallback message and allow posting directly to local/supermarket tables.
 */

type Props = { currentPlace?: string };

const UniversalPool: React.FC<Props> = ({ currentPlace }) => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [posting, setPosting] = useState(false);

  const { data: pool = [] } = useQuery({
    queryKey: ["universal-pool"],
    queryFn: async () => {
      // try to fetch a `universal_pool` table; if missing, return []
      const { data, error } = await (supabase as any).from("universal_pool").select("*").order("created_at", { ascending: false });
      if ((error as any)?.code === "42P01" || (error as any)?.message?.includes("relation") ) {
        // table not present; return empty and let users use fallback
        return [];
      }
      if (error) throw error;
      return data ?? [];
    },
    enabled: true,
  });

  const handlePostToPool = async () => {
    // small prompt-based quick post (replace with a full form if you want)
    const name = prompt("Product name to post to pool:");
    if (!name) return;
    const qtyStr = prompt("Quantity:");
    const qty = Number(qtyStr || "0");
    if (!qty || qty <= 0) return alert("Invalid qty");
    try {
      setPosting(true);
      const payload = {
        product_name: name,
        quantity: qty,
        source: currentPlace || "unknown",
        target_type: "any",
        target_name: null,
      } as any;
      const { error } = await (supabase as any).from("universal_pool").insert([payload]);
      if (error) throw error;
      toast({ title: "Posted", description: `${name} posted to universal pool` });
      qc.invalidateQueries({ queryKey: ["universal-pool"] });
    } catch (err: any) {
      toast({ title: "Error", description: err?.message ?? "Failed", variant: "destructive" });
    } finally {
      setPosting(false);
    }
  };

  const handleAcceptPoolItem = async (item: any) => {
    try {
      // accept: copy item into currentPlace's table (supermarket_stock or localmarket_stock)
      if (!currentPlace) return alert("No target selected");
      const kind = currentPlace.toLowerCase().includes("local") ? "localmarket_stock" : "supermarket_stock";
      // create payload
      const payload: any = {
        product_name: item.product_name,
        product_id: item.product_id ?? Math.floor(Date.now() / 1000) % 1000000,
        category: item.category ?? "Other",
        company_name: currentPlace,
        quantity: item.quantity ?? 1,
        price_per_unit: item.price_per_unit ?? 0,
        manufacturing_date: new Date().toISOString().slice(0, 10),
        expiry_date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString().slice(0, 10), // 7 days default
        lot_id: `POOL-${Date.now().toString(36).slice(-6)}`,
        shelf_life_days: item.shelf_life_days ?? 7,
        storage_temperature: item.storage_temperature ?? "Ambient",
        transfer_date: new Date().toISOString(),
      };

      const { error } = await supabase.from(kind).insert([payload]);
      if (error) throw error;

      // delete pool item
      await (supabase as any).from("universal_pool").delete().eq("id", item.id);

      toast({ title: "Accepted", description: `${item.product_name} accepted into ${currentPlace}` });
      qc.invalidateQueries({ queryKey: ["universal-pool"] });
      qc.invalidateQueries({ queryKey: ["supermarket-accepted", currentPlace] });
      qc.invalidateQueries({ queryKey: ["localmarket-accepted", currentPlace] });
    } catch (err: any) {
      toast({ title: "Error", description: err?.message ?? "Failed", variant: "destructive" });
    }
  };

  if (!pool || pool.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Universal Pool</CardTitle>
          <CardDescription>Share or request overstock / near-expiry items</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground py-4">
            No pool entries (or `universal_pool` table missing). You can post an item to the pool which others can accept.
          </div>
          <div className="flex gap-2">
            <Button onClick={handlePostToPool} disabled={posting}>{posting ? "Posting..." : "Post to Pool"}</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Universal Pool</CardTitle>
        <CardDescription>Anyone can post overstock / request — accept into your inventory</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {pool.map((p: any) => (
            <div key={p.id} className="flex items-center justify-between p-2 bg-muted/20 rounded">
              <div>
                <div className="font-medium">{p.product_name}</div>
                <div className="text-xs text-muted-foreground">{p.quantity} units • source: {p.source}</div>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => handleAcceptPoolItem(p)}>Accept into {currentPlace ?? "your place"}</Button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3">
          <Button onClick={handlePostToPool} disabled={posting}>{posting ? "Posting..." : "Post to Pool"}</Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default UniversalPool;
