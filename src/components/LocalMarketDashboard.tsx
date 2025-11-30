// LocalMarketDashboard - updated with "show which local market" for expiring
import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, ShoppingCart, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type LocalMarketRow = {
  id: string;
  product_name: string;
  product_id: number;
  category: string;
  company_name: string;
  quantity: number;
  expiry_date: string;
  price_per_unit: number;
  source_supermarket?: string | null;
  accepted_at?: string | null;
};

const LOCAL_MARKETS = ["Local Market A", "Local Market B"];

const LocalMarketDashboard: React.FC = () => {
  const { toast } = useToast();
  const [saleItem, setSaleItem] = useState<LocalMarketRow | null>(null);
  const [saleQty, setSaleQty] = useState("");

  const { data: pendingTransfers, refetch: refetchPending } = useQuery({
    queryKey: ["localmarket-pending"],
    queryFn: async () => {
      const { data, error } = await supabase.from("localmarket_stock").select("*").is("accepted_at", null).order("transfer_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: acceptedStock, refetch: refetchAccepted } = useQuery({
    queryKey: ["localmarket-accepted"],
    queryFn: async () => {
      const { data, error } = await supabase.from("localmarket_stock").select("*").not("accepted_at", "is", null).order("accepted_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const handleAcceptTransfer = async (id: string, productName: string) => {
    try {
      const { error } = await supabase.from("localmarket_stock").update({ accepted_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
      toast({ title: "Accepted", description: `${productName} added to inventory.` });
      refetchPending();
      refetchAccepted();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const expiringSoon = useMemo(() => {
    if (!acceptedStock) return [];
    return (acceptedStock || []).filter((i: any) => {
      const days = (new Date(i.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      return days >= 0 && days <= 3;
    });
  }, [acceptedStock]);

  const handleLogSale = async () => {
    if (!saleItem) return;
    const qty = Number(saleQty);
    if (qty <= 0 || qty > saleItem.quantity) {
      toast({ title: "Invalid qty", description: "Enter a valid quantity", variant: "destructive" });
      return;
    }

    try {
      const remaining = saleItem.quantity - qty;
      if (remaining > 0) {
        await supabase.from("localmarket_stock").update({ quantity: remaining }).eq("id", saleItem.id);
      } else {
        await supabase.from("localmarket_stock").delete().eq("id", saleItem.id);
      }
      toast({ title: "Sale logged", description: `${qty} units sold` });
      setSaleItem(null);
      setSaleQty("");
      refetchAccepted();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Total Items</CardTitle>
            <CardDescription>Accepted inventory count</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{(acceptedStock || []).length}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Total Units</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{(acceptedStock || []).reduce((s: number, i: any) => s + (i.quantity || 0), 0)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Total Value</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              ₹{((acceptedStock || []).reduce((s: number, i: any) => s + (i.quantity || 0) * Number(i.price_per_unit || 0), 0)).toFixed(2)}
            </p>
          </CardContent>
        </Card>
      </div>

      {expiringSoon.length > 0 && (
        <Card className="border-destructive bg-destructive/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive"><AlertTriangle className="h-5 w-5" /> Expiring Soon</CardTitle>
            <CardDescription>Consider shipping to another local market</CardDescription>
          </CardHeader>
          <CardContent>
            {expiringSoon.map((it: any) => {
              const daysLeft = Math.ceil((new Date(it.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
              return (
                <div key={it.id} className="flex items-center justify-between p-3 rounded-md bg-destructive/5">
                  <div>
                    <p className="font-medium text-destructive">{it.product_name}</p>
                    <p className="text-xs text-muted-foreground">{it.quantity} units • {daysLeft} days</p>
                  </div>

                  <div className="flex gap-2">
                    {/* quick UI to show "which other local markets" you can ship to */}
                    {LOCAL_MARKETS.map((lm) => (
                      <Button key={lm} size="sm" variant="outline" onClick={async () => {
                        try {
                          // clone row with new source_supermarket
                          const payload = {
                            product_id: it.product_id,
                            product_name: it.product_name,
                            category: it.category,
                            company_name: it.company_name,
                            is_perishable: it.is_perishable,
                            shelf_life_days: it.shelf_life_days,
                            storage_temperature: it.storage_temperature,
                            lot_id: it.lot_id,
                            quantity: it.quantity,
                            manufacturing_date: it.manufacturing_date,
                            expiry_date: it.expiry_date,
                            price_per_unit: it.price_per_unit,
                            source_supermarket: it.source_supermarket || it.company_name,
                            transfer_date: new Date().toISOString(),
                            created_at: new Date().toISOString(),
                          };
                          const { error: insertError } = await supabase.from("localmarket_stock").insert([payload]);
                          if (insertError) throw insertError;

                          // delete original row
                          await supabase.from("localmarket_stock").delete().eq("id", it.id);

                          toast({ title: "Shipped", description: `Sent ${it.product_name} to ${lm}` });
                        } catch (err: any) {
                          toast({ title: "Error", description: err?.message ?? "Failed", variant: "destructive" });
                        }
                      }}>{lm}</Button>
                    ))}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="bg-primary/10">
          <CardTitle className="flex items-center gap-2 text-primary"><ShoppingCart className="h-5 w-5" /> Pending Transfers</CardTitle>
          <CardDescription>Accept or review incoming stock</CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          {(pendingTransfers || []).length === 0 ? (
            <p className="text-center text-muted-foreground py-6">No pending transfers</p>
          ) : (
            (pendingTransfers || []).map((p: any) => (
              <div key={p.id} className="flex items-center justify-between p-3 bg-primary/5 rounded-md">
                <div>
                  <p className="font-medium">{p.product_name}</p>
                  <p className="text-xs text-muted-foreground">{p.quantity} units • ₹{p.price_per_unit}</p>
                  <p className="text-xs text-muted-foreground">From: {p.source_supermarket}</p>
                </div>
                <div className="flex gap-2">
                  <Button className="bg-primary text-primary-foreground" onClick={() => handleAcceptTransfer(p.id, p.product_name)}><CheckCircle className="h-4 w-4 mr-2" />Accept</Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Accepted Inventory</CardTitle>
          <CardDescription>Manage available stock</CardDescription>
        </CardHeader>
        <CardContent>
          {(acceptedStock || []).length === 0 ? (
            <p className="text-center text-muted-foreground py-6">No stock available</p>
          ) : (
            (acceptedStock || []).map((a: any) => (
              <div key={a.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-md">
                <div>
                  <p className="font-medium">{a.product_name}</p>
                  <p className="text-xs text-muted-foreground">{a.quantity} units • ₹{a.price_per_unit}</p>
                </div>
                <Button variant="outline" onClick={() => { setSaleItem(a); }}>{`Log Sale`}</Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={!!saleItem} onOpenChange={() => setSaleItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log Sale – {saleItem?.product_name}</DialogTitle>
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
