// SupermarketDashboard.tsx
import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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

import type { TablesInsert, Tables } from "@/integrations/supabase/types";

type SupermarketRow = Tables<"supermarket_stock">;
type LocalInsert = TablesInsert<"localmarket_stock">;

const LOCAL_MARKETS = ["Local Market A", "Local Market B"];

const SupermarketDashboard: React.FC = () => {
  const { toast } = useToast();
  const [sendItem, setSendItem] = useState<SupermarketRow | null>(null);
  const [chosenLocal, setChosenLocal] = useState<string>(LOCAL_MARKETS[0]);
  const [selectedProduct, setSelectedProduct] = useState<string>("");

  const { data: incoming = [], refetch: refetchIncoming } = useQuery<SupermarketRow[]>({
    queryKey: ["supermarket-incoming"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supermarket_stock")
        .select("*")
        .is("accepted_at", null)
        .order("transfer_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SupermarketRow[];
    },
  });

  const { data: inventory = [], refetch: refetchInventory } = useQuery<SupermarketRow[]>({
    queryKey: ["supermarket-accepted"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supermarket_stock")
        .select("*")
        .not("accepted_at", "is", null)
        .order("accepted_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SupermarketRow[];
    },
  });

  const handleAccept = async (id: string, name: string) => {
    const { error } = await supabase
      .from("supermarket_stock")
      .update({ accepted_at: new Date().toISOString() } as any)
      .eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Accepted", description: `${name} added to supermarket inventory` });
    // refresh both lists so incoming disappears and accepted list updates
    await refetchIncoming();
    await refetchInventory();
  };

  const handleReject = async (id: string, name: string) => {
    const { error } = await supabase.from("supermarket_stock").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Rejected", description: `${name} removed from incoming list.` });
    await refetchIncoming();
    await refetchInventory();
  };

  const openSendModal = (item: SupermarketRow) => {
    setSendItem(item);
    setChosenLocal(LOCAL_MARKETS[0]);
  };

  const confirmSendToLocal = async () => {
    if (!sendItem) return;
    const item = sendItem;
    const payload: LocalInsert = {
      product_id: item.product_id,
      product_name: item.product_name,
      category: item.category,
      company_name: chosenLocal,
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
      date: new Date().toISOString().slice(0, 10),
    };

    try {
      const insertRes = await supabase.from("localmarket_stock").insert([payload] as any);
      if ((insertRes as any)?.error) throw (insertRes as any).error;

      await supabase.from("supermarket_stock").delete().eq("id", item.id);

      toast({ title: "Shipped", description: `${item.product_name} sent to ${chosenLocal}` });
      setSendItem(null);
      await refetchIncoming();
      await refetchInventory();
    } catch (err: any) {
      toast({ title: "Error", description: err?.message ?? "Failed to ship", variant: "destructive" });
    }
  };

  const expiringSoon = useMemo(() => {
    const today = Date.now();
    return (inventory || []).filter((it) => {
      if (!it?.expiry_date) return false;
      const diff = (new Date(it.expiry_date).getTime() - today) / (1000 * 60 * 60 * 24);
      return diff >= 0 && diff <= 7;
    });
  }, [inventory]);

  const productList = Array.from(new Set((inventory || []).map((i) => i.product_name)));

  return (
    <div className="space-y-8 p-4">
      <Card>
        <CardHeader className="bg-primary/10">
          <CardTitle className="text-primary">Incoming Stock (Pending)</CardTitle>
          <CardDescription>Accept or reject stock transferred from the producer</CardDescription>
        </CardHeader>

        <CardContent className="space-y-3 pt-4">
          {(incoming || []).map((item) => (
            <div key={item.id} className="flex items-center justify-between p-4 rounded-lg bg-muted/40 border">
              <div>
                <p className="font-medium">{item.product_name}</p>
                <p className="text-sm text-muted-foreground">{item.quantity} units • {item.category}</p>
                <p className="text-xs text-muted-foreground">From Producer: {item.source_producer}</p>
              </div>

              <div className="flex gap-2">
                <Button variant="default" onClick={() => handleAccept(item.id, item.product_name)}>
                  <Check className="mr-1 h-4 w-4" /> Accept
                </Button>

                <Button variant="destructive" onClick={() => handleReject(item.id, item.product_name)}>
                  <X className="mr-1 h-4 w-4" /> Reject
                </Button>
              </div>
            </div>
          ))}

          {incoming?.length === 0 && <p className="text-center text-muted-foreground">No incoming stock</p>}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Accepted Inventory</CardTitle>
            </CardHeader>

            <CardContent className="space-y-3">
              {(inventory || []).map((item) => (
                <div key={item.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                  <div>
                    <p className="font-medium">{item.product_name}</p>
                    <p className="text-sm text-muted-foreground">{item.quantity} units • {item.category}</p>
                    <p className="text-xs text-muted-foreground">At: {item.company_name}</p>
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => openSendModal(item)}>
                      <Send className="mr-1 h-4 w-4" /> Ship to Local Market
                    </Button>
                  </div>
                </div>
              ))}

              {inventory?.length === 0 && <p className="text-center text-muted-foreground">No inventory available</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">Trending & Prediction</CardTitle>
              <CardDescription>Select a product to forecast demand</CardDescription>
            </CardHeader>

            <CardContent>
              <select className="w-full p-2 border rounded-md mb-4" value={selectedProduct} onChange={(e) => setSelectedProduct(e.target.value)}>
                <option value="">Select product</option>
                {productList.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>

              {selectedProduct && <PredictionChart productName={selectedProduct} />}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-danger/30">
            <CardHeader>
              <CardTitle className="text-danger flex items-center gap-2"><AlertTriangle className="h-5 w-5" /> Expiring Soon</CardTitle>
              <CardDescription>Items expiring within 7 days</CardDescription>
            </CardHeader>

            <CardContent className="space-y-3">
              {expiringSoon.map((item) => {
                const daysLeft = Math.ceil((new Date(item.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                return (
                  <div key={item.id} className="p-3 bg-danger/10 rounded-lg">
                    <p className="font-medium">{item.product_name}</p>
                    <p className="text-sm text-muted-foreground">{item.quantity} units • {daysLeft} days</p>
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => openSendModal(item)}>Send</Button>
                    </div>
                  </div>
                );
              })}

              {expiringSoon.length === 0 && <p className="text-center text-muted-foreground">No expiring products</p>}
            </CardContent>
          </Card>

          <DemandAnalysis data={inventory || []} />
        </div>
      </div>

      {/* Send modal (simple built-in) */}
      {sendItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSendItem(null)} />
          <div className="bg-white rounded-lg p-6 z-10 w-11/12 md:w-1/3">
            <h3 className="text-lg font-medium mb-3">Ship "{sendItem.product_name}"</h3>

            <label className="block text-sm mb-1">Choose Local Market</label>
            <select className="w-full p-2 border rounded mb-4" value={chosenLocal} onChange={(e) => setChosenLocal(e.target.value)}>
              {LOCAL_MARKETS.map((lm) => <option key={lm} value={lm}>{lm}</option>)}
            </select>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSendItem(null)}>Cancel</Button>
              <Button onClick={confirmSendToLocal}>Confirm & Ship</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupermarketDashboard;
