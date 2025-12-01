// src/components/SupermarketDashboard.tsx
import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";

import { Button } from "@/components/ui/button";
import { AlertTriangle, Send, Check, X } from "lucide-react";

import PredictionChart from "@/components/PredictionChart";
import DemandAnalysis from "@/components/DemandAnalysis";
import UniversalPool from "@/components/UniversalPool";

import type { TablesInsert } from "@/integrations/supabase/types";

const SUPERMARKETS = ["Supermarket A", "Supermarket B", "Supermarket C"];
const LOCAL_MARKETS = ["Local Market A", "Local Market B"];

type SupermarketRow = any;
type LocalInsert = TablesInsert<"localmarket_stock">;

export const SupermarketDashboard: React.FC = () => {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [selectedSupermarket, setSelectedSupermarket] = useState<string>(SUPERMARKETS[0]);
  const [selectedProduct, setSelectedProduct] = useState<string>("");

  // incoming (pending) for this supermarket
  const { data: incoming = [] } = useQuery({
    queryKey: ["supermarket-incoming", selectedSupermarket],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supermarket_stock")
        .select("*")
        .eq("company_name", selectedSupermarket)
        .is("accepted_at", null)
        .order("transfer_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // accepted inventory for this supermarket
  const { data: inventory = [], refetch: refetchInv } = useQuery({
    queryKey: ["supermarket-accepted", selectedSupermarket],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supermarket_stock")
        .select("*")
        .eq("company_name", selectedSupermarket)
        .not("accepted_at", "is", null)
        .order("accepted_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // top 10 trending products (use historical_sales fallback)
  const { data: trending = [] } = useQuery({
    queryKey: ["trending", selectedSupermarket],
    queryFn: async () => {
      const { data: hs } = await supabase
        .from("historical_sales")
        .select("product_name, quantity_sold")
        .eq("supermarket_branch", selectedSupermarket);

      if (hs && hs.length > 0) {
        const grouped = Object.values(
          hs.reduce((acc: any, item: any) => {
            if (!acc[item.product_name]) acc[item.product_name] = { product_name: item.product_name, total: 0 };
            acc[item.product_name].total += item.quantity_sold;
            return acc;
          }, {})
        ).sort((a: any, b: any) => b.total - a.total).slice(0, 10);
        return grouped;
      }

      const { data: ss } = await supabase
        .from("supermarket_stock")
        .select("product_name, quantity")
        .eq("company_name", selectedSupermarket);

      if (ss && ss.length > 0) {
        const grouped = Object.values(
          ss.reduce((acc: any, item: any) => {
            if (!acc[item.product_name]) acc[item.product_name] = { product_name: item.product_name, total: 0 };
            acc[item.product_name].total += item.quantity ?? 0;
            return acc;
          }, {})
        ).sort((a: any, b: any) => b.total - a.total).slice(0, 10);
        return grouped;
      }

      return [];
    },
  });

  const handleAccept = async (id: string, name: string) => {
    try {
      const { error } = await supabase.from("supermarket_stock").update({ accepted_at: new Date().toISOString() } as any).eq("id", id);
      if (error) throw error;
      toast({ title: "Accepted", description: `${name} added to inventory` });
      qc.invalidateQueries({ queryKey: ["supermarket-incoming", selectedSupermarket] });
      qc.invalidateQueries({ queryKey: ["supermarket-accepted", selectedSupermarket] });
    } catch (err: any) {
      toast({ title: "Error", description: err?.message ?? "Failed", variant: "destructive" });
    }
  };

  const handleReject = async (id: string, name: string) => {
    try {
      const { error } = await supabase.from("supermarket_stock").delete().eq("id", id);
      if (error) throw error;
      toast({ title: "Rejected", description: `${name} removed` });
      qc.invalidateQueries({ queryKey: ["supermarket-incoming", selectedSupermarket] });
      qc.invalidateQueries({ queryKey: ["supermarket-accepted", selectedSupermarket] });
    } catch (err: any) {
      toast({ title: "Error", description: err?.message ?? "Failed", variant: "destructive" });
    }
  };

  // Ship to local market (opens prompt or could be replaced by a modal)
  const handleShipToLocal = async (item: SupermarketRow) => {
    try {
      const choice = prompt(`Send "${item.product_name}" to which local market?\n${LOCAL_MARKETS.join("\n")}`, LOCAL_MARKETS[0]);
      if (!choice) return;
      if (!LOCAL_MARKETS.includes(choice)) {
        alert("Invalid local market");
        return;
      }

      const payload: LocalInsert = {
        product_id: item.product_id,
        product_name: item.product_name,
        category: item.category,
        company_name: choice,
        is_perishable: item.is_perishable,
        shelf_life_days: item.shelf_life_days,
        storage_temperature: item.storage_temperature,
        lot_id: item.lot_id,
        quantity: item.quantity,
        manufacturing_date: item.manufacturing_date,
        expiry_date: item.expiry_date,
        price_per_unit: Number(item.price_per_unit) * 0.8,
        source_supermarket: item.company_name,
        transfer_date: new Date().toISOString(),
      } as any;

      const { error } = await supabase.from("localmarket_stock").insert([payload]);
      if (error) throw error;

      await supabase.from("supermarket_stock").delete().eq("id", item.id);

      toast({ title: "Shipped", description: `${item.product_name} sent to ${choice}` });
      qc.invalidateQueries({ queryKey: ["supermarket-accepted", selectedSupermarket] });
      qc.invalidateQueries({ queryKey: ["localmarket-pending", choice] });
    } catch (err: any) {
      toast({ title: "Error", description: err?.message ?? "Failed to ship", variant: "destructive" });
    }
  };

  const expiringSoon = useMemo(() => {
    const now = Date.now();
    return (inventory || []).filter((it: any) => {
      if (!it?.expiry_date) return false;
      const diff = (new Date(it.expiry_date).getTime() - now) / (1000 * 60 * 60 * 24);
      return diff >= 0 && diff <= 7;
    }).slice(0, 10);
  }, [inventory]);

  const productList = Array.from(new Set((inventory || []).map((i: any) => i.product_name)));

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center gap-4">
        <h3 className="font-medium">Select Supermarket:</h3>
        <select
          value={selectedSupermarket}
          onChange={(e) => setSelectedSupermarket(e.target.value)}
          className="p-2 border rounded"
        >
          {SUPERMARKETS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <DemandAnalysis />

          <Card>
            <CardHeader>
              <CardTitle>Incoming Stock (for {selectedSupermarket})</CardTitle>
              <CardDescription>Accept or reject incoming transfers</CardDescription>
            </CardHeader>
            <CardContent>
              {(incoming || []).length === 0 ? (
                <p className="text-muted-foreground text-center py-6">No incoming stock</p>
              ) : (incoming || []).map((it: any) => (
                <div key={it.id} className="flex items-center justify-between p-3 bg-muted/30 rounded mb-2">
                  <div>
                    <p className="font-medium">{it.product_name}</p>
                    <p className="text-xs text-muted-foreground">{it.quantity} units • {it.category}</p>
                    <p className="text-xs text-muted-foreground">From: {it.source_producer}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => handleAccept(it.id, it.product_name)}><Check /> Accept</Button>
                    <Button variant="destructive" onClick={() => handleReject(it.id, it.product_name)}><X /> Reject</Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Demand Prediction</CardTitle>
              <CardDescription>Select product to forecast</CardDescription>
            </CardHeader>

            <CardContent>
              <select className="w-full p-2 border rounded mb-4" value={selectedProduct} onChange={(e) => setSelectedProduct(e.target.value)}>
                <option value="">Select product</option>
                {productList.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              {selectedProduct ? <PredictionChart productName={selectedProduct} branch={selectedSupermarket} /> : <div className="text-muted-foreground">Choose a product to see forecast</div>}
            </CardContent>
          </Card>

          <UniversalPool currentPlace={selectedSupermarket} />
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Accepted Inventory</CardTitle>
              <CardDescription>Manage stock for {selectedSupermarket}</CardDescription>
            </CardHeader>
            <CardContent>
              {(inventory || []).map((item: any) => (
                <div key={item.id} className="flex items-center justify-between p-3 bg-muted/30 rounded mb-2">
                  <div>
                    <p className="font-medium">{item.product_name}</p>
                    <p className="text-xs text-muted-foreground">{item.quantity} units • {item.category}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => handleShipToLocal(item)}><Send /> Ship to Local</Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive">Expiring Soon</CardTitle>
              <CardDescription>Items expiring in next 7 days</CardDescription>
            </CardHeader>
            <CardContent>
              {expiringSoon.length === 0 ? (
                <p className="text-muted-foreground text-center">No expiring items</p>
              ) : expiringSoon.map((it: any) => (
                <div key={it.id} className="p-3 bg-destructive/10 rounded mb-2 flex justify-between">
                  <div>
                    <p className="font-medium text-destructive">{it.product_name}</p>
                    <p className="text-xs text-muted-foreground">{it.quantity} units</p>
                  </div>
                  <div>
                    <Button size="sm" onClick={() => handleShipToLocal(it)}>Send</Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Trending (Top 10)</CardTitle>
              <CardDescription>By sales or available quantity</CardDescription>
            </CardHeader>
            <CardContent>
              {(trending || []).length === 0 ? (
                <div className="text-muted-foreground">No trending data</div>
              ) : (trending || []).map((t: any, idx: number) => (
                <div key={idx} className="flex justify-between py-1">
                  <div className="text-sm">{t.product_name}</div>
                  <div className="text-sm font-medium">{t.total ?? t.quantity_sold ?? 0}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default SupermarketDashboard;
