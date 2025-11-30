import { useState, useMemo } from "react";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { CheckCircle, ShoppingCart, AlertTriangle } from "lucide-react";

/* --------------------------------------------
   MATCH EXACT Supabase Schema
-------------------------------------------- */

type LocalMarketStockRow = {
  id: string;
  date: string;
  product_id: number;
  product_name: string;
  category: string;
  company_name: string;
  is_perishable: boolean;
  shelf_life_days: number;
  storage_temperature: string;
  lot_id: string;
  quantity: number;
  manufacturing_date: string;
  expiry_date: string;
  price_per_unit: number;
  source_supermarket: string | null;
  transfer_date: string | null;
  accepted_at: string | null;
  created_at: string | null;
};

const OTHER_LOCAL_MARKETS = ["Local Market B", "Local Market C", "Local Market D"];

const LocalMarketDashboard = () => {
  const { toast } = useToast();

  /* --------------------------------------------
     GET PENDING TRANSFERS
  -------------------------------------------- */
  const { data: pendingTransfers, refetch: refetchPending } = useQuery({
    queryKey: ["localmarket-pending"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("localmarket_stock")
        .select("*")
        .is("accepted_at", null)
        .order("transfer_date", { ascending: false });

      if (error) throw error;
      return data as LocalMarketStockRow[];
    },
  });

  /* --------------------------------------------
     GET ACCEPTED STOCK
  -------------------------------------------- */
  const { data: acceptedStock, refetch: refetchAccepted } = useQuery({
    queryKey: ["localmarket-accepted"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("localmarket_stock")
        .select("*")
        .not("accepted_at", "is", null)
        .order("accepted_at", { ascending: false });

      if (error) throw error;
      return data as LocalMarketStockRow[];
    },
  });

  /* --------------------------------------------
     ACCEPT TRANSFER
  -------------------------------------------- */
  const handleAcceptTransfer = async (id: string, product: string) => {
    try {
      const { error } = await supabase
        .from("localmarket_stock")
        .update({ accepted_at: new Date().toISOString() })
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Transfer Accepted",
        description: `${product} added to your inventory.`,
      });

      refetchPending();
      refetchAccepted();
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  /* --------------------------------------------
     EXPIRING SOON (<= 3 days)
  -------------------------------------------- */
  const expiringSoon = useMemo(() => {
    if (!acceptedStock) return [];

    return acceptedStock.filter((item) => {
      const days =
        (new Date(item.expiry_date).getTime() - Date.now()) /
        (1000 * 60 * 60 * 24);

      return days >= 0 && days <= 3;
    });
  }, [acceptedStock]);

  /* --------------------------------------------
     SALE MODAL
  -------------------------------------------- */
  const [saleItem, setSaleItem] = useState<LocalMarketStockRow | null>(null);
  const [saleQty, setSaleQty] = useState("");

  const handleLogSale = async () => {
    if (!saleItem) return;

    const qty = Number(saleQty);

    if (qty <= 0 || qty > saleItem.quantity) {
      toast({
        title: "Invalid Quantity",
        description: "Enter a valid sale quantity.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Insert into localmarket_sales (not typed, so use any)
      await (supabase as any).from("localmarket_sales").insert([
        {
          product_id: saleItem.product_id,
          product_name: saleItem.product_name,
          quantity_sold: qty,
          price_each: saleItem.price_per_unit,
          revenue: qty * saleItem.price_per_unit,
          sale_date: new Date().toISOString(),
        },
      ]);

      const remaining = saleItem.quantity - qty;

      if (remaining > 0) {
        await supabase
          .from("localmarket_stock")
          .update({ quantity: remaining })
          .eq("id", saleItem.id);
      } else {
        await supabase.from("localmarket_stock").delete().eq("id", saleItem.id);
      }

      toast({
        title: "Sale Logged",
        description: `${qty} units sold.`,
      });

      setSaleItem(null);
      setSaleQty("");

      refetchAccepted();
    } catch (err: any) {
      toast({
        title: "Error logging sale",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  /* --------------------------------------------
     SEND EXPIRED ITEMS TO ANOTHER LOCAL MARKET
  -------------------------------------------- */
  const sendExpiringItem = async (
    item: LocalMarketStockRow,
    targetMarket: string
  ) => {
    try {
      await supabase.from("localmarket_stock").insert([
        {
          product_id: item.product_id,
          product_name: item.product_name,
          category: item.category,
          company_name: targetMarket,
          is_perishable: item.is_perishable,
          shelf_life_days: item.shelf_life_days,
          storage_temperature: item.storage_temperature,
          lot_id: item.lot_id,
          quantity: item.quantity,
          manufacturing_date: item.manufacturing_date,
          expiry_date: item.expiry_date,
          price_per_unit: item.price_per_unit,
          source_supermarket: item.company_name,
          transfer_date: new Date().toISOString(),
          accepted_at: null,
          date: new Date().toISOString(),
        },
      ]);

      // Remove from current market
      await supabase
        .from("localmarket_stock")
        .delete()
        .eq("id", item.id);

      toast({
        title: "Transferred",
        description: `${item.product_name} sent to ${targetMarket}.`,
      });

      refetchAccepted();
    } catch (err: any) {
      toast({
        title: "Transfer Failed",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  /* --------------------------------------------
     UI STARTS HERE
  -------------------------------------------- */

  return (
    <div className="space-y-6">

      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Total Items</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{acceptedStock?.length || 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Total Units</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {acceptedStock?.reduce((s, i) => s + i.quantity, 0) || 0}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Total Value</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              ₹
              {(
                acceptedStock?.reduce(
                  (s, i) => s + i.quantity * i.price_per_unit,
                  0
                ) || 0
              ).toFixed(2)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* EXPIRING SOON */}
      {expiringSoon.length > 0 && (
        <Card className="border-destructive bg-destructive/10">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Expiring Soon
            </CardTitle>
            <CardDescription>Transfer to another local market</CardDescription>
          </CardHeader>

          <CardContent className="space-y-3">
            {expiringSoon.map((item) => {
              const daysLeft =
                Math.ceil(
                  (new Date(item.expiry_date).getTime() - Date.now()) /
                    (1000 * 60 * 60 * 24)
                );

              return (
                <div
                  key={item.id}
                  className="p-3 rounded-lg bg-destructive/5 flex justify-between items-center"
                >
                  <div>
                    <p className="font-medium text-destructive">
                      {item.product_name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {daysLeft} days left
                    </p>
                  </div>

                  <div className="flex gap-2">
                    {OTHER_LOCAL_MARKETS.map((loc) => (
                      <Button
                        key={loc}
                        variant="outline"
                        onClick={() => sendExpiringItem(item, loc)}
                      >
                        Send to {loc}
                      </Button>
                    ))}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* PENDING TRANSFERS */}
      <Card>
        <CardHeader className="bg-primary/10">
          <CardTitle className="flex items-center gap-2 text-primary">
            <ShoppingCart className="h-5 w-5" />
            Pending Transfers
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-3 pt-4">
          {pendingTransfers?.map((item) => {
            const daysLeft =
              Math.ceil(
                (new Date(item.expiry_date).getTime() - Date.now()) /
                  (1000 * 60 * 60 * 24)
              );

            return (
              <div
                key={item.id}
                className="flex items-center justify-between p-4 rounded-lg bg-primary/5 border border-primary/20"
              >
                <div>
                  <p className="font-medium">{item.product_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {item.quantity} units • {daysLeft} days left
                  </p>
                </div>

                <Button
                  className="bg-primary text-primary-foreground"
                  onClick={() => handleAcceptTransfer(item.id, item.product_name)}
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Accept
                </Button>
              </div>
            );
          })}

          {!pendingTransfers?.length && (
            <p className="text-muted-foreground text-center">No pending transfers</p>
          )}
        </CardContent>
      </Card>

      {/* ACCEPTED INVENTORY */}
      <Card>
        <CardHeader>
          <CardTitle>Accepted Inventory</CardTitle>
        </CardHeader>

        <CardContent className="space-y-3">
          {acceptedStock?.map((item) => {
            const daysLeft =
              Math.ceil(
                (new Date(item.expiry_date).getTime() - Date.now()) /
                  (1000 * 60 * 60 * 24)
              );

            return (
              <div
                key={item.id}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/30"
              >
                <div>
                  <p className="font-medium">{item.product_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {item.quantity} units • ₹{item.price_per_unit} • {daysLeft} days left
                  </p>
                </div>

                <Button variant="outline" onClick={() => setSaleItem(item)}>
                  Log Sale
                </Button>
              </div>
            );
          })}

          {!acceptedStock?.length && (
            <p className="text-muted-foreground text-center py-6">
              No stock available
            </p>
          )}
        </CardContent>
      </Card>

      {/* SALE MODAL */}
      <Dialog open={!!saleItem} onOpenChange={() => setSaleItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log Sale - {saleItem?.product_name}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 pt-2">
            <Input
              type="number"
              placeholder="Quantity sold"
              value={saleQty}
              onChange={(e) => setSaleQty(e.target.value)}
            />

            <Button className="w-full" onClick={handleLogSale}>
              Confirm Sale
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LocalMarketDashboard;
