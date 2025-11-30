import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Upload, Package } from "lucide-react";

const initialForm = {
  product_id: "",
  product_name: "",
  category: "",
  quantity_stocked: "",
  price_per_unit: "",
  manufacturing_date: "",
  expiry_date: "",
  storage_temperature: "",
  company_name: "",
  lot_id: "",
  shelf_life_days: "",
  is_perishable: false,
};

export const ProducerDashboard = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState(initialForm);

  // -----------------------------------
  // FETCH PRODUCER STOCK
  // -----------------------------------
  const { data: producerStock = [], isLoading } = useQuery({
    queryKey: ["producer-stock"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("producer_stock")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  // -----------------------------------
  // INSERT STOCK
  // -----------------------------------
  const uploadMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        product_id: Number(formData.product_id),
        product_name: formData.product_name,
        category: formData.category,
        company_name: formData.company_name,
        expiry_date: formData.expiry_date,
        lot_id: formData.lot_id,
        manufacturing_date: formData.manufacturing_date,
        price_per_unit: Number(formData.price_per_unit),
        quantity_stocked: Number(formData.quantity_stocked),
        shelf_life_days: Number(formData.shelf_life_days),
        stock_batch_quantity: Number(formData.quantity_stocked),
        storage_temperature: formData.storage_temperature,
        is_perishable: formData.is_perishable,
        date: new Date().toISOString(),
      };

      const { error } = await supabase.from("producer_stock").insert([payload]);

      if (error) throw error;
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["producer-stock"] });
      toast({ title: "Stock uploaded successfully!" });
      setFormData(initialForm);
    },

    onError: () => {
      toast({
        title: "Upload failed",
        description: "Check all fields & try again.",
        variant: "destructive",
      });
    },
  });

  const submitForm = (e: React.FormEvent) => {
    e.preventDefault();
    uploadMutation.mutate();
  };

  // -----------------------------------
  // UI
  // -----------------------------------
  return (
    <div className="space-y-6">
      
      {/* UPLOAD FORM */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload Stock
          </CardTitle>
        </CardHeader>

        <CardContent>
          <form onSubmit={submitForm} className="grid grid-cols-2 gap-4">

            <div>
              <Label>Product ID</Label>
              <Input
                type="number"
                required
                value={formData.product_id}
                onChange={(e) => setFormData({ ...formData, product_id: e.target.value })}
              />
            </div>

            <div>
              <Label>Product Name</Label>
              <Input
                required
                value={formData.product_name}
                onChange={(e) => setFormData({ ...formData, product_name: e.target.value })}
              />
            </div>

            <div>
              <Label>Category</Label>
              <Input
                required
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              />
            </div>

            <div>
              <Label>Quantity</Label>
              <Input
                type="number"
                required
                value={formData.quantity_stocked}
                onChange={(e) =>
                  setFormData({ ...formData, quantity_stocked: e.target.value })
                }
              />
            </div>

            <div>
              <Label>Price per Unit</Label>
              <Input
                type="number"
                required
                value={formData.price_per_unit}
                onChange={(e) =>
                  setFormData({ ...formData, price_per_unit: e.target.value })
                }
              />
            </div>

            <div>
              <Label>Lot ID</Label>
              <Input
                required
                value={formData.lot_id}
                onChange={(e) => setFormData({ ...formData, lot_id: e.target.value })}
              />
            </div>

            <div>
              <Label>Shelf Life (days)</Label>
              <Input
                type="number"
                required
                value={formData.shelf_life_days}
                onChange={(e) =>
                  setFormData({ ...formData, shelf_life_days: e.target.value })
                }
              />
            </div>

            <div>
              <Label>Manufacturing Date</Label>
              <Input
                type="date"
                required
                value={formData.manufacturing_date}
                onChange={(e) =>
                  setFormData({ ...formData, manufacturing_date: e.target.value })
                }
              />
            </div>

            <div>
              <Label>Expiry Date</Label>
              <Input
                type="date"
                required
                value={formData.expiry_date}
                onChange={(e) =>
                  setFormData({ ...formData, expiry_date: e.target.value })
                }
              />
            </div>

            <div>
              <Label>Storage Temperature</Label>
              <Input
                required
                value={formData.storage_temperature}
                onChange={(e) =>
                  setFormData({ ...formData, storage_temperature: e.target.value })
                }
              />
            </div>

            <div>
              <Label>Company Name</Label>
              <Input
                required
                value={formData.company_name}
                onChange={(e) =>
                  setFormData({ ...formData, company_name: e.target.value })
                }
              />
            </div>

            <div className="col-span-2">
              <Label className="mr-2">Is Perishable?</Label>
              <input
                type="checkbox"
                checked={formData.is_perishable}
                onChange={(e) =>
                  setFormData({ ...formData, is_perishable: e.target.checked })
                }
              />
            </div>

            <div className="col-span-2">
              <Button className="w-full" type="submit">
                {uploadMutation.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Upload Stock
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* TABLE */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Stock History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead>Company</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {producerStock.map((item: any) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.product_name}</TableCell>
                      <TableCell>{item.quantity_stocked}</TableCell>
                      <TableCell>₹{item.price_per_unit}</TableCell>
                      <TableCell>{new Date(item.expiry_date).toLocaleDateString()}</TableCell>
                      <TableCell>{item.company_name}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
