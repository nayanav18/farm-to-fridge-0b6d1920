// src/components/SupermarketDashboard.tsx
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

import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from "@/components/ui/select";

import { Button } from "@/components/ui/button";
import { AlertTriangle, Send, Check, X } from "lucide-react";

import PredictionChart from "@/components/PredictionChart";
import DemandAnalysis from "@/components/DemandAnalysis";

import type { Tables } from "@/integrations/supabase/types";

type SupermarketRow = Tables<"supermarket_stock">;
type LocalInsert = Tables<"localmarket_stock">;

const SUPERMARKETS = ["Supermarket A", "Supermarket B", "Supermarket C"];

export default function SupermarketDashboard() {
  const { toast } = useToast();
  const [selectedMarket, setSelectedMarket] = useState(SUPERMARKETS[0]);

  /* ----------------------------------------------
      FETCH INCOMING STOCK (pending)
  ------------------------------------------------ */
  const { data: incoming = [], refetch: refetchIncoming } = useQuery({
    queryKey: ["supermarket-incoming", selectedMarket],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supermarket_stock")
        .select("*")
        .eq("company_name", selectedMarket)
        .is("date", null) // incoming = no accepted date OR pending? (your schema has no accepted_at)
        .order("transfer_date", { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });

  /* ----------------------------------------------
      FETCH ACCEPTED INVENTORY
  ------------------------------------------------ */
  const { data: inventory = [], refetch: refetchInventory } = useQuery({
    queryKey: ["supermarket-inventory", selectedMarket],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supermarket_stock")
        .select("*")
        .eq("company_name", selectedMarket);

      if (error) throw error;
      return data || [];
    },
  });

  /* ----------------------------------------------
      ACCEPT ITEM
  ------------------------------------------------ */
  const handleAccept = async (id: string) => {
    const { error } = await supabase
      .from("supermarket_stock")
      .update({ date: new Date().toISOString() })
      .eq("id", id);

    if (!error) {
      toast({ title: "Accepted" });
      refetchIncoming();
      refetchInventory();
    }
  };

  /* ----------------------------------------------
      REJECT ITEM
  ------------------------------------------------ */
  const handleReject = async (id: string) => {
    const { error } = await supabase
      .from("supermarket_stock")
      .delete()
      .eq("id", id);

    if (!error) {
      toast({ title: "Rejected" });
      refetchIncoming();
      refetchInventory();
    }
  };

  /* ----------------------------------------------
      SHIP TO LOCAL MARKET
  ------------------------------------------------ */
  const handleShipToLocal = async (item: SupermarketRow) => {
    const payload = {
      product_id: item.product_id,
      product_name: item.product_name,
      category: item.category,
      company_name: selectedMarket,
      is_perishable: item.is_perishable,
      shelf_life_days: item.shelf_life_days,
      storage_temperature: item.storage_temperature,
      lot_id: item.lot_id,
      quantity: item.quantity,
      manufacturing_date: item.manufacturing_date,
      expiry_date: item.expiry_date,
      price_per_unit: item.price_per_unit,
      source_supermarket: selectedMarket,
      transfer_date: new Date().toISOString()
    } as LocalInsert;

    await supabase.from("localmarket_stock").insert([payload]);
    await supabase.from("supermarket_stock").delete().eq("id", item.id);

    toast({ title: "Shipped to Local Market" });
    refetchInventory();
  };

  /* ----------------------------------------------
      EXPIRING SOON
  ------------------------------------------------ */
  const expiringSoon = useMemo(() => {
    const now = Date.now();
    return inventory.filter((i) => {
      const diff =
        (new Date(i.expiry_date).getTime() - now) / (1000 * 60 * 60 * 24);
      return diff >= 0 && diff <= 7;
    });
  }, [inventory]);

  const productList = Array.from(
    new Set(inventory.map((i) => i.product_name))
  );

  const [selectedProduct, setSelectedProduct] = useState("");

  return (
    <div className="space-y-8 p-4">
      {/* ------------------------------------------
          MARKET SELECTOR
      ------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle>Select Supermarket</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedMarket} onValueChange={setSelectedMarket}>
            <SelectTrigger>
              <SelectValue placeholder="Select supermarket" />
            </SelectTrigger>
            <SelectContent>
              {SUPERMARKETS.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Incoming */}
      <Card>
        <CardHeader className="bg-primary/10">
          <CardTitle className="text-primary">Incoming Stock</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-4">
          {incoming.length === 0 && (
            <p className="text-muted-foreground text-center">No incoming stock</p>
          )}

          {incoming.map((item) => (
            <div key={item.id} className="p-4 bg-muted/40 border rounded flex justify-between">
              <div>
                <p className="font-semibold">{item.product_name}</p>
                <p className="text-xs text-muted-foreground">{item.quantity} units</p>
              </div>

              <div className="flex gap-2">
                <Button onClick={() => handleAccept(item.id)}>
                  <Check className="w-4 h-4 mr-1" /> Accept
                </Button>

                <Button variant="destructive" onClick={() => handleReject(item.id)}>
                  <X className="w-4 h-4 mr-1" /> Reject
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Accepted Inventory */}
      <Card>
        <CardHeader>
          <CardTitle>Accepted Inventory</CardTitle>
        </CardHeader>

        <CardContent className="space-y-3">
          {inventory.length === 0 && (
            <p className="text-muted-foreground text-center">
              No accepted inventory
            </p>
          )}

          {inventory.map((item) => (
            <div key={item.id} className="p-3 bg-muted/30 rounded flex justify-between">
              <div>
                <p>{item.product_name}</p>
                <p className="text-xs text-muted-foreground">
                  {item.quantity} units
                </p>
              </div>
              <Button variant="outline" onClick={() => handleShipToLocal(item)}>
                <Send className="w-4 h-4 mr-1" /> Ship to Local
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* EXPIRING SOON */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" />
            Expiring Soon
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-3">
          {expiringSoon.length === 0 && (
            <p className="text-center text-muted-foreground">No expiring items</p>
          )}

          {expiringSoon.map((item) => (
            <div key={item.id} className="p-3 bg-destructive/10 rounded">
              <p className="font-medium">{item.product_name}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* PREDICTION */}
      <Card>
        <CardHeader>
          <CardTitle>Trending & Prediction</CardTitle>
        </CardHeader>

        <CardContent>
          <Select value={selectedProduct} onValueChange={setSelectedProduct}>
            <SelectTrigger>
              <SelectValue placeholder="Select a product" />
            </SelectTrigger>
            <SelectContent>
              {productList.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedProduct && (
            <PredictionChart productName={selectedProduct} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
