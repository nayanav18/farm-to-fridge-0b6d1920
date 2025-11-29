import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, ShoppingCart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

const LocalMarketDashboard = () => {
  const { toast } = useToast();

  const { data: pendingTransfers, refetch: refetchPending } = useQuery({
    queryKey: ["localmarket-pending"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("localmarket_stock")
        .select("*")
        .is("accepted_at", null)
        .order("transfer_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: acceptedStock, refetch: refetchAccepted } = useQuery({
    queryKey: ["localmarket-accepted"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("localmarket_stock")
        .select("*")
        .not("accepted_at", "is", null)
        .order("accepted_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
  });

  const handleAcceptTransfer = async (stockId: string, productName: string) => {
    try {
      const { error } = await supabase
        .from("localmarket_stock")
        .update({ accepted_at: new Date().toISOString() })
        .eq("id", stockId);

      if (error) throw error;

      toast({
        title: "Stock Accepted",
        description: `${productName} has been added to your inventory.`,
      });

      refetchPending();
      refetchAccepted();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-accent/20">
        <CardHeader className="bg-accent/5">
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-accent" />
            Pending Transfers
          </CardTitle>
          <CardDescription>Stock shipped from supermarkets awaiting acceptance</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="space-y-3">
            {pendingTransfers?.map((item) => {
              const daysLeft = Math.ceil((new Date(item.expiry_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
              return (
                <div key={item.id} className="flex items-center justify-between p-4 bg-accent/5 border border-accent/20 rounded-lg">
                  <div>
                    <p className="font-medium">{item.product_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {item.company_name} • {item.quantity} units • ₹{item.price_per_unit}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      From: {item.source_supermarket} • Exp: {daysLeft} days
                    </p>
                  </div>
                  <Button
                    onClick={() => handleAcceptTransfer(item.id, item.product_name)}
                    className="bg-accent hover:bg-accent/90"
                  >
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Accept
                  </Button>
                </div>
              );
            })}
            {!pendingTransfers?.length && (
              <p className="text-center text-muted-foreground py-8">No pending transfers</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-muted">
        <CardHeader>
          <CardTitle>Accepted Inventory</CardTitle>
          <CardDescription>Products currently in local market stock</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {acceptedStock?.map((item) => {
              const daysLeft = Math.ceil((new Date(item.expiry_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
              return (
                <div key={item.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                  <div>
                    <p className="font-medium">{item.product_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {item.quantity} units • ₹{item.price_per_unit} • {daysLeft} days left
                    </p>
                  </div>
                  <div className="text-sm text-success font-medium flex items-center gap-1">
                    <CheckCircle className="h-4 w-4" />
                    Accepted
                  </div>
                </div>
              );
            })}
            {!acceptedStock?.length && (
              <p className="text-center text-muted-foreground py-8">No accepted stock yet</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default LocalMarketDashboard;