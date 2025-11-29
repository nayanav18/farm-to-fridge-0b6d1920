import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, TrendingUp, Send, BarChart3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import PredictionChart from "@/components/PredictionChart";
import HistoricalSalesChart from "@/components/HistoricalSalesChart";
import DemandAnalysis from "@/components/DemandAnalysis";

const SupermarketDashboard = () => {
  const { toast } = useToast();
  const [selectedProduct, setSelectedProduct] = useState<string>("");
  const [transferQuantities, setTransferQuantities] = useState<{ [key: string]: number }>({});

  const { data: producerStock, refetch: refetchProducer } = useQuery({
    queryKey: ["producer-stock-supermarket"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("producer_stock")
        .select("*")
        .order("expiry_date", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: supermarketStock, refetch: refetchSupermarket } = useQuery({
    queryKey: ["supermarket-stock"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supermarket_stock")
        .select("*")
        .order("expiry_date", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const handleAcceptFromProducer = async (stockId: string, productName: string, quantity: number) => {
    const transferQty = transferQuantities[stockId] || quantity;
    
    if (transferQty > quantity) {
      toast({
        title: "Error",
        description: "Transfer quantity cannot exceed available stock",
        variant: "destructive",
      });
      return;
    }

    try {
      const stock = producerStock?.find(s => s.id === stockId);
      if (!stock) return;

      // Insert into supermarket stock
      const { error: insertError } = await supabase.from("supermarket_stock").insert({
        product_id: stock.product_id,
        product_name: stock.product_name,
        category: stock.category,
        company_name: stock.company_name,
        is_perishable: stock.is_perishable,
        shelf_life_days: stock.shelf_life_days,
        storage_temperature: stock.storage_temperature,
        lot_id: stock.lot_id,
        quantity: transferQty,
        manufacturing_date: stock.manufacturing_date,
        expiry_date: stock.expiry_date,
        price_per_unit: stock.price_per_unit,
        source_producer: stock.company_name,
      });

      if (insertError) throw insertError;

      // Update or delete from producer stock
      if (transferQty < quantity) {
        const { error: updateError } = await supabase
          .from("producer_stock")
          .update({ quantity_stocked: quantity - transferQty })
          .eq("id", stockId);
        if (updateError) throw updateError;
      } else {
        const { error: deleteError } = await supabase
          .from("producer_stock")
          .delete()
          .eq("id", stockId);
        if (deleteError) throw deleteError;
      }

      toast({
        title: "Stock Transferred",
        description: `${transferQty} units of ${productName} moved to supermarket.`,
      });

      refetchProducer();
      refetchSupermarket();
      setTransferQuantities((prev) => {
        const newState = { ...prev };
        delete newState[stockId];
        return newState;
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleShipToLocalMarket = async (stockId: string) => {
    try {
      const stock = supermarketStock?.find(s => s.id === stockId);
      if (!stock) return;

      const { error: insertError } = await supabase.from("localmarket_stock").insert({
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
        price_per_unit: stock.price_per_unit * 0.8, // Discounted price
        source_supermarket: "Supermarket",
      });

      if (insertError) throw insertError;

      const { error: deleteError } = await supabase
        .from("supermarket_stock")
        .delete()
        .eq("id", stockId);

      if (deleteError) throw deleteError;

      toast({
        title: "Shipped to Local Market",
        description: `${stock.product_name} transferred successfully.`,
      });

      refetchSupermarket();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const expiringItems = supermarketStock?.filter(item => {
    const today = new Date();
    const expiryDate = new Date(item.expiry_date);
    const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntilExpiry <= 7 && daysUntilExpiry >= 0;
  }).slice(0, 5);

  return (
    <div className="space-y-6">
      <Card className="border-secondary/20">
        <CardHeader className="bg-secondary/5">
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-secondary" />
            Historical Sales Overview
          </CardTitle>
          <CardDescription>Sales trends across all branches</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <HistoricalSalesChart />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <DemandAnalysis />
        <Card className="border-secondary/20">
          <CardHeader className="bg-secondary/5">
            <CardTitle>Producer Stock Available</CardTitle>
            <CardDescription>Accept stock from producers</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-3">
              {producerStock?.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                  <div className="flex-1">
                    <p className="font-medium">{item.product_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {item.company_name} • {item.quantity_stocked} units • ₹{item.price_per_unit}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Exp: {new Date(item.expiry_date).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="1"
                      max={item.quantity_stocked}
                      placeholder="Qty"
                      className="w-20"
                      value={transferQuantities[item.id] || ""}
                      onChange={(e) => setTransferQuantities({ ...transferQuantities, [item.id]: parseInt(e.target.value) || 0 })}
                    />
                    <Button
                      size="sm"
                      onClick={() => handleAcceptFromProducer(item.id, item.product_name, item.quantity_stocked)}
                    >
                      Accept
                    </Button>
                  </div>
                </div>
              ))}
              {!producerStock?.length && (
                <p className="text-center text-muted-foreground py-8">No stock available from producers</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-secondary/20">
          <CardHeader className="bg-secondary/5">
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-secondary" />
              Demand Prediction
            </CardTitle>
            <CardDescription>ML-powered sales forecasting</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a product for prediction" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from(new Set(supermarketStock?.map(item => item.product_name))).map((productName) => (
                    <SelectItem key={productName} value={productName}>
                      {productName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedProduct && <PredictionChart productName={selectedProduct} />}
            </div>
          </CardContent>
        </Card>
        </div>

        <div className="space-y-6">
        <Card className="border-danger/20">
          <CardHeader className="bg-danger/5">
            <CardTitle className="flex items-center gap-2 text-danger">
              <AlertTriangle className="h-5 w-5" />
              Expiring Soon
            </CardTitle>
            <CardDescription>Products expiring within 7 days</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-3">
              {expiringItems?.map((item) => {
                const daysLeft = Math.ceil((new Date(item.expiry_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                return (
                  <div key={item.id} className="p-3 bg-danger/5 border border-danger/20 rounded-lg space-y-2">
                    <div>
                      <p className="font-medium text-sm">{item.product_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.quantity} units • {daysLeft} days left
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full text-danger border-danger/20 hover:bg-danger/10"
                      onClick={() => handleShipToLocalMarket(item.id)}
                    >
                      <Send className="mr-2 h-3 w-3" />
                      Ship to Local Market
                    </Button>
                  </div>
                );
              })}
              {!expiringItems?.length && (
                <p className="text-center text-muted-foreground py-8 text-sm">No items expiring soon</p>
              )}
            </div>
          </CardContent>
        </Card>
        </div>
      </div>
    </div>
  );
};

export default SupermarketDashboard;