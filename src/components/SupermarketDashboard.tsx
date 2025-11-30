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

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

import { AlertTriangle, Send, TrendingUp } from "lucide-react";

import PredictionChart from "@/components/PredictionChart";
import DemandAnalysis from "@/components/DemandAnalysis";

import type {
  Tables,
  TablesInsert,
  TablesUpdate,
} from "@/integrations/supabase/types";

type ProducerRow = Tables<"producer_stock">;
type SupermarketRow = Tables<"supermarket_stock">;
type LocalInsert = TablesInsert<"localmarket_stock">;
type SupermarketInsert = TablesInsert<"supermarket_stock">;
type ProducerUpdate = TablesUpdate<"producer_stock">;

const SUPERMARKETS = ["Supermarket A", "Supermarket B", "Supermarket C"];
const LOCAL_MARKETS = ["Local Market A", "Local Market B"];

const SupermarketDashboard: React.FC = () => {
  const { toast } = useToast();

  const [selectedProduct, setSelectedProduct] = useState<string>("");
  const [transferQuantities, setTransferQuantities] = useState<
    Record<string, number>
  >({});

  /** Per-item supermarket selector storage */
  const [marketSelection, setMarketSelection] = useState<
    Record<string, string>
  >({});

  /* ---------------------------------------------
     FETCH PRODUCER STOCK
  --------------------------------------------- */
  const { data: producerStock, refetch: refetchProducer } = useQuery<
    ProducerRow[]
  >({
    queryKey: ["producer-stock"],
    queryFn: async () => {
      const res = await supabase
        .from("producer_stock")
        .select("*")
        .order("expiry_date", { ascending: true });

      return ((res as any)?.data ?? []) as ProducerRow[];
    },
  });

  /* ---------------------------------------------
     FETCH SUPERMARKET STOCK
  --------------------------------------------- */
  const { data: supermarketStock, refetch: refetchSupermarket } = useQuery<
    SupermarketRow[]
  >({
    queryKey: ["supermarket-stock"],
    queryFn: async () => {
      const res = await supabase
        .from("supermarket_stock")
        .select("*")
        .order("expiry_date", { ascending: true });

      return ((res as any)?.data ?? []) as SupermarketRow[];
    },
  });

  /* ---------------------------------------------
     EXPIRING SOON LIST
  --------------------------------------------- */
  const expiringItems = useMemo(() => {
    const today = new Date();

    return (supermarketStock ?? [])
      .filter((item) => {
        if (!item.expiry_date) return false;
        const diff =
          (new Date(item.expiry_date).getTime() - today.getTime()) /
          (1000 * 60 * 60 * 24);
        return diff >= 0 && diff <= 7;
      })
      .slice(0, 5);
  }, [supermarketStock]);

  /* ---------------------------------------------
     ACCEPT FROM PRODUCER
  --------------------------------------------- */
  const handleAcceptFromProducer = async (
    stockId: string,
    productName: string,
    availableQty: number
  ) => {
    const qty = transferQuantities[stockId] ?? availableQty;

    if (qty <= 0 || qty > availableQty) {
      toast({
        title: "Invalid Quantity",
        description: "Enter a valid quantity.",
        variant: "destructive",
      });
      return;
    }

    const chosenMarket = marketSelection[stockId];
    if (!chosenMarket) {
      toast({
        title: "Select Supermarket",
        description: "Please choose the receiving supermarket.",
        variant: "destructive",
      });
      return;
    }

    const stock = (producerStock ?? []).find((s) => s.id === stockId);
    if (!stock) return;

    const payload: SupermarketInsert = {
      product_id: stock.product_id,
      product_name: stock.product_name,
      category: stock.category,
      company_name: chosenMarket,
      is_perishable: stock.is_perishable,
      shelf_life_days: stock.shelf_life_days,
      storage_temperature: stock.storage_temperature,
      lot_id: stock.lot_id,
      quantity: qty,
      manufacturing_date: stock.manufacturing_date,
      expiry_date: stock.expiry_date,
      price_per_unit: Number(stock.price_per_unit),
      source_producer: stock.company_name,
      transfer_date: new Date().toISOString(),
    };

    try {
      const insertRes = await supabase
        .from("supermarket_stock")
        .insert([payload] as unknown as SupermarketInsert[]);

      if ((insertRes as any)?.error) throw (insertRes as any).error;

      if (qty < stock.quantity_stocked) {
        await supabase
          .from("producer_stock")
          .update({
            quantity_stocked: stock.quantity_stocked - qty,
          } as ProducerUpdate)
          .eq("id", stockId);
      } else {
        await supabase.from("producer_stock").delete().eq("id", stockId);
      }

      toast({
        title: "Stock Accepted",
        description: `${qty} units of ${productName} were transferred.`,
      });

      refetchProducer();
      refetchSupermarket();
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.message ?? "Failed to accept stock",
        variant: "destructive",
      });
    }
  };

  /* ---------------------------------------------
     SHIP TO LOCAL MARKET
  --------------------------------------------- */
  const handleShipToLocalMarket = async (stockId: string) => {
    const stock = (supermarketStock ?? []).find((s) => s.id === stockId);
    if (!stock) return;

    const payload: LocalInsert = {
      product_id: stock.product_id,
      product_name: stock.product_name,
      category: stock.category,
      company_name: stock.company_name,
      is_perishable: stock.is_perishable,
      shelf_life_days: stock.shelf_life_days,
      storage_temperature: stock.storage_temperature,
      lot_id: stock.lot_id,
      quantity: stock.quantity,
      manufacturing_date: stock.manufacturing_date,
      expiry_date: stock.expiry_date,
      price_per_unit: Number(stock.price_per_unit) * 0.8,
      source_supermarket: stock.company_name,
      transfer_date: new Date().toISOString(),
    };

    try {
      const insertRes = await supabase
        .from("localmarket_stock")
        .insert([payload] as unknown as LocalInsert[]);

      if ((insertRes as any)?.error) throw (insertRes as any).error;

      await supabase.from("supermarket_stock").delete().eq("id", stockId);

      toast({
        title: "Shipped",
        description: `${stock.product_name} moved to local market.`,
      });

      refetchSupermarket();
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.message ?? "Shipping failed",
        variant: "destructive",
      });
    }
  };

  /* ---------------------------------------------
     PRODUCT LIST FOR DEMAND PREDICTION
  --------------------------------------------- */
  const productList = useMemo(() => {
    const set = new Set<string>();
    (supermarketStock ?? []).forEach((i) => set.add(i.product_name));
    return Array.from(set);
  }, [supermarketStock]);

  /* ====================================================================
     UI
  ===================================================================== */

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT SIDE */}
        <div className="lg:col-span-2 space-y-6">
          <DemandAnalysis />

          {/* PRODUCER STOCK SECTION */}
          <Card>
            <CardHeader>
              <CardTitle>Producer Stock Available</CardTitle>
              <CardDescription>Select supermarket & accept stock</CardDescription>
            </CardHeader>

            <CardContent>
              {(producerStock ?? []).map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-4 bg-muted/30 rounded-lg mb-3"
                >
                  {/* Info */}
                  <div>
                    <p className="font-medium">{item.product_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {item.company_name} • {item.quantity_stocked} units • ₹
                      {item.price_per_unit}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Exp:{" "}
                      {item.expiry_date
                        ? new Date(item.expiry_date).toLocaleDateString()
                        : "N/A"}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {/* PER-ITEM SUPERMARKET SELECTOR */}
                    <Select
                      value={marketSelection[item.id] ?? ""}
                      onValueChange={(v) =>
                        setMarketSelection((p) => ({ ...p, [item.id]: v }))
                      }
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue placeholder="Supermarket" />
                      </SelectTrigger>
                      <SelectContent>
                        {SUPERMARKETS.map((m) => (
                          <SelectItem key={m} value={m}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Quantity */}
                    <Input
                      type="number"
                      className="w-20"
                      min={1}
                      max={item.quantity_stocked}
                      value={transferQuantities[item.id] ?? ""}
                      onChange={(e) =>
                        setTransferQuantities((prev) => ({
                          ...prev,
                          [item.id]: parseInt(e.target.value) || 0,
                        }))
                      }
                    />

                    {/* Accept Button */}
                    <Button
                      size="sm"
                      onClick={() =>
                        handleAcceptFromProducer(
                          item.id,
                          item.product_name,
                          item.quantity_stocked
                        )
                      }
                    >
                      Accept
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* DEMAND PREDICTION */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" /> Demand Prediction
              </CardTitle>
              <CardDescription>Select product to forecast demand</CardDescription>
            </CardHeader>

            <CardContent>
              <Select
                value={selectedProduct}
                onValueChange={setSelectedProduct}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select product" />
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

        {/* RIGHT SIDE - EXPIRING SOON */}
        <div className="space-y-6">
          <Card className="border-danger/30">
            <CardHeader>
              <CardTitle className="text-danger flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" /> Expiring Soon
              </CardTitle>
              <CardDescription>Items expiring within 7 days</CardDescription>
            </CardHeader>

            <CardContent>
              {(expiringItems ?? []).map((item) => {
                const daysLeft = Math.ceil(
                  (new Date(item.expiry_date).getTime() - Date.now()) /
                    (1000 * 60 * 60 * 24)
                );

                return (
                  <div
                    key={item.id}
                    className="p-3 border border-danger/30 bg-danger/10 rounded-lg space-y-2"
                  >
                    <p className="font-medium text-sm">{item.product_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.quantity} units • {daysLeft} days left
                    </p>

                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full text-danger border-danger/30"
                      onClick={() => handleShipToLocalMarket(item.id)}
                    >
                      <Send className="h-3 w-3 mr-2" /> Ship to Local Market
                    </Button>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default SupermarketDashboard;

