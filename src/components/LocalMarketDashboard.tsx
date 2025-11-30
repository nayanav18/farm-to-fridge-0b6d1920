// src/components/LocalMarketDashboard.tsx
import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CheckCircle, ShoppingCart, AlertTriangle } from "lucide-react";

type LocalRow = {
  id: string;
  product_id: number;
  product_name: string;
  quantity: number;
  expiry_date: string;
  price_per_unit: number;
  company_name: string | null;
  source_supermarket: string | null;
  accepted_at: string | null;
  transfer_date: string | null;
  storage_temperature?: string;
  shelf_life_days?: number;
  created_at?: string | null;
};

const LOCAL_MARKETS = ["Local Market A", "Local Market B", "Local Market C"];

const LocalMarketDashboard: React.FC = () => {
  const { toast } = useToast();

  const { data: pendingTransfers, refetch: refetchPending } = useQuery({
    queryKey: ["localmarket-pending"],
    queryFn: async () => {
      const res = await supabase.from("localmarket_stock").select("*").is("accepted_at", null).order("transfer_date", { ascending: false });
      if ((res as any).error) throw (res as any).error;
      return ((res as any).data ?? []) as LocalRow[];
    },
  });

  const { data: acceptedStock, refetch: refetchAccepted } = useQuery({
    queryKey: ["localmarket-accepted"],
    queryFn: async () => {
      const res = await supabase.from("localmarket_stock").select("*").not("accepted_at", "is", null).order("accepted_at", { ascending: false }).limit(50);
      if ((res as any).error) throw (res as any).error;
      return ((res as any).data ?? []) as LocalRow[];
    },
  });

  const handleAcceptTransfer = async (id: string, productName: string) => {
    try {
      const res = await supabase.from("localmarket_stock").update({ accepted_at: new Date().toISOString() }).eq("id", id);
      if ((res as any).error) throw (res as any).error;

      toast({ title: "Accepted", description: `${productName} added to inventory.` });
      refetchPending();
      refetchAccepted();
    } catch (err: any) {
      toast({ title: "Error", description: err?.message ?? "Failed", variant: "destructive" });
    }
  };

  const expiringSoon = useMemo(() => {
    if (!acceptedStock) return [];
    return acceptedStock.filter(i => {
      const days = (new Date(i.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      return days >= 0 && days <= 3;
    });
  }, [acceptedStock]);

  // Sale modal
  const [saleItem, setSaleItem] = useState<LocalRow | null>(null);
  const [saleQty, setSaleQty] = useState("");

  const handleLogSale = async () => {
    if (!saleItem) return;
    const qty = Number(saleQty);
    if (qty <= 0 || qty > saleItem.quantity) {
      toast({ title: "Invalid quantity", description: "Enter a valid amount.", variant: "destructive" });
      return;
    }

    try {
      // update or delete
      const remaining = saleItem.quantity - qty;
      if (remaining > 0) {
        const res = await supabase.from("localmarket_stock").update({ quantity: remaining }).eq("id", saleItem.id);
        if ((res as any).error) throw (res as any).error;
      } else {
        const res = await supabase.from("localmarket_stock").delete().eq("id", saleItem.id);
        if ((res as any).error) throw (res as any).error;
      }

      toast({ title: "Sale logged", description: `${qty} units sold.` });
      setSaleItem(null);
      setSaleQty("");
      refetchAccepted();
    } catch (err: any) {
      toast({ title: "Error", description: err?.message ?? "Failed", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Total Pending</CardTitle>
            <CardDescription>Awaiting acceptance</CardDescription>
          </CardHeader>
          <CardContent>{pendingTransfers?.length ?? 0}</CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Total Items</CardTitle>
            <CardDescription>Accepted inventory</CardDescription>
          </CardHeader>
          <CardContent>{acceptedStock?.length ?? 0}</CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Total Units</CardTitle>
            <CardDescription>Units counted in accepted stock</CardDescription>
          </CardHeader>
          <CardContent>{acceptedStock?.reduce((s, i) => s + (i.quantity ?? 0), 0) ?? 0}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="bg-accent/5">
          <CardTitle className="flex items-center gap-2 text-accent"><ShoppingCart className="h-5 w-5" /> Pending Transfers</CardTitle>
          <CardDescription>Stock shipped from supermarkets awaiting acceptance</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(pendingTransfers ?? []).map(item => {
            const daysLeft = Math.ceil((new Date(item.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            // suggest another local market to transfer to if needed (example logic)
            const suggested = LOCAL_MARKETS[Math.floor(Math.random() * LOCAL_MARKETS.length)];
            return (
              <div key={item.id} className="flex items-center justify-between p-4 bg-accent/5 rounded-lg">
                <div>
                  <p className="font-medium">{item.product_name}</p>
                  <p className="text-sm text-muted-foreground">{item.quantity} units • {daysLeft} days left</p>
                  <p className="text-sm text-muted-foreground">From: {item.source_supermarket ?? item.company_name ?? "Unknown"} • Suggested: {suggested}</p>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => handleAcceptTransfer(item.id, item.product_name)} className="bg-accent text-accent-foreground">Accept</Button>
                </div>
              </div>
            );
          })}

          {!pendingTransfers?.length && <p className="text-center text-muted-foreground py-6">No pending transfers</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Accepted Inventory</CardTitle>
          <CardDescription>Manage current stock</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(acceptedStock ?? []).map(item => {
            const daysLeft = Math.ceil((new Date(item.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            return (
              <div key={item.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                <div>
                  <p className="font-medium">{item.product_name}</p>
                  <p className="text-sm text-muted-foreground">{item.quantity} units • ₹{item.price_per_unit} • {daysLeft} days left</p>
                </div>
                <Button variant="outline" onClick={() => setSaleItem(item)}>Log Sale</Button>
              </div>
            );
          })}

          {!acceptedStock?.length && <p className="text-center text-muted-foreground py-6">No accepted stock yet</p>}
        </CardContent>
      </Card>

      <Dialog open={!!saleItem} onOpenChange={() => setSaleItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log Sale — {saleItem?.product_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 pt-2">
            <Input type="number" placeholder="Quantity sold" value={saleQty} onChange={(e) => setSaleQty(e.target.value)} />
            <Button className="w-full" onClick={handleLogSale}>Confirm Sale</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LocalMarketDashboard;
